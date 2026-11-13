import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { billingEvent, makeHarness, registerTenant, upgradeTenant } from '../support/harness';
import { createApp } from '../../src/presentation/http/app';
import { ExpirationWorker } from '../../src/scheduling/infrastructure/ExpirationWorker';
import {
  FeatureNotEntitledError,
  ForbiddenError,
  InvalidStateTransitionError,
  LastOwnerRemovalError,
  QuotaExceededError,
} from '../../src/shared/domain/errors';

describe('Comprehensive Validation of Decoupled Services & Domain Edge Cases', () => {
  describe('Tenancy & RBAC Member Management', () => {
    it('enforces RBAC boundaries and prevents last OWNER removal/demotion', async () => {
      const h = makeHarness();
      const t = await registerTenant(h, 'Tenancy RBAC Clinic');

      // Create extra users for role testing
      const uAdmin = await h.c.tenancy.register.execute({
        email: 'admin.rbac@test.dev',
        name: 'Admin User',
        password: 'Passw0rd!2026',
        workspaceName: 'Admin Personal',
      });
      const uCoord = await h.c.tenancy.register.execute({
        email: 'coord.rbac@test.dev',
        name: 'Coord User',
        password: 'Passw0rd!2026',
        workspaceName: 'Coord Personal',
      });
      const uSpec = await h.c.tenancy.register.execute({
        email: 'spec.rbac@test.dev',
        name: 'Spec User',
        password: 'Passw0rd!2026',
        workspaceName: 'Spec Personal',
      });

      // OWNER invites ADMIN, COORDINATOR, and SPECIALIST
      await h.c.tenancy.invite.execute({
        tenantId: t.workspaceId,
        actorId: t.userId,
        actorRole: 'OWNER',
        email: 'admin.rbac@test.dev',
        role: 'ADMIN',
      });
      await h.c.tenancy.invite.execute({
        tenantId: t.workspaceId,
        actorId: t.userId,
        actorRole: 'OWNER',
        email: 'coord.rbac@test.dev',
        role: 'COORDINATOR',
      });
      await h.c.tenancy.invite.execute({
        tenantId: t.workspaceId,
        actorId: t.userId,
        actorRole: 'OWNER',
        email: 'spec.rbac@test.dev',
        role: 'SPECIALIST',
      });

      // 1. SPECIALIST cannot invite or manage members
      await expect(
        h.c.tenancy.invite.execute({
          tenantId: t.workspaceId,
          actorId: uSpec.userId,
          actorRole: 'SPECIALIST',
          email: 'another@test.dev',
          role: 'SPECIALIST',
        }),
      ).rejects.toBeInstanceOf(ForbiddenError);

      // 2. COORDINATOR cannot invite or manage members
      await expect(
        h.c.tenancy.invite.execute({
          tenantId: t.workspaceId,
          actorId: uCoord.userId,
          actorRole: 'COORDINATOR',
          email: 'another@test.dev',
          role: 'SPECIALIST',
        }),
      ).rejects.toBeInstanceOf(ForbiddenError);

      // 3. ADMIN cannot grant OWNER role
      await expect(
        h.c.tenancy.changeRole.execute({
          tenantId: t.workspaceId,
          actorId: uAdmin.userId,
          actorRole: 'ADMIN',
          userId: uCoord.userId,
          role: 'OWNER',
        }),
      ).rejects.toBeInstanceOf(ForbiddenError);

      // 4. OWNER promotes ADMIN to co-OWNER
      await h.c.tenancy.changeRole.execute({
        tenantId: t.workspaceId,
        actorId: t.userId,
        actorRole: 'OWNER',
        userId: uAdmin.userId,
        role: 'OWNER',
      });

      // 5. With 2 owners, demoting one back to ADMIN is permitted
      await h.c.tenancy.changeRole.execute({
        tenantId: t.workspaceId,
        actorId: t.userId,
        actorRole: 'OWNER',
        userId: uAdmin.userId,
        role: 'ADMIN',
      });

      // 6. Demoting the ONLY remaining OWNER must throw LastOwnerRemovalError
      await expect(
        h.c.tenancy.changeRole.execute({
          tenantId: t.workspaceId,
          actorId: t.userId,
          actorRole: 'OWNER',
          userId: t.userId,
          role: 'ADMIN',
        }),
      ).rejects.toBeInstanceOf(LastOwnerRemovalError);

      // 7. Removing the last OWNER must throw LastOwnerRemovalError
      await expect(
        h.c.tenancy.removeMember.execute({
          tenantId: t.workspaceId,
          actorId: t.userId,
          actorRole: 'OWNER',
          userId: t.userId,
        }),
      ).rejects.toBeInstanceOf(LastOwnerRemovalError);

      // 8. Removing a non-owner member succeeds
      await h.c.tenancy.removeMember.execute({
        tenantId: t.workspaceId,
        actorId: t.userId,
        actorRole: 'OWNER',
        userId: uCoord.userId,
      });

      const members = await h.c.queries.workspace.members(t.workspaceId);
      expect(members.some((m) => m.userId === uCoord.userId)).toBe(false);
    });

    it('enforces audit log export entitlement (STARTER blocked, ENTERPRISE allowed)', async () => {
      const h = makeHarness();
      const t = await registerTenant(h, 'Audit Export Clinic');
      const app = createApp(h.c);

      // STARTER plan -> export fails with 402 / QuotaExceededError
      await request(app)
        .get('/api/audit-logs/export')
        .set('Authorization', `Bearer ${t.token}`)
        .set('x-workspace-id', t.workspaceId)
        .expect(402);

      // Upgrade to ENTERPRISE -> export succeeds
      await upgradeTenant(h, t.workspaceId, 'ENTERPRISE');

      const res = await request(app)
        .get('/api/audit-logs/export')
        .set('Authorization', `Bearer ${t.token}`)
        .set('x-workspace-id', t.workspaceId)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
    });
  });

  describe('Catalog & Resource Maintenance Blocks', () => {
    it('applies maintenance blocks and prevents scheduling during maintenance windows', async () => {
      const h = makeHarness();
      const t = await registerTenant(h, 'Maintenance Clinic');
      await upgradeTenant(h, t.workspaceId, 'PRO');

      const room = await h.c.catalog.createResource.execute({
        tenantId: t.workspaceId,
        name: 'Sala Imagem 01',
        category: 'ROOM',
        capabilities: ['ultrasound-suite'],
      });

      const proc = await h.c.catalog.createProcedure.execute({
        tenantId: t.workspaceId,
        name: 'Ultrassonografia',
        durationMinutes: 40,
        priceCents: 40000,
        depositCents: 10000,
        requirements: [{ category: 'ROOM', requiredCapabilities: ['ultrasound-suite'] }],
      });

      // Set maintenance on the room from 14:00 to 16:00
      await h.c.catalog.setMaintenance.execute({
        tenantId: t.workspaceId,
        resourceId: room.id.value,
        startAt: new Date('2026-06-02T14:00:00Z'),
        endAt: new Date('2026-06-02T16:00:00Z'),
        reason: 'Manutenção preventiva e calibração',
      });

      // Search available slots: 14:00..16:00 must have 0 slots for this procedure
      const slots = await h.c.queries.availableSlots.execute({
        tenantId: t.workspaceId,
        procedureId: proc.id.value,
        from: new Date('2026-06-02T13:00:00Z'),
        to: new Date('2026-06-02T17:00:00Z'),
        stepMinutes: 30,
      });

      const slotTimes = slots.availableSlots.map((s) => s.startAt.toISOString());
      expect(slotTimes).toContain('2026-06-02T13:00:00.000Z');
      expect(slotTimes).not.toContain('2026-06-02T14:00:00.000Z');
      expect(slotTimes).not.toContain('2026-06-02T14:30:00.000Z');
      expect(slotTimes).not.toContain('2026-06-02T15:00:00.000Z');
      expect(slotTimes).not.toContain('2026-06-02T15:30:00.000Z');
      expect(slotTimes).toContain('2026-06-02T16:00:00.000Z');
    });

    it('enforces quota when reactivating an ARCHIVED resource', async () => {
      const h = makeHarness();
      const t = await registerTenant(h, 'Quota Reactivate Clinic'); // STARTER = max 5

      const resources = [];
      for (let i = 1; i <= 5; i++) {
        const r = await h.c.catalog.createResource.execute({
          tenantId: t.workspaceId,
          name: `Resource ${i}`,
          category: 'ROOM',
        });
        resources.push(r);
      }

      // Archive resource 1
      await h.c.catalog.setMaintenance.execute({
        tenantId: t.workspaceId,
        resourceId: resources[0].id.value,
        status: 'ARCHIVED',
      });
      expect(await h.infra.resources.countActiveByTenant(t.workspaceId)).toBe(4);

      // Now create a new 5th active resource -> reaches 5 again
      await h.c.catalog.createResource.execute({
        tenantId: t.workspaceId,
        name: 'Resource 6 Replacement',
        category: 'ROOM',
      });
      expect(await h.infra.resources.countActiveByTenant(t.workspaceId)).toBe(5);

      // Attempting to reactivate resource 1 must fail with QuotaExceededError
      await expect(
        h.c.catalog.setMaintenance.execute({
          tenantId: t.workspaceId,
          resourceId: resources[0].id.value,
          status: 'ACTIVE',
        }),
      ).rejects.toBeInstanceOf(QuotaExceededError);
    });
  });

  describe('Billing State Machine & Webhook Ingestion', () => {
    it('transitions subscription to PAST_DUE and blocks operations, then recovers on payment', async () => {
      const h = makeHarness();
      const t = await registerTenant(h, 'Billing Lifecycle Clinic');
      await upgradeTenant(h, t.workspaceId, 'PRO');

      // 1. Ingest invoice.payment_failed
      const failEvent = billingEvent('evt_pay_failed_1', 'invoice.payment_failed', t.workspaceId);
      const failCmd = h.c.acl.translate(JSON.parse(failEvent.body))!;
      await h.c.billing.processWebhook.execute({ command: failCmd, rawPayload: failEvent });

      const subPastDue = await h.infra.subscriptions.findByTenant(t.workspaceId);
      expect(subPastDue?.status).toBe('PAST_DUE');

      // Operations like Smart Waitlist must be blocked when subscription is not healthy
      const proc = await h.c.catalog.createProcedure.execute({
        tenantId: t.workspaceId,
        name: 'Exame Geral',
        durationMinutes: 30,
        priceCents: 20000,
        depositCents: 5000,
        requirements: [{ category: 'SPECIALIST' }],
      });

      await expect(
        h.c.scheduling.joinWaitlist.execute({
          tenantId: t.workspaceId,
          procedureId: proc.id.value,
          clientName: 'Paciente Bloqueado',
          clientEmail: 'bloqueado@test.dev',
          desiredStartAt: new Date('2026-06-02T08:00:00Z'),
          desiredEndAt: new Date('2026-06-02T18:00:00Z'),
        }),
      ).rejects.toBeInstanceOf(QuotaExceededError);

      // 2. Ingest invoice.paid -> recovers subscription to ACTIVE
      const paidEvent = billingEvent('evt_pay_recovered_1', 'invoice.paid', t.workspaceId, { plan: 'PRO' });
      const paidCmd = h.c.acl.translate(JSON.parse(paidEvent.body))!;
      await h.c.billing.processWebhook.execute({ command: paidCmd, rawPayload: paidEvent });

      const subActive = await h.infra.subscriptions.findByTenant(t.workspaceId);
      expect(subActive?.status).toBe('ACTIVE');

      // Now join waitlist succeeds
      const entry = await h.c.scheduling.joinWaitlist.execute({
        tenantId: t.workspaceId,
        procedureId: proc.id.value,
        clientName: 'Paciente Liberado',
        clientEmail: 'liberado@test.dev',
        desiredStartAt: new Date('2026-06-02T08:00:00Z'),
        desiredEndAt: new Date('2026-06-02T18:00:00Z'),
      });
      expect(entry.status).toBe('WAITING');
    });
  });

  describe('Scheduling Core: Booking Lifecycle, No-Show Penalties & VIP Waitlist', () => {
    it('validates sequential state transitions: PENDING_DEPOSIT -> CONFIRMED -> CHECKED_IN -> COMPLETED', async () => {
      const h = makeHarness();
      const t = await registerTenant(h, 'Lifecycle Flow Clinic');
      await upgradeTenant(h, t.workspaceId, 'PRO');

      await h.c.catalog.createResource.execute({
        tenantId: t.workspaceId,
        name: 'Dra. Beatriz',
        category: 'SPECIALIST',
        capabilities: ['dermatology'],
      });

      const proc = await h.c.catalog.createProcedure.execute({
        tenantId: t.workspaceId,
        name: 'Consulta Dermatologia',
        durationMinutes: 30,
        priceCents: 35000,
        depositCents: 10000,
        requirements: [{ category: 'SPECIALIST', requiredCapabilities: ['dermatology'] }],
      });

      const b = await h.c.scheduling.scheduleBooking.execute({
        tenantId: t.workspaceId,
        procedureId: proc.id.value,
        startAt: new Date('2026-06-02T10:00:00Z'),
        clientName: 'Cliente Teste',
        clientEmail: 'cliente@teste.dev',
      });
      expect(b.status).toBe('PENDING_DEPOSIT');

      // Cannot check-in before confirming deposit
      await expect(
        h.c.scheduling.checkIn.execute({ tenantId: t.workspaceId, bookingId: b.id.value }),
      ).rejects.toBeInstanceOf(InvalidStateTransitionError);

      // Confirm deposit -> CONFIRMED
      const confirmed = await h.c.scheduling.confirmDeposit.execute({ tenantId: t.workspaceId, bookingId: b.id.value });
      expect(confirmed.status).toBe('CONFIRMED');

      // Cannot complete before check-in
      await expect(
        h.c.scheduling.complete.execute({ tenantId: t.workspaceId, bookingId: b.id.value }),
      ).rejects.toBeInstanceOf(InvalidStateTransitionError);

      // Check-in -> CHECKED_IN
      const checkedIn = await h.c.scheduling.checkIn.execute({ tenantId: t.workspaceId, bookingId: b.id.value });
      expect(checkedIn.status).toBe('CHECKED_IN');

      // Complete -> COMPLETED
      const completed = await h.c.scheduling.complete.execute({ tenantId: t.workspaceId, bookingId: b.id.value });
      expect(completed.status).toBe('COMPLETED');
    });

    it('validates No-Show rules: forbidden before start time, forfeits deposit after start time', async () => {
      const h = makeHarness();
      const t = await registerTenant(h, 'No-Show Clinic');
      await upgradeTenant(h, t.workspaceId, 'PRO');

      await h.c.catalog.createResource.execute({
        tenantId: t.workspaceId,
        name: 'Dr. Lucas',
        category: 'SPECIALIST',
      });

      const proc = await h.c.catalog.createProcedure.execute({
        tenantId: t.workspaceId,
        name: 'Procedimento Rápido',
        durationMinutes: 30,
        priceCents: 50000,
        depositCents: 15000,
        requirements: [{ category: 'SPECIALIST' }],
      });

      const bookingStart = new Date('2026-06-02T15:00:00Z');
      const b = await h.c.scheduling.scheduleBooking.execute({
        tenantId: t.workspaceId,
        procedureId: proc.id.value,
        startAt: bookingStart,
        clientName: 'Paciente NoShow',
        clientEmail: 'noshow@teste.dev',
      });
      await h.c.scheduling.confirmDeposit.execute({ tenantId: t.workspaceId, bookingId: b.id.value });

      // Current time is 14:00 (before booking start at 15:00) -> recording no-show is forbidden
      h.clock.set(new Date('2026-06-02T14:00:00Z'));
      await expect(
        h.c.scheduling.recordNoShow.execute({
          tenantId: t.workspaceId,
          bookingId: b.id.value,
          actorId: t.userId,
        }),
      ).rejects.toBeInstanceOf(InvalidStateTransitionError);

      // Advance clock past booking start to 15:15
      h.clock.set(new Date('2026-06-02T15:15:00Z'));
      const noShowBooking = await h.c.scheduling.recordNoShow.execute({
        tenantId: t.workspaceId,
        bookingId: b.id.value,
        actorId: t.userId,
      });

      expect(noShowBooking.status).toBe('NO_SHOW');
      expect(noShowBooking.retainedCents).toBe(15000); // 100% deposit retained
      expect(noShowBooking.refundedCents).toBe(0);

      const kpis = await h.c.queries.kpis.execute(t.workspaceId);
      expect(kpis.noShowCount).toBe(1);
      expect(kpis.protectedRevenueCents).toBe(15000);
    });

    it('prioritizes VIP waitlist candidates ahead of earlier FIFO standard candidates', async () => {
      const h = makeHarness();
      const t = await registerTenant(h, 'VIP Waitlist Clinic');

      // 1. STARTER and PRO cannot join as VIP
      await upgradeTenant(h, t.workspaceId, 'PRO');

      await h.c.catalog.createResource.execute({
        tenantId: t.workspaceId,
        name: 'Dra. Vanessa',
        category: 'SPECIALIST',
      });

      const proc = await h.c.catalog.createProcedure.execute({
        tenantId: t.workspaceId,
        name: 'Procedimento VIP',
        durationMinutes: 45,
        priceCents: 80000,
        depositCents: 20000,
        requirements: [{ category: 'SPECIALIST' }],
      });

      await expect(
        h.c.scheduling.joinWaitlist.execute({
          tenantId: t.workspaceId,
          procedureId: proc.id.value,
          clientName: 'VIP Candidate',
          clientEmail: 'vip@teste.dev',
          desiredStartAt: new Date('2026-06-02T10:00:00Z'),
          desiredEndAt: new Date('2026-06-02T18:00:00Z'),
          priority: 'VIP',
        }),
      ).rejects.toBeInstanceOf(FeatureNotEntitledError);

      // 2. Upgrade to ENTERPRISE -> VIP allowed!
      await upgradeTenant(h, t.workspaceId, 'ENTERPRISE');

      // Schedule confirmed booking at 14:00
      const bOrig = await h.c.scheduling.scheduleBooking.execute({
        tenantId: t.workspaceId,
        procedureId: proc.id.value,
        startAt: new Date('2026-06-02T14:00:00Z'),
        clientName: 'Original Patient',
        clientEmail: 'orig@teste.dev',
      });
      await h.c.scheduling.confirmDeposit.execute({ tenantId: t.workspaceId, bookingId: bOrig.id.value });

      // Candidate 1 joins first with STANDARD priority
      const wStandard = await h.c.scheduling.joinWaitlist.execute({
        tenantId: t.workspaceId,
        procedureId: proc.id.value,
        clientName: 'Standard Candidate First',
        clientEmail: 'standard@teste.dev',
        desiredStartAt: new Date('2026-06-02T13:00:00Z'),
        desiredEndAt: new Date('2026-06-02T17:00:00Z'),
        priority: 'STANDARD',
      });

      // Candidate 2 joins later with VIP priority
      h.clock.advance(1000);
      const wVip = await h.c.scheduling.joinWaitlist.execute({
        tenantId: t.workspaceId,
        procedureId: proc.id.value,
        clientName: 'VIP Candidate Second',
        clientEmail: 'vip@teste.dev',
        desiredStartAt: new Date('2026-06-02T13:00:00Z'),
        desiredEndAt: new Date('2026-06-02T17:00:00Z'),
        priority: 'VIP',
      });

      // Cancel original booking -> reactive matcher must offer to VIP first, despite joining later!
      await h.c.scheduling.cancelBooking.execute({
        tenantId: t.workspaceId,
        bookingId: bOrig.id.value,
        actorId: t.userId,
        reason: 'Desistência',
      });

      const wStandardFresh = await h.infra.waitlist.findById(t.workspaceId, wStandard.id.value);
      const wVipFresh = await h.infra.waitlist.findById(t.workspaceId, wVip.id.value);

      expect(wVipFresh!.status).toBe('OFFERED');
      expect(wStandardFresh!.status).toBe('WAITING');
    });

    it('ExpirationWorker sweeps overdue pending deposits and expired waitlist offers', async () => {
      const h = makeHarness();
      const t = await registerTenant(h, 'Worker Clinic');
      await upgradeTenant(h, t.workspaceId, 'PRO');

      await h.c.catalog.createResource.execute({
        tenantId: t.workspaceId,
        name: 'Dr. Roberto',
        category: 'SPECIALIST',
      });

      const proc = await h.c.catalog.createProcedure.execute({
        tenantId: t.workspaceId,
        name: 'Procedimento Worker',
        durationMinutes: 30,
        priceCents: 40000,
        depositCents: 10000,
        requirements: [{ category: 'SPECIALIST' }],
      });

      // Booking 1: pending deposit (hold 30 min)
      const bPending = await h.c.scheduling.scheduleBooking.execute({
        tenantId: t.workspaceId,
        procedureId: proc.id.value,
        startAt: new Date('2026-06-02T14:00:00Z'),
        clientName: 'Paciente Pendente',
        clientEmail: 'pendente@teste.dev',
      });

      // Waitlist entry 1: will receive offer after a booking is cancelled
      const bToCancel = await h.c.scheduling.scheduleBooking.execute({
        tenantId: t.workspaceId,
        procedureId: proc.id.value,
        startAt: new Date('2026-06-02T16:00:00Z'),
        clientName: 'Paciente Cancelar',
        clientEmail: 'cancelar@teste.dev',
      });
      await h.c.scheduling.confirmDeposit.execute({ tenantId: t.workspaceId, bookingId: bToCancel.id.value });

      const w1 = await h.c.scheduling.joinWaitlist.execute({
        tenantId: t.workspaceId,
        procedureId: proc.id.value,
        clientName: 'Espera #1',
        clientEmail: 'espera1@teste.dev',
        desiredStartAt: new Date('2026-06-02T15:00:00Z'),
        desiredEndAt: new Date('2026-06-02T18:00:00Z'),
      });
      h.clock.advance(1000);
      const w2 = await h.c.scheduling.joinWaitlist.execute({
        tenantId: t.workspaceId,
        procedureId: proc.id.value,
        clientName: 'Espera #2',
        clientEmail: 'espera2@teste.dev',
        desiredStartAt: new Date('2026-06-02T15:00:00Z'),
        desiredEndAt: new Date('2026-06-02T18:00:00Z'),
      });

      // Cancel bToCancel -> w1 becomes OFFERED
      await h.c.scheduling.cancelBooking.execute({
        tenantId: t.workspaceId,
        bookingId: bToCancel.id.value,
        actorId: t.userId,
        reason: 'Cancelado',
      });

      expect((await h.infra.waitlist.findById(t.workspaceId, w1.id.value))!.status).toBe('OFFERED');

      // Advance clock by 35 minutes (past deposit hold 30m and past waitlist offer TTL 30m)
      h.clock.advance(35 * 60_000);

      // Instantiate ExpirationWorker with in-memory redis mock / sweep execution
      const worker = new ExpirationWorker('redis://localhost:16381', h.c);
      const sweepResult = await worker.runSweepCycle();

      expect(sweepResult.expiredBookings).toBeGreaterThanOrEqual(1);
      expect(sweepResult.expiredWaitlistOffers).toBeGreaterThanOrEqual(1);

      // Verify booking was expired
      const bFresh = await h.infra.bookings.findById(t.workspaceId, bPending.id.value);
      expect(bFresh!.status).toBe('EXPIRED');

      // Verify w1 expired and cascaded to w2
      const w1Fresh = await h.infra.waitlist.findById(t.workspaceId, w1.id.value);
      const w2Fresh = await h.infra.waitlist.findById(t.workspaceId, w2.id.value);
      expect(w1Fresh!.status).toBe('OFFER_EXPIRED');
      expect(w2Fresh!.status).toBe('OFFERED');
    });
  });
});
