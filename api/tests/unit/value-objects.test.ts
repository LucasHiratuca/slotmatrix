import { describe, expect, it } from 'vitest';
import { TimeSlot } from '../../src/scheduling/domain/value-objects/TimeSlot';
import { Money } from '../../src/catalog/domain/value-objects/Money';
import { TurnaroundBuffer } from '../../src/catalog/domain/value-objects/TurnaroundBuffer';
import { CancellationPolicyRule } from '../../src/catalog/domain/value-objects/CancellationPolicyRule';
import { ResourceCapabilitySet } from '../../src/catalog/domain/value-objects/ResourceCapabilitySet';
import { WorkspaceSlug } from '../../src/tenancy/domain/value-objects/WorkspaceSlug';
import { PlanQuota } from '../../src/billing/domain/value-objects/PlanQuota';
import { SafeWebhookUrl } from '../../src/shared/domain/SafeWebhookUrl';
import { UnsafeWebhookUrlError, ValidationError } from '../../src/shared/domain/errors';

describe('TimeSlot (semi-open interval [startAt, endAt) & buffers)', () => {
  const d = (iso: string) => new Date(iso);

  it('validates endAt > startAt and computes durationMinutes', () => {
    const slot = TimeSlot.create(d('2026-06-01T14:00:00Z'), d('2026-06-01T15:00:00Z'));
    expect(slot.durationMinutes()).toBe(60);
    expect(() => TimeSlot.create(d('2026-06-01T15:00:00Z'), d('2026-06-01T15:00:00Z'))).toThrow(ValidationError);
    expect(() => TimeSlot.create(d('2026-06-01T16:00:00Z'), d('2026-06-01T15:00:00Z'))).toThrow(ValidationError);
  });

  it('handles edge boundaries without false collision (14:00-15:00 does NOT overlap 15:00-16:00)', () => {
    const a = TimeSlot.create(d('2026-06-01T14:00:00Z'), d('2026-06-01T15:00:00Z'));
    const b = TimeSlot.create(d('2026-06-01T15:00:00Z'), d('2026-06-01T16:00:00Z'));
    const c = TimeSlot.create(d('2026-06-01T14:45:00Z'), d('2026-06-01T15:30:00Z'));
    expect(a.overlapsWith(b)).toBe(false);
    expect(b.overlapsWith(a)).toBe(false);
    expect(a.overlapsWith(c)).toBe(true);
    expect(b.overlapsWith(c)).toBe(true);
  });

  it('expands asymmetrically with prepMinutes and cleanupMinutes (sterilization turnaround)', () => {
    const service = TimeSlot.create(d('2026-06-01T14:00:00Z'), d('2026-06-01T15:00:00Z'));
    const roomEffective = service.expandWithBuffers(10, 20);
    expect(roomEffective.startAt.toISOString()).toBe('2026-06-01T13:50:00.000Z');
    expect(roomEffective.endAt.toISOString()).toBe('2026-06-01T15:20:00.000Z');
    expect(roomEffective.durationMinutes()).toBe(90);

    // Next appointment at 15:00 collides with the room's 20m sterilization buffer!
    const nextService = TimeSlot.create(d('2026-06-01T15:00:00Z'), d('2026-06-01T16:00:00Z'));
    expect(roomEffective.overlapsWith(nextService)).toBe(true);
  });
});

describe('Money (exact integer cents)', () => {
  it('supports exact integer arithmetic and percentage without floating point drift', () => {
    const deposit = Money.create(15000, 'BRL'); // R$ 150,00
    const half = deposit.percentage(50);
    expect(half.amountCents).toBe(7500);
    expect(deposit.subtract(half).amountCents).toBe(7500);
    expect(half.add(half).equals(deposit)).toBe(true);
  });

  it('rejects floats, negative amounts and mismatched currencies', () => {
    expect(() => Money.create(10.5)).toThrow(ValidationError);
    expect(() => Money.create(-100)).toThrow(ValidationError);
    expect(() => Money.create(100, 'BRL').add(Money.create(100, 'USD'))).toThrow(ValidationError);
  });
});

describe('TurnaroundBuffer', () => {
  it('validates non-negative integer prep and cleanup minutes', () => {
    const b = TurnaroundBuffer.create(5, 20);
    expect(b.totalExtraMinutes).toBe(25);
    expect(() => TurnaroundBuffer.create(-1, 10)).toThrow(ValidationError);
    expect(() => TurnaroundBuffer.create(0, 500)).toThrow(ValidationError);
  });
});

describe('CancellationPolicyRule (SecurityDeposit retention tiers)', () => {
  const rule = CancellationPolicyRule.standard(); // >=24h full refund, 6h..24h 50% retained, <6h 100% retained
  const deposit = Money.create(20000, 'BRL'); // R$ 200,00
  const startAt = new Date('2026-06-02T14:00:00Z');

  it('refunds 100% when cancelled >= 24h in advance', () => {
    const out = rule.evaluateCancellation(deposit, startAt, new Date('2026-06-01T12:00:00Z'));
    expect(out.tier).toBe('FULL_REFUND');
    expect(out.retained.amountCents).toBe(0);
    expect(out.refunded.amountCents).toBe(20000);
  });

  it('retains 50% when cancelled between 6h and 24h before start', () => {
    const out = rule.evaluateCancellation(deposit, startAt, new Date('2026-06-02T02:00:00Z')); // 12h before
    expect(out.tier).toBe('PARTIAL_RETENTION');
    expect(out.retained.amountCents).toBe(10000);
    expect(out.refunded.amountCents).toBe(10000);
  });

  it('retains 100% when cancelled < 6h before start or on NO_SHOW', () => {
    const late = rule.evaluateCancellation(deposit, startAt, new Date('2026-06-02T11:00:00Z')); // 3h before
    expect(late.tier).toBe('FULL_RETENTION');
    expect(late.retained.amountCents).toBe(20000);
    expect(late.refunded.amountCents).toBe(0);

    const noShow = rule.evaluateNoShow(deposit);
    expect(noShow.tier).toBe('NO_SHOW_RETENTION');
    expect(noShow.retained.amountCents).toBe(20000);
  });
});

describe('ResourceCapabilitySet, WorkspaceSlug, PlanQuota & SafeWebhookUrl', () => {
  it('normalizes capabilities and checks subset qualification', () => {
    const owned = ResourceCapabilitySet.create(['Dermatology', 'Laser CO2', 'biopsy']);
    const reqOk = ResourceCapabilitySet.create(['dermatology', 'laser-co2']);
    const reqFail = ResourceCapabilitySet.create(['mri-3t']);
    expect(owned.satisfies(reqOk)).toBe(true);
    expect(owned.satisfies(reqFail)).toBe(false);
  });

  it('encodes SlotMatrix STARTER, PRO and ENTERPRISE quotas', () => {
    const starter = PlanQuota.forPlan('STARTER');
    expect([starter.maxActiveResources, starter.maxBookingsPerMonth, starter.smartWaitlistEnabled, starter.securityDepositEnabled]).toEqual([5, 100, false, false]);
    const pro = PlanQuota.forPlan('PRO');
    expect([pro.maxActiveResources, pro.maxBookingsPerMonth, pro.smartWaitlistEnabled, pro.securityDepositEnabled, pro.publicBookingPortalEnabled]).toEqual([40, null, true, true, true]);
    const ent = PlanQuota.forPlan('ENTERPRISE');
    expect([ent.maxActiveResources, ent.vipWaitlistPriorityEnabled, ent.exportableAuditLogs]).toEqual([null, true, true]);
  });

  it('normalizes WorkspaceSlug and blocks SSRF webhook targets', () => {
    expect(WorkspaceSlug.fromName('VitaScan Diagnósticos!').value).toBe('vitascan-diagnosticos');
    expect(() => WorkspaceSlug.create('book')).toThrow(ValidationError);
    expect(SafeWebhookUrl.create('https://hooks.example.com/slotmatrix').hostname).toBe('hooks.example.com');
    expect(() => SafeWebhookUrl.create('http://127.0.0.1:8080/hook')).toThrow(UnsafeWebhookUrlError);
    expect(() => SafeWebhookUrl.create('http://169.254.169.254/latest/meta-data')).toThrow(UnsafeWebhookUrlError);
    expect(() => SafeWebhookUrl.create('http://192.168.1.10/internal')).toThrow(UnsafeWebhookUrlError);
  });
});
