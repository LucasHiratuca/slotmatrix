import { describe, expect, it } from 'vitest';
import { makeHarness } from '../support/harness';
import { seedDemoData } from '../../src/seed';
import { QuotaExceededError } from '../../src/shared/domain/errors';

describe('Deterministic Demo Seed (Estúdio Aura STARTER & VitaScan Diagnósticos PRO)', () => {
  it('seeds both workspaces and enforces 5/5 quota on Estúdio Aura while enabling reactive Smart Waitlist on VitaScan', async () => {
    const { c } = makeHarness();
    const seeded = await seedDemoData(c);

    // 1. Estúdio Aura is at 5/5 active BookableResources on STARTER
    const auraResources = await c.infra.resources.listByTenant(seeded.auraWorkspaceId, { onlyActive: true });
    expect(auraResources).toHaveLength(5);

    await expect(
      c.catalog.createResource.execute({
        tenantId: seeded.auraWorkspaceId,
        name: 'Sexto Recurso Acima da Quota',
        category: 'EQUIPMENT',
        capabilities: ['LASER_CO2'],
      }),
    ).rejects.toBeInstanceOf(QuotaExceededError);

    // 2. VitaScan Diagnósticos is on PRO with 6 active resources, KPIs, and 3 WAITING waitlist entries
    const vitaSub = await c.infra.subscriptions.findByTenant(seeded.vitascanWorkspaceId);
    expect(vitaSub?.plan).toBe('PRO');
    expect(vitaSub?.status).toBe('ACTIVE');

    const kpis = await c.queries.kpis.execute(seeded.vitascanWorkspaceId);
    expect(kpis.protectedRevenueCents).toBeGreaterThan(0);
    expect(kpis.waitlistRecoveredRevenueCents).toBe(80000);
    expect(kpis.waitingInQueue).toBe(3);

    // 3. Cancelling the seeded 09:00 confirmed booking immediately offers the slot to Beatriz (#1 in queue)
    const vitaWs = await c.infra.workspaces.findById(seeded.vitascanWorkspaceId);
    const vitaOwnerId = vitaWs!.members[0]!.userId;

    await c.scheduling.cancelBooking.execute({
      tenantId: seeded.vitascanWorkspaceId,
      actorId: vitaOwnerId,
      bookingId: seeded.cancellableConfirmedBookingId,
      reason: 'Teste de disparo reativo de SlotOffer',
    });

    const waitlistEntries = await c.infra.waitlist.listByTenant(seeded.vitascanWorkspaceId);
    const offeredEntry = waitlistEntries.find((w) => w.status === 'OFFERED');
    expect(offeredEntry).toBeDefined();
    expect(offeredEntry?.clientName).toContain('Beatriz Monteiro');
  });
});
