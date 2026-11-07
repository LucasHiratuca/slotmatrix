import { describe, expect, it } from 'vitest';
import { MultiResourceAvailabilityDomainService } from '../../src/scheduling/domain/services/MultiResourceAvailabilityDomainService';
import { BookableResource } from '../../src/catalog/domain/aggregates/BookableResource';
import { ServiceProcedure } from '../../src/catalog/domain/aggregates/ServiceProcedure';
import { CanRegisterResourceSpecification } from '../../src/catalog/domain/specifications/CanRegisterResourceSpecification';
import { CanUseSmartWaitlistSpecification } from '../../src/scheduling/domain/specifications/CanUseSmartWaitlistSpecification';
import { TimeSlot } from '../../src/scheduling/domain/value-objects/TimeSlot';
import { TenantId } from '../../src/shared/domain/UniqueEntityId';
import { FeatureNotEntitledError, QuotaExceededError } from '../../src/shared/domain/errors';
import { WorkspaceEntitlements } from '../../src/scheduling/domain/WorkspaceEntitlementPolicy';

const now = new Date('2026-06-01T08:00:00Z');
const tenantId = TenantId.from('tenant-vitascan');

function buildTripletScenario() {
  const doctor = BookableResource.create({
    tenantId,
    name: 'Dr. Marcos (Cardio/Eco)',
    category: 'SPECIALIST',
    capabilities: ['echocardiogram', 'doppler'],
    now,
  });
  const room = BookableResource.create({
    tenantId,
    name: 'Sala de Exame 01',
    category: 'ROOM',
    capabilities: ['cardio-bed', 'sterile'],
    now,
  });
  const equipment = BookableResource.create({
    tenantId,
    name: 'Ultrassom GE Vivid',
    category: 'EQUIPMENT',
    capabilities: ['doppler', '4d-probe'],
    now,
  });

  // Procedure: 60 min service; SPECIALIST has 0/0 buffer; ROOM has 0 prep + 20m sterilization; EQUIPMENT has 5m prep + 10m calibration
  const procedure = ServiceProcedure.create({
    tenantId,
    name: 'Ecocardiograma com Doppler',
    durationMinutes: 60,
    priceCents: 65000,
    depositCents: 15000,
    requirements: [
      { category: 'SPECIALIST', requiredCapabilities: ['echocardiogram', 'doppler'], prepMinutes: 0, cleanupMinutes: 0 },
      { category: 'ROOM', requiredCapabilities: ['cardio-bed', 'sterile'], prepMinutes: 0, cleanupMinutes: 20 },
      { category: 'EQUIPMENT', requiredCapabilities: ['doppler'], prepMinutes: 5, cleanupMinutes: 10 },
    ],
    now,
  });

  return { doctor, room, equipment, procedure };
}

describe('MultiResourceAvailabilityDomainService (asymmetric buffers & multi-resource intersection)', () => {
  const svc = new MultiResourceAvailabilityDomainService();

  it('allocates all 3 resources with their individual effectiveOccupiedSlots when free', () => {
    const { doctor, room, equipment, procedure } = buildTripletScenario();
    const slot14To15 = TimeSlot.create(new Date('2026-06-02T14:00:00Z'), new Date('2026-06-02T15:00:00Z'));

    const res = svc.allocateResourcesForSlot({
      procedure,
      serviceSlot: slot14To15,
      candidateResources: [doctor, room, equipment],
      existingHolds: [],
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.allocations).toHaveLength(3);

    const specAlloc = res.allocations.find((a) => a.category === 'SPECIALIST')!;
    const roomAlloc = res.allocations.find((a) => a.category === 'ROOM')!;
    const eqAlloc = res.allocations.find((a) => a.category === 'EQUIPMENT')!;

    expect(specAlloc.effectiveOccupiedSlot.endAt.toISOString()).toBe('2026-06-02T15:00:00.000Z');
    expect(roomAlloc.effectiveOccupiedSlot.endAt.toISOString()).toBe('2026-06-02T15:20:00.000Z'); // +20m sterilization
    expect(eqAlloc.effectiveOccupiedSlot.startAt.toISOString()).toBe('2026-06-02T13:55:00.000Z'); // -5m prep
    expect(eqAlloc.effectiveOccupiedSlot.endAt.toISOString()).toBe('2026-06-02T15:10:00.000Z'); // +10m cleanup
  });

  it('CRITICAL PROOF: blocks 15:00 slot when SPECIALIST is free at 15:00 but ROOM is still in 20m sterilization until 15:20', () => {
    const { doctor, room, equipment, procedure } = buildTripletScenario();
    const firstSlot = TimeSlot.create(new Date('2026-06-02T14:00:00Z'), new Date('2026-06-02T15:00:00Z'));
    const firstAlloc = svc.allocateResourcesForSlot({
      procedure,
      serviceSlot: firstSlot,
      candidateResources: [doctor, room, equipment],
      existingHolds: [],
    });
    expect(firstAlloc.ok).toBe(true);
    if (!firstAlloc.ok) return;

    const existingHolds = firstAlloc.allocations.map((a) => ({
      resourceId: a.resourceId,
      effectiveOccupiedSlot: a.effectiveOccupiedSlot,
    }));

    // Attempt at 15:00: Doctor is free at 15:00, but Room is sterilizing until 15:20 and Equipment requires 5m prep (14:55) + cleanup until 15:10!
    const slot15To16 = TimeSlot.create(new Date('2026-06-02T15:00:00Z'), new Date('2026-06-02T16:00:00Z'));
    const blockedAt15 = svc.allocateResourcesForSlot({
      procedure,
      serviceSlot: slot15To16,
      candidateResources: [doctor, room, equipment],
      existingHolds,
    });
    expect(blockedAt15.ok).toBe(false);

    // Attempt at 15:15: Room still sterilizing until 15:20 -> still blocked!
    const slot1515 = TimeSlot.create(new Date('2026-06-02T15:15:00Z'), new Date('2026-06-02T16:15:00Z'));
    expect(
      svc.allocateResourcesForSlot({
        procedure,
        serviceSlot: slot1515,
        candidateResources: [doctor, room, equipment],
        existingHolds,
      }).ok,
    ).toBe(false);

    // Attempt at 15:20: Room finishes sterilization at 15:20, Equipment 5m prep starts at 15:15 (after its 15:10 cleanup) -> ALLOWED!
    const slot1520 = TimeSlot.create(new Date('2026-06-02T15:20:00Z'), new Date('2026-06-02T16:20:00Z'));
    const allowedAt1520 = svc.allocateResourcesForSlot({
      procedure,
      serviceSlot: slot1520,
      candidateResources: [doctor, room, equipment],
      existingHolds,
    });
    expect(allowedAt1520.ok).toBe(true);
  });

  it('automatically switches to a second qualified ROOM at 15:00 if Room 01 is sterilizing', () => {
    const { doctor, room, equipment, procedure } = buildTripletScenario();
    const room2 = BookableResource.create({
      tenantId,
      name: 'Sala de Exame 02',
      category: 'ROOM',
      capabilities: ['cardio-bed', 'sterile'],
      now,
    });
    const eq2 = BookableResource.create({
      tenantId,
      name: 'Ultrassom GE Vivid #2',
      category: 'EQUIPMENT',
      capabilities: ['doppler'],
      now,
    });

    const firstSlot = TimeSlot.create(new Date('2026-06-02T14:00:00Z'), new Date('2026-06-02T15:00:00Z'));
    const first = svc.allocateResourcesForSlot({
      procedure,
      serviceSlot: firstSlot,
      candidateResources: [doctor, room, equipment],
      existingHolds: [],
    });
    if (!first.ok) throw new Error('expected ok');

    const slot15 = TimeSlot.create(new Date('2026-06-02T15:00:00Z'), new Date('2026-06-02T16:00:00Z'));
    const second = svc.allocateResourcesForSlot({
      procedure,
      serviceSlot: slot15,
      candidateResources: [doctor, room, room2, equipment, eq2],
      existingHolds: first.allocations,
    });
    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.allocations.find((a) => a.category === 'ROOM')!.resourceName).toBe('Sala de Exame 02');
      expect(second.allocations.find((a) => a.category === 'EQUIPMENT')!.resourceName).toBe('Ultrassom GE Vivid #2');
    }
  });
});

describe('Plan Specifications (CanRegisterResourceSpecification & CanUseSmartWaitlistSpecification)', () => {
  const starter: WorkspaceEntitlements = {
    subscriptionHealthy: true,
    maxActiveResources: 5,
    maxBookingsPerMonth: 100,
    smartWaitlistEnabled: false,
    securityDepositEnabled: false,
    publicBookingPortalEnabled: false,
    vipWaitlistPriorityEnabled: false,
    exportableAuditLogs: false,
    planLabel: 'STARTER',
  };
  const pro: WorkspaceEntitlements = {
    ...starter,
    maxActiveResources: 40,
    maxBookingsPerMonth: null,
    smartWaitlistEnabled: true,
    securityDepositEnabled: true,
    publicBookingPortalEnabled: true,
    planLabel: 'PRO',
  };

  it('blocks 6th BookableResource on STARTER with QuotaExceededError', () => {
    const spec = new CanRegisterResourceSpecification();
    expect(spec.isSatisfiedBy({ entitlements: starter, currentActiveResourceCount: 4 })).toBe(true);
    expect(() => spec.assertSatisfiedBy({ entitlements: starter, currentActiveResourceCount: 5 })).toThrow(QuotaExceededError);
  });

  it('blocks Smart Waitlist on STARTER and VIP Priority on PRO with FeatureNotEntitledError', () => {
    const wlSpec = new CanUseSmartWaitlistSpecification();
    expect(() => wlSpec.assertSatisfiedBy(starter)).toThrow(FeatureNotEntitledError);
    expect(wlSpec.isSatisfiedBy(pro)).toBe(true);
    expect(() => wlSpec.assertSatisfiedBy(pro, { requestVipPriority: true })).toThrow(FeatureNotEntitledError);
  });
});
