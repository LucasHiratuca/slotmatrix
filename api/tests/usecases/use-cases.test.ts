import { describe, expect, it } from 'vitest';
import { billingEvent, makeHarness, registerTenant, upgradeTenant } from '../support/harness';
import {
  FeatureNotEntitledError,
  InvalidStateTransitionError,
  QuotaExceededError,
  ResourceAllocationConflictError,
} from '../../src/shared/domain/errors';

describe('SlotMatrix Application Use Cases & Reactive Smart Waitlist Cascade', () => {
  it('STARTER plan enforces 5 BookableResources quota and blocks SecurityDeposit / SmartWaitlist features', async () => {
    const h = makeHarness();
    const t = await registerTenant(h, 'Estúdio Aura');

    for (let i = 1; i <= 5; i++) {
      await h.c.catalog.createResource.execute({
        tenantId: t.workspaceId,
        name: `Recurso ${i}`,
        category: i <= 2 ? 'SPECIALIST' : i <= 4 ? 'ROOM' : 'EQUIPMENT',
        capabilities: ['basic'],
      });
    }

    await expect(
      h.c.catalog.createResource.execute({
        tenantId: t.workspaceId,
        name: 'Recurso 6 (Acima da Quota)',
        category: 'ROOM',
      }),
    ).rejects.toBeInstanceOf(QuotaExceededError);

    // STARTER blocks SecurityDeposit > 0
    await expect(
      h.c.catalog.createProcedure.execute({
        tenantId: t.workspaceId,
        name: 'Procedimento com Sinal',
        durationMinutes: 60,
        priceCents: 30000,
        depositCents: 10000,
        requirements: [{ category: 'SPECIALIST' }],
      }),
    ).rejects.toBeInstanceOf(FeatureNotEntitledError);

    const procNoDeposit = await h.c.catalog.createProcedure.execute({
      tenantId: t.workspaceId,
      name: 'Procedimento Simples',
      durationMinutes: 60,
      priceCents: 30000,
      depositCents: 0,
      requirements: [{ category: 'SPECIALIST', requiredCapabilities: ['basic'] }],
    });

    // STARTER blocks Smart Waitlist
    await expect(
      h.c.scheduling.joinWaitlist.execute({
        tenantId: t.workspaceId,
        procedureId: procNoDeposit.id.value,
        clientName: 'Cliente Espera',
        clientEmail: 'espera@cliente.test',
        desiredStartAt: new Date('2026-06-02T08:00:00Z'),
        desiredEndAt: new Date('2026-06-02T18:00:00Z'),
      }),
    ).rejects.toBeInstanceOf(FeatureNotEntitledError);
  });

  it('prevents double-booking when ANY of the 3 required resources (or its sterilization buffer) overlaps', async () => {
    const h = makeHarness();
    const t = await registerTenant(h, 'VitaScan');
    await upgradeTenant(h, t.workspaceId, 'PRO');

    await h.c.catalog.createResource.execute({
      tenantId: t.workspaceId,
      name: 'Dra. Sofia',
      category: 'SPECIALIST',
      capabilities: ['laser-co2'],
    });
    await h.c.catalog.createResource.execute({
      tenantId: t.workspaceId,
      name: 'Sala Cirúrgica 01',
      category: 'ROOM',
      capabilities: ['sterile-room'],
    });
    await h.c.catalog.createResource.execute({
      tenantId: t.workspaceId,
      name: 'Laser Fracionado CO2',
      category: 'EQUIPMENT',
      capabilities: ['laser-co2'],
    });

    const proc = await h.c.catalog.createProcedure.execute({
      tenantId: t.workspaceId,
      name: 'Laser CO2 Completo',
      durationMinutes: 60,
      priceCents: 90000,
      depositCents: 20000,
      requirements: [
        { category: 'SPECIALIST', requiredCapabilities: ['laser-co2'], prepMinutes: 0, cleanupMinutes: 0 },
        { category: 'ROOM', requiredCapabilities: ['sterile-room'], prepMinutes: 0, cleanupMinutes: 20 },
        { category: 'EQUIPMENT', requiredCapabilities: ['laser-co2'], prepMinutes: 0, cleanupMinutes: 15 },
      ],
    });

    // First booking 14:00 -> 15:00 (Room occupied until 15:20!)
    const b1 = await h.c.scheduling.scheduleBooking.execute({
      tenantId: t.workspaceId,
      procedureId: proc.id.value,
      startAt: new Date('2026-06-02T14:00:00Z'),
      clientName: 'Paciente 1',
      clientEmail: 'p1@test.dev',
    });
    expect(b1.status).toBe('PENDING_DEPOSIT');
    await h.c.scheduling.confirmDeposit.execute({ tenantId: t.workspaceId, bookingId: b1.id.value });

    // Second booking at 15:00 must fail with ResourceAllocationConflictError because Room is sterilizing until 15:20
    await expect(
      h.c.scheduling.scheduleBooking.execute({
        tenantId: t.workspaceId,
        procedureId: proc.id.value,
        startAt: new Date('2026-06-02T15:00:00Z'),
        clientName: 'Paciente 2',
        clientEmail: 'p2@test.dev',
      }),
    ).rejects.toBeInstanceOf(ResourceAllocationConflictError);

    // At 15:20 all 3 resources are free -> succeeds
    const b2 = await h.c.scheduling.scheduleBooking.execute({
      tenantId: t.workspaceId,
      procedureId: proc.id.value,
      startAt: new Date('2026-06-02T15:20:00Z'),
      clientName: 'Paciente 2',
      clientEmail: 'p2@test.dev',
    });
    expect(b2.allocations).toHaveLength(3);
  });

  it('FULL REACTIVE FLOW: Cancel Booking -> Auto-Offer to 1st Waitlist Entry -> Expire Offer Cascade to 2nd Entry -> Claim Offer into new Booking', async () => {
    const h = makeHarness();
    const t = await registerTenant(h, 'VitaScan Pro');
    await upgradeTenant(h, t.workspaceId, 'PRO');

    await h.c.scheduling.createWebhookChannel.execute({
      tenantId: t.workspaceId,
      name: 'WhatsApp / CRM Hook',
      url: 'https://hooks.example.com/waitlist',
      secret: 'slotmatrix-secret-123',
    });

    await h.c.catalog.createResource.execute({
      tenantId: t.workspaceId,
      name: 'Dr. Eduardo',
      category: 'SPECIALIST',
      capabilities: ['endo'],
    });
    await h.c.catalog.createResource.execute({
      tenantId: t.workspaceId,
      name: 'Sala Endoscopia',
      category: 'ROOM',
      capabilities: ['endo-room'],
    });

    const proc = await h.c.catalog.createProcedure.execute({
      tenantId: t.workspaceId,
      name: 'Endoscopia Digestiva',
      durationMinutes: 60,
      priceCents: 75000,
      depositCents: 20000,
      requirements: [
        { category: 'SPECIALIST', requiredCapabilities: ['endo'], prepMinutes: 0, cleanupMinutes: 0 },
        { category: 'ROOM', requiredCapabilities: ['endo-room'], prepMinutes: 5, cleanupMinutes: 15 },
      ],
    });

    // Original booking at 2026-06-02 14:00..15:00
    const original = await h.c.scheduling.scheduleBooking.execute({
      tenantId: t.workspaceId,
      procedureId: proc.id.value,
      startAt: new Date('2026-06-02T14:00:00Z'),
      clientName: 'Cliente Original',
      clientEmail: 'orig@test.dev',
    });
    await h.c.scheduling.confirmDeposit.execute({ tenantId: t.workspaceId, bookingId: original.id.value });

    // Two patients join the waitlist for that afternoon
    const w1 = await h.c.scheduling.joinWaitlist.execute({
      tenantId: t.workspaceId,
      procedureId: proc.id.value,
      clientName: 'Primeiro da Fila',
      clientEmail: 'primeiro@test.dev',
      desiredStartAt: new Date('2026-06-02T13:00:00Z'),
      desiredEndAt: new Date('2026-06-02T17:00:00Z'),
    });
    h.clock.advance(1000);
    const w2 = await h.c.scheduling.joinWaitlist.execute({
      tenantId: t.workspaceId,
      procedureId: proc.id.value,
      clientName: 'Segundo da Fila',
      clientEmail: 'segundo@test.dev',
      desiredStartAt: new Date('2026-06-02T13:00:00Z'),
      desiredEndAt: new Date('2026-06-02T17:00:00Z'),
    });

    // Advance clock to 10 hours before start (partial retention tier: 50% of R$ 200 = R$ 100 retained)
    h.clock.set(new Date('2026-06-02T04:00:00Z'));
    const cancelled = await h.c.scheduling.cancelBooking.execute({
      tenantId: t.workspaceId,
      bookingId: original.id.value,
      actorId: t.userId,
      reason: 'Imprevisto de viagem',
    });
    expect(cancelled.status).toBe('CANCELLED');
    expect(cancelled.retainedCents).toBe(10000);
    expect(cancelled.refundedCents).toBe(10000);

    // 1st waitlist entry automatically received SlotOffer!
    const w1AfterCancel = await h.infra.waitlist.findById(t.workspaceId, w1.id.value);
    const w2AfterCancel = await h.infra.waitlist.findById(t.workspaceId, w2.id.value);
    expect(w1AfterCancel!.status).toBe('OFFERED');
    expect(w2AfterCancel!.status).toBe('WAITING');
    expect(h.notifications.sent).toHaveLength(1);
    expect(h.notifications.sent[0].payload.clientEmail).toBe('primeiro@test.dev');

    // While w1 holds the active SlotOffer, an outsider cannot steal the 14:00 slot
    await expect(
      h.c.scheduling.scheduleBooking.execute({
        tenantId: t.workspaceId,
        procedureId: proc.id.value,
        startAt: new Date('2026-06-02T14:00:00Z'),
        clientName: 'Outsider',
        clientEmail: 'out@test.dev',
      }),
    ).rejects.toBeInstanceOf(ResourceAllocationConflictError);

    // 35 minutes pass: w1 does not claim -> ExpireWaitlistOfferUseCase triggers cascade to w2!
    h.clock.advance(35 * 60_000);
    await expect(
      h.c.scheduling.claimWaitlistOffer.execute({ tenantId: t.workspaceId, waitlistEntryId: w1.id.value }),
    ).rejects.toBeInstanceOf(InvalidStateTransitionError);

    await h.c.scheduling.expireWaitlistOffer.execute({ tenantId: t.workspaceId, waitlistEntryId: w1.id.value });

    const w1Expired = await h.infra.waitlist.findById(t.workspaceId, w1.id.value);
    const w2Offered = await h.infra.waitlist.findById(t.workspaceId, w2.id.value);
    expect(w1Expired!.status).toBe('OFFER_EXPIRED');
    expect(w2Offered!.status).toBe('OFFERED');
    expect(h.notifications.sent).toHaveLength(2);
    expect(h.notifications.sent[1].payload.clientEmail).toBe('segundo@test.dev');

    // w2 claims the offer within TTL -> converted atomically into a Booking!
    h.clock.advance(5 * 60_000);
    const claimed = await h.c.scheduling.claimWaitlistOffer.execute({
      tenantId: t.workspaceId,
      waitlistEntryId: w2.id.value,
    });
    expect(claimed.entry.status).toBe('CLAIMED');
    expect(claimed.booking.originWaitlistEntryId).toBe(w2.id.value);
    await h.c.scheduling.confirmDeposit.execute({ tenantId: t.workspaceId, bookingId: claimed.booking.id.value });

    const kpis = await h.c.queries.kpis.execute(t.workspaceId);
    expect(kpis.protectedRevenueCents).toBe(10000);
    expect(kpis.waitlistRecoveredBookings).toBe(1);
    expect(kpis.waitlistRecoveredRevenueCents).toBe(75000);
  });

  it('downgrade reconciles active resources above the new plan quota', async () => {
    const h = makeHarness();
    const t = await registerTenant(h, 'Downgrade Clinic');
    await upgradeTenant(h, t.workspaceId, 'PRO');
    for (let i = 1; i <= 7; i++) {
      await h.c.catalog.createResource.execute({
        tenantId: t.workspaceId,
        name: `Res ${i}`,
        category: 'ROOM',
      });
      h.clock.advance(1000);
    }
    expect(await h.infra.resources.countActiveByTenant(t.workspaceId)).toBe(7);

    const cancelEv = billingEvent('evt_cancel_sub', 'customer.subscription.deleted', t.workspaceId);
    await h.c.billing.processWebhook.execute({ command: h.c.acl.translate(JSON.parse(cancelEv.body))!, rawPayload: cancelEv });

    expect(await h.infra.resources.countActiveByTenant(t.workspaceId)).toBe(5);
    const all = await h.infra.resources.listByTenant(t.workspaceId);
    expect(all.filter((r) => r.status === 'ARCHIVED')).toHaveLength(2);
  });

  it('reschedules a confirmed booking to a new viable time slot without self-collision', async () => {
    const h = makeHarness();
    const t = await registerTenant(h, 'Reschedule Clinic');
    await upgradeTenant(h, t.workspaceId, 'PRO');

    const dr = await h.c.catalog.createResource.execute({
      tenantId: t.workspaceId,
      name: 'Dr. Lucas',
      category: 'SPECIALIST',
      capabilities: ['USG'],
    });
    const room = await h.c.catalog.createResource.execute({
      tenantId: t.workspaceId,
      name: 'Sala 01',
      category: 'ROOM',
      capabilities: ['USG'],
    });
    const eq = await h.c.catalog.createResource.execute({
      tenantId: t.workspaceId,
      name: 'Aparelho USG',
      category: 'EQUIPMENT',
      capabilities: ['USG'],
    });

    const proc = await h.c.catalog.createProcedure.execute({
      tenantId: t.workspaceId,
      name: 'Ultrassom Geral',
      durationMinutes: 40,
      priceCents: 50000,
      depositCents: 10000,
      requirements: [
        { category: 'SPECIALIST', requiredCapabilities: ['USG'] },
        { category: 'ROOM', requiredCapabilities: ['USG'], cleanupMinutes: 10 },
        { category: 'EQUIPMENT', requiredCapabilities: ['USG'] },
      ],
    });

    const originalSlot = new Date('2026-06-05T09:00:00Z');
    const booking = await h.c.scheduling.scheduleBooking.execute({
      tenantId: t.workspaceId,
      procedureId: proc.id.value,
      startAt: originalSlot,
      clientName: 'Roberto Almeida',
      clientEmail: 'roberto@paciente.test',
    });

    // Confirm deposit
    await h.c.scheduling.confirmDeposit.execute({
      tenantId: t.workspaceId,
      bookingId: booking.id.value,
    });

    // Reschedule to 11:00 on the same day
    const newSlot = new Date('2026-06-05T11:00:00Z');
    const rescheduled = await h.c.scheduling.rescheduleBooking.execute({
      tenantId: t.workspaceId,
      bookingId: booking.id.value,
      startAt: newSlot,
    });

    expect(rescheduled.serviceSlot.startAt.toISOString()).toBe(newSlot.toISOString());
    expect(rescheduled.status).toBe('CONFIRMED');
    expect(rescheduled.allocations).toHaveLength(3);

    // Old slot is now free
    const checkOldSlot = await h.c.queries.availableSlots.execute({
      tenantId: t.workspaceId,
      procedureId: proc.id.value,
      from: new Date('2026-06-05T08:30:00Z'),
      to: new Date('2026-06-05T10:00:00Z'),
      stepMinutes: 30,
    });
    const foundOldSlot = checkOldSlot.availableSlots.some(
      (s) => new Date(s.startAt).getTime() === originalSlot.getTime(),
    );
    expect(foundOldSlot).toBe(true);
  });
});
