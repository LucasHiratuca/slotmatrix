import { describe, expect, it } from 'vitest';
import { Booking } from '../../src/scheduling/domain/aggregates/Booking';
import { WaitlistEntry } from '../../src/scheduling/domain/aggregates/WaitlistEntry';
import { BookableResource } from '../../src/catalog/domain/aggregates/BookableResource';
import { ServiceProcedure } from '../../src/catalog/domain/aggregates/ServiceProcedure';
import { Workspace } from '../../src/tenancy/domain/aggregates/Workspace';
import { Subscription } from '../../src/billing/domain/aggregates/Subscription';
import { TimeSlot } from '../../src/scheduling/domain/value-objects/TimeSlot';
import { Money } from '../../src/catalog/domain/value-objects/Money';
import { CancellationPolicyRule } from '../../src/catalog/domain/value-objects/CancellationPolicyRule';
import { TenantId, UniqueEntityId } from '../../src/shared/domain/UniqueEntityId';
import { InvalidStateTransitionError, LastOwnerRemovalError, ValidationError } from '../../src/shared/domain/errors';

const t0 = new Date('2026-06-01T10:00:00Z');
const slot14 = TimeSlot.create(new Date('2026-06-02T14:00:00Z'), new Date('2026-06-02T15:00:00Z'));

function makeBooking(requireDepositPayment = true) {
  return Booking.schedule({
    tenantId: TenantId.from('tenant-1'),
    procedureId: UniqueEntityId.from('proc-1'),
    procedureName: 'Laser CO2 Resurfacing',
    clientName: 'Carla Paciente',
    clientEmail: 'carla@paciente.test',
    serviceSlot: slot14,
    allocations: [
      {
        resourceId: 'res-spec',
        resourceName: 'Dra. Helena',
        category: 'SPECIALIST',
        serviceSlot: slot14,
        prepMinutes: 0,
        cleanupMinutes: 0,
        effectiveOccupiedSlot: slot14,
      },
      {
        resourceId: 'res-room',
        resourceName: 'Sala Laser 01',
        category: 'ROOM',
        serviceSlot: slot14,
        prepMinutes: 10,
        cleanupMinutes: 20,
        effectiveOccupiedSlot: slot14.expandWithBuffers(10, 20),
      },
    ],
    priceCents: 80000,
    depositAmount: Money.create(20000, 'BRL'),
    requireDepositPayment,
    cancellationPolicy: CancellationPolicyRule.standard(),
    now: t0,
  });
}

describe('Booking Aggregate Root', () => {
  it('starts PENDING_DEPOSIT when deposit is required and transitions PENDING_DEPOSIT -> CONFIRMED -> CHECKED_IN -> COMPLETED', () => {
    const b = makeBooking(true);
    expect(b.status).toBe('PENDING_DEPOSIT');
    expect(b.depositStatus).toBe('PENDING');
    expect(() => b.checkIn(t0)).toThrow(InvalidStateTransitionError);

    b.confirmDeposit(new Date(t0.getTime() + 5 * 60_000));
    expect(b.status).toBe('CONFIRMED');
    expect(b.depositStatus).toBe('PAID');

    b.checkIn(new Date('2026-06-02T13:55:00Z'));
    expect(b.status).toBe('CHECKED_IN');

    b.complete(new Date('2026-06-02T15:00:00Z'));
    expect(b.status).toBe('COMPLETED');
    expect(() => b.cancel(new Date('2026-06-02T15:05:00Z'), 'u1', 'too late')).toThrow(InvalidStateTransitionError);
  });

  it('computes 50% retention on late cancellation (12h before start) and emits BookingCancelledDomainEvent', () => {
    const b = makeBooking(true);
    b.confirmDeposit(t0);
    b.pullDomainEvents();

    // Cancelled 12h before 2026-06-02T14:00:00Z
    b.cancel(new Date('2026-06-02T02:00:00Z'), 'actor-1', 'Patient had an emergency');
    expect(b.status).toBe('CANCELLED');
    expect(b.depositStatus).toBe('PARTIALLY_RETAINED');
    expect(b.retainedCents).toBe(10000);
    expect(b.refundedCents).toBe(10000);

    const events = b.pullDomainEvents();
    expect(events.map((e) => e.name)).toEqual(['BookingCancelled']);
  });

  it('prevents marking NO_SHOW before the scheduled start time and forfeits 100% of deposit after start', () => {
    const b = makeBooking(true);
    b.confirmDeposit(t0);
    expect(() => b.markAsNoShow(new Date('2026-06-02T13:50:00Z'), 'coord-1')).toThrow(InvalidStateTransitionError);

    b.markAsNoShow(new Date('2026-06-02T14:15:00Z'), 'coord-1');
    expect(b.status).toBe('NO_SHOW');
    expect(b.depositStatus).toBe('FORFEITED');
    expect(b.retainedCents).toBe(20000);
    expect(b.refundedCents).toBe(0);
  });

  it('protects allocations collection from external mutation', () => {
    const b = makeBooking(false);
    (b.allocations as unknown as unknown[]).pop();
    expect(b.allocations).toHaveLength(2);
  });
});

describe('WaitlistEntry Aggregate Root', () => {
  const window = TimeSlot.create(new Date('2026-06-02T12:00:00Z'), new Date('2026-06-02T18:00:00Z'));

  it('issues SlotOffer with TTL, allows claim before expiration and rejects claim after expiration', () => {
    const entry = WaitlistEntry.join({
      tenantId: TenantId.from('t-1'),
      procedureId: UniqueEntityId.from('proc-1'),
      clientName: 'Bruno Fila',
      clientEmail: 'bruno@fila.test',
      desiredWindow: window,
      now: t0,
    });
    expect(entry.matchesSlot('proc-1', slot14)).toBe(true);

    entry.issueSlotOffer(slot14, ['res-spec', 'res-room'], 30, t0);
    expect(entry.status).toBe('OFFERED');
    expect(entry.pullDomainEvents().map((e) => e.name)).toEqual(['WaitlistSlotOffered']);

    // Claim after 31 minutes fails
    expect(() => entry.claimOffer('booking-99', new Date(t0.getTime() + 31 * 60_000))).toThrow(InvalidStateTransitionError);

    // Claim within 10 minutes succeeds
    entry.claimOffer('booking-99', new Date(t0.getTime() + 10 * 60_000));
    expect(entry.status).toBe('CLAIMED');
    expect(entry.claimedBookingId).toBe('booking-99');
  });

  it('emits WaitlistOfferExpiredDomainEvent when an offer expires unclaimed', () => {
    const entry = WaitlistEntry.join({
      tenantId: TenantId.from('t-1'),
      procedureId: UniqueEntityId.from('proc-1'),
      clientName: 'Bruno Fila',
      clientEmail: 'bruno@fila.test',
      desiredWindow: window,
      now: t0,
    });
    entry.issueSlotOffer(slot14, ['res-spec', 'res-room'], 30, t0);
    entry.pullDomainEvents();

    entry.expireOffer(new Date(t0.getTime() + 31 * 60_000));
    expect(entry.status).toBe('OFFER_EXPIRED');
    expect(entry.pullDomainEvents().map((e) => e.name)).toEqual(['WaitlistOfferExpired']);
  });
});

describe('BookableResource, ServiceProcedure, Workspace & Subscription Aggregates', () => {
  it('BookableResource checks operational hours and maintenance blocks', () => {
    const r = BookableResource.create({
      tenantId: TenantId.from('t-1'),
      name: 'Sala 01',
      category: 'ROOM',
      capabilities: ['sterile', 'laser-co2'],
      now: t0,
    });
    expect(r.isOperationalDuring(slot14)).toBe(true);
    r.addMaintenanceBlock(TimeSlot.create(new Date('2026-06-02T14:30:00Z'), new Date('2026-06-02T16:00:00Z')), 'UV sterilization');
    expect(r.isOperationalDuring(slot14)).toBe(false);
  });

  it('ServiceProcedure requires at least one resource requirement and deposit <= price', () => {
    expect(() =>
      ServiceProcedure.create({
        tenantId: TenantId.from('t-1'),
        name: 'Bad Proc',
        durationMinutes: 60,
        priceCents: 10000,
        depositCents: 20000,
        requirements: [{ category: 'SPECIALIST' }],
        now: t0,
      }),
    ).toThrow(ValidationError);
  });

  it('Workspace prevents removing the last OWNER and Subscription starts on STARTER trial', () => {
    const ws = Workspace.create({ name: 'Estúdio Aura', ownerId: 'u-1', now: t0 });
    expect(() => ws.removeMember('u-1', 'u-1', t0)).toThrow(LastOwnerRemovalError);
    const sub = Subscription.startTrial({ tenantId: ws.id, now: t0 });
    expect([sub.plan, sub.status]).toEqual(['STARTER', 'TRIALING']);
    sub.activate(t0, { plan: 'PRO' });
    expect(sub.plan).toBe('PRO');
    sub.cancel(t0);
    expect([sub.plan, sub.status]).toEqual(['STARTER', 'CANCELED']);
  });
});
