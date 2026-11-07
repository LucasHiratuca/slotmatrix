import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { Container } from '../../composition-root';
import { RouterKit } from './router-kit';
import { bookingDto, procedureDto, resourceDto, waitlistDto } from '../../scheduling/application/queries';
import { BILLING_SIGNATURE_HEADER, signBillingPayload } from '../../billing/infrastructure/BillingWebhookAcl';
import { PLAN_CODES, PlanQuota } from '../../billing/domain/value-objects/PlanQuota';
import { RESOURCE_CATEGORIES } from '../../catalog/domain/aggregates/BookableResource';
import { ROLES } from '../../tenancy/domain/aggregates/Workspace';
import { NotFoundError, QuotaExceededError, UnauthorizedError } from '../../shared/domain/errors';

const registerBody = z.object({
  email: z.string().email(),
  name: z.string().min(2),
  password: z.string().min(8),
  workspaceName: z.string().min(2).max(80),
});
const loginBody = z.object({ email: z.string().email(), password: z.string().min(1) });
const roleEnum = z.enum(ROLES as [string, ...string[]]);
const categoryEnum = z.enum(RESOURCE_CATEGORIES as [string, ...string[]]);

const resourceBody = z.object({
  name: z.string().min(2).max(120),
  category: categoryEnum,
  capabilities: z.array(z.string()).default([]),
});

const procedureBody = z.object({
  name: z.string().min(2).max(120),
  durationMinutes: z.number().int().min(10).max(480),
  priceCents: z.number().int().min(0),
  depositCents: z.number().int().min(0).default(0),
  currency: z.string().length(3).default('BRL'),
  requirements: z
    .array(
      z.object({
        category: categoryEnum,
        requiredCapabilities: z.array(z.string()).default([]),
        prepMinutes: z.number().int().min(0).max(240).default(0),
        cleanupMinutes: z.number().int().min(0).max(240).default(0),
      }),
    )
    .min(1),
});

const scheduleBookingBody = z.object({
  procedureId: z.string().min(1),
  startAt: z.string().datetime(),
  clientName: z.string().min(2).max(120),
  clientEmail: z.string().email(),
  preferredResourceIds: z.array(z.string()).optional(),
});

const waitlistJoinBody = z.object({
  procedureId: z.string().min(1),
  clientName: z.string().min(2).max(120),
  clientEmail: z.string().email(),
  desiredStartAt: z.string().datetime(),
  desiredEndAt: z.string().datetime(),
  priority: z.enum(['STANDARD', 'VIP']).default('STANDARD'),
});

export async function handleBillingWebhook(c: Container, rawBody: string | undefined, signature: string | undefined) {
  if (!rawBody || !c.acl.verifySignature(rawBody, signature)) {
    throw new UnauthorizedError('Invalid billing webhook signature');
  }
  const payload = JSON.parse(rawBody);
  const command = c.acl.translate(payload);
  if (!command) return { status: 'ignored' as const };
  return c.billing.processWebhook.execute({ command, rawPayload: payload });
}

export function registerRoutes(kit: RouterKit, c: Container) {
  const { tenancy, catalog, scheduling, queries: q } = c;

  // ---------- Auth
  kit.add({
    method: 'post',
    path: '/auth/register',
    tag: 'Auth',
    summary: 'Register user and bootstrap a Workspace (OWNER, TRIALING/STARTER)',
    access: 'public',
    body: registerBody,
    successStatus: 201,
    handler: ({ body }) => tenancy.register.execute(body),
  });

  kit.add({
    method: 'post',
    path: '/auth/login',
    tag: 'Auth',
    summary: 'Login',
    access: 'public',
    body: loginBody,
    handler: async ({ body }) => {
      const r = await tenancy.login.execute(body);
      return { ...r, workspaces: await q.workspace.listForUser(r.userId) };
    },
  });

  kit.add({
    method: 'get',
    path: '/me/workspaces',
    tag: 'Auth',
    summary: 'List workspaces for current user (Workspace Switcher)',
    access: 'user',
    handler: ({ userId }) => q.workspace.listForUser(userId),
  });

  // ---------- Tenancy
  kit.add({
    method: 'get',
    path: '/workspace',
    tag: 'Tenancy',
    summary: 'Workspace overview with plan, entitlements and resource quota usage',
    access: 'tenant',
    handler: ({ tenant }) => q.workspace.overview(tenant.tenantId, tenant.userId),
  });

  kit.add({
    method: 'get',
    path: '/members',
    tag: 'Tenancy',
    summary: 'List workspace members',
    access: 'tenant',
    handler: ({ tenant }) => q.workspace.members(tenant.tenantId),
  });

  kit.add({
    method: 'post',
    path: '/members',
    tag: 'Tenancy',
    summary: 'Invite registered user as Member',
    access: 'tenant',
    minRole: 'ADMIN',
    successStatus: 201,
    body: z.object({ email: z.string().email(), role: roleEnum }),
    handler: ({ tenant, body }) =>
      tenancy.invite.execute({
        tenantId: tenant.tenantId,
        actorId: tenant.userId,
        actorRole: tenant.role,
        email: body.email,
        role: body.role as any,
      }),
  });

  kit.add({
    method: 'patch',
    path: '/members/:userId',
    tag: 'Tenancy',
    summary: 'Change member role',
    access: 'tenant',
    minRole: 'ADMIN',
    body: z.object({ role: roleEnum }),
    handler: async ({ tenant, body, params }) => {
      await tenancy.changeRole.execute({
        tenantId: tenant.tenantId,
        actorId: tenant.userId,
        actorRole: tenant.role,
        userId: params.userId,
        role: body.role as any,
      });
      return { ok: true };
    },
  });

  kit.add({
    method: 'delete',
    path: '/members/:userId',
    tag: 'Tenancy',
    summary: 'Remove member',
    access: 'tenant',
    minRole: 'ADMIN',
    handler: async ({ tenant, params }) => {
      await tenancy.removeMember.execute({
        tenantId: tenant.tenantId,
        actorId: tenant.userId,
        actorRole: tenant.role,
        userId: params.userId,
      });
      return { ok: true };
    },
  });

  kit.add({
    method: 'get',
    path: '/audit-logs',
    tag: 'Tenancy',
    summary: 'Immutable AuditLog (latest 200)',
    access: 'tenant',
    minRole: 'ADMIN',
    handler: ({ tenant }) => c.infra.auditLogs.listByTenant(tenant.tenantId, 200),
  });

  kit.add({
    method: 'get',
    path: '/audit-logs/export',
    tag: 'Tenancy',
    summary: 'Export full AuditLog (ENTERPRISE entitlement)',
    access: 'tenant',
    minRole: 'ADMIN',
    handler: async ({ tenant }) => {
      const ent = await c.entitlements.forWorkspace(tenant.tenantId);
      if (!ent.exportableAuditLogs) throw new QuotaExceededError('Audit log export requires the ENTERPRISE plan');
      return c.infra.auditLogs.listByTenant(tenant.tenantId, 100000);
    },
  });

  // ---------- Catalog (BookableResources & ServiceProcedures)
  kit.add({
    method: 'get',
    path: '/resources',
    tag: 'Catalog',
    summary: 'List BookableResources (Specialists, Rooms, Equipment)',
    access: 'tenant',
    handler: async ({ tenant }) => (await c.infra.resources.listByTenant(tenant.tenantId)).map(resourceDto),
  });

  kit.add({
    method: 'post',
    path: '/resources',
    tag: 'Catalog',
    summary: 'Register BookableResource (enforces plan quota)',
    access: 'tenant',
    minRole: 'ADMIN',
    body: resourceBody,
    successStatus: 201,
    handler: async ({ tenant, body }) =>
      resourceDto(
        await catalog.createResource.execute({
          tenantId: tenant.tenantId,
          name: body.name,
          category: body.category as any,
          capabilities: body.capabilities,
        }),
      ),
  });

  kit.add({
    method: 'get',
    path: '/resources/:id',
    tag: 'Catalog',
    summary: 'Get BookableResource by id',
    access: 'tenant',
    handler: async ({ tenant, params }) => {
      const r = await c.infra.resources.findById(tenant.tenantId, params.id);
      if (!r) throw new NotFoundError('BookableResource not found');
      return resourceDto(r);
    },
  });

  kit.add({
    method: 'post',
    path: '/resources/:id/maintenance',
    tag: 'Catalog',
    summary: 'Add MaintenanceBlock or update status of a BookableResource',
    access: 'tenant',
    minRole: 'COORDINATOR',
    body: z.object({
      startAt: z.string().datetime().optional(),
      endAt: z.string().datetime().optional(),
      reason: z.string().min(2).max(200).optional(),
      status: z.enum(['ACTIVE', 'IN_MAINTENANCE', 'ARCHIVED']).optional(),
    }),
    handler: async ({ tenant, params, body }) =>
      resourceDto(
        await catalog.setMaintenance.execute({
          tenantId: tenant.tenantId,
          resourceId: params.id,
          startAt: body.startAt ? new Date(body.startAt) : undefined,
          endAt: body.endAt ? new Date(body.endAt) : undefined,
          reason: body.reason,
          status: body.status,
        }),
      ),
  });

  kit.add({
    method: 'get',
    path: '/procedures',
    tag: 'Catalog',
    summary: 'List ServiceProcedures with multi-resource requirements and TurnaroundBuffers',
    access: 'tenant',
    handler: async ({ tenant }) => (await c.infra.procedures.listByTenant(tenant.tenantId)).map(procedureDto),
  });

  kit.add({
    method: 'post',
    path: '/procedures',
    tag: 'Catalog',
    summary: 'Create ServiceProcedure',
    access: 'tenant',
    minRole: 'ADMIN',
    body: procedureBody,
    successStatus: 201,
    handler: async ({ tenant, body }) =>
      procedureDto(
        await catalog.createProcedure.execute({
          tenantId: tenant.tenantId,
          name: body.name,
          durationMinutes: body.durationMinutes,
          priceCents: body.priceCents,
          depositCents: body.depositCents,
          currency: body.currency,
          requirements: body.requirements as any,
        }),
      ),
  });

  // ---------- Scheduling (Availability, Bookings, Timeline, KPIs & Smart Waitlist)
  kit.add({
    method: 'get',
    path: '/procedures/:id/available-slots',
    tag: 'Scheduling',
    summary: 'Find viable multi-resource slots for a ServiceProcedure (including prep & sterilization buffers)',
    access: 'tenant',
    query: z.object({
      from: z.string().datetime(),
      to: z.string().datetime(),
      stepMinutes: z.coerce.number().int().min(5).max(120).default(30),
    }),
    handler: ({ tenant, params, query }) =>
      q.availableSlots.execute({
        tenantId: tenant.tenantId,
        procedureId: params.id,
        from: new Date(query.from),
        to: new Date(query.to),
        stepMinutes: query.stepMinutes,
      }),
  });

  kit.add({
    method: 'get',
    path: '/bookings',
    tag: 'Scheduling',
    summary: 'List Bookings in workspace',
    access: 'tenant',
    handler: async ({ tenant }) => (await c.infra.bookings.listByTenant(tenant.tenantId)).map(bookingDto),
  });

  kit.add({
    method: 'get',
    path: '/bookings/:id',
    tag: 'Scheduling',
    summary: 'Get Booking details',
    access: 'tenant',
    handler: async ({ tenant, params }) => {
      const b = await c.infra.bookings.findById(tenant.tenantId, params.id);
      if (!b) throw new NotFoundError('Booking not found');
      return bookingDto(b);
    },
  });

  kit.add({
    method: 'post',
    path: '/bookings',
    tag: 'Scheduling',
    summary: 'Schedule multi-resource Booking atomically (prevents double-booking)',
    access: 'tenant',
    minRole: 'COORDINATOR',
    body: scheduleBookingBody,
    successStatus: 201,
    handler: async ({ tenant, body }) =>
      bookingDto(
        await scheduling.scheduleBooking.execute({
          tenantId: tenant.tenantId,
          procedureId: body.procedureId,
          startAt: new Date(body.startAt),
          clientName: body.clientName,
          clientEmail: body.clientEmail,
          preferredResourceIds: body.preferredResourceIds,
        }),
      ),
  });

  kit.add({
    method: 'post',
    path: '/bookings/:id/confirm-deposit',
    tag: 'Scheduling',
    summary: 'Confirm SecurityDeposit payment (PENDING_DEPOSIT -> CONFIRMED)',
    access: 'tenant',
    minRole: 'COORDINATOR',
    handler: async ({ tenant, params }) =>
      bookingDto(await scheduling.confirmDeposit.execute({ tenantId: tenant.tenantId, bookingId: params.id })),
  });

  kit.add({
    method: 'post',
    path: '/bookings/:id/check-in',
    tag: 'Scheduling',
    summary: 'Check-in client (CONFIRMED -> CHECKED_IN)',
    access: 'tenant',
    minRole: 'COORDINATOR',
    handler: async ({ tenant, params }) =>
      bookingDto(await scheduling.checkIn.execute({ tenantId: tenant.tenantId, bookingId: params.id })),
  });

  kit.add({
    method: 'post',
    path: '/bookings/:id/complete',
    tag: 'Scheduling',
    summary: 'Complete procedure (CHECKED_IN -> COMPLETED)',
    access: 'tenant',
    minRole: 'COORDINATOR',
    handler: async ({ tenant, params }) =>
      bookingDto(await scheduling.complete.execute({ tenantId: tenant.tenantId, bookingId: params.id })),
  });

  kit.add({
    method: 'post',
    path: '/bookings/:id/cancel',
    tag: 'Scheduling',
    summary: 'Cancel Booking, compute CancellationPenalty and trigger Smart Waitlist SlotOffer',
    access: 'tenant',
    minRole: 'COORDINATOR',
    body: z.object({ reason: z.string().min(2).max(500).default('Cancelled by coordinator') }),
    handler: async ({ tenant, params, body }) =>
      bookingDto(
        await scheduling.cancelBooking.execute({
          tenantId: tenant.tenantId,
          bookingId: params.id,
          actorId: tenant.userId,
          reason: body.reason,
        }),
      ),
  });

  kit.add({
    method: 'post',
    path: '/bookings/:id/no-show',
    tag: 'Scheduling',
    summary: 'Record No-Show (retains 100% of SecurityDeposit)',
    access: 'tenant',
    minRole: 'COORDINATOR',
    handler: async ({ tenant, params }) =>
      bookingDto(
        await scheduling.recordNoShow.execute({
          tenantId: tenant.tenantId,
          bookingId: params.id,
          actorId: tenant.userId,
        }),
      ),
  });

  kit.add({
    method: 'get',
    path: '/timeline',
    tag: 'Scheduling',
    summary: 'Resource Timeline Matrix separating Service Window from Turnaround/Sterilization Buffer',
    access: 'tenant',
    query: z.object({ date: z.string().optional() }),
    handler: ({ tenant, query }) => q.resourceTimeline.execute({ tenantId: tenant.tenantId, dateIso: query.date }),
  });

  kit.add({
    method: 'get',
    path: '/dashboard/kpis',
    tag: 'Scheduling',
    summary: 'Operational KPIs: Resource Utilization %, No-Show %, Protected Deposit Revenue & Smart Waitlist Recovered Revenue',
    access: 'tenant',
    handler: ({ tenant }) => q.kpis.execute(tenant.tenantId),
  });

  // ---------- Smart Waitlist
  kit.add({
    method: 'get',
    path: '/waitlist',
    tag: 'Waitlist',
    summary: 'List WaitlistEntries and active SlotOffers',
    access: 'tenant',
    handler: async ({ tenant }) => (await c.infra.waitlist.listByTenant(tenant.tenantId)).map(waitlistDto),
  });

  kit.add({
    method: 'post',
    path: '/waitlist',
    tag: 'Waitlist',
    summary: 'Join Smart Waitlist for a ServiceProcedure',
    access: 'tenant',
    minRole: 'COORDINATOR',
    body: waitlistJoinBody,
    successStatus: 201,
    handler: async ({ tenant, body }) =>
      waitlistDto(
        await scheduling.joinWaitlist.execute({
          tenantId: tenant.tenantId,
          procedureId: body.procedureId,
          clientName: body.clientName,
          clientEmail: body.clientEmail,
          desiredStartAt: new Date(body.desiredStartAt),
          desiredEndAt: new Date(body.desiredEndAt),
          priority: body.priority,
        }),
      ),
  });

  kit.add({
    method: 'post',
    path: '/waitlist/:id/claim',
    tag: 'Waitlist',
    summary: 'Claim active SlotOffer and convert atomically into a Booking',
    access: 'tenant',
    minRole: 'COORDINATOR',
    handler: async ({ tenant, params }) => {
      const res = await scheduling.claimWaitlistOffer.execute({
        tenantId: tenant.tenantId,
        waitlistEntryId: params.id,
      });
      return { entry: waitlistDto(res.entry), booking: bookingDto(res.booking) };
    },
  });

  kit.add({
    method: 'post',
    path: '/waitlist/:id/expire-offer',
    tag: 'Waitlist',
    summary: 'Expire active SlotOffer immediately and trigger cascade to the next Waitlist candidate',
    access: 'tenant',
    minRole: 'COORDINATOR',
    handler: async ({ tenant, params }) =>
      waitlistDto(
        await scheduling.expireWaitlistOffer.execute({
          tenantId: tenant.tenantId,
          waitlistEntryId: params.id,
        }),
      ),
  });

  // ---------- Webhook Channels
  kit.add({
    method: 'get',
    path: '/webhook-channels',
    tag: 'Scheduling',
    summary: 'List signed webhook notification channels (secrets hidden)',
    access: 'tenant',
    handler: async ({ tenant }) =>
      (await c.infra.webhookChannels.listByTenant(tenant.tenantId)).map((ch) => ({
        id: ch.id.value,
        name: ch.name,
        url: ch.url.value,
        enabled: ch.enabled,
        lastDeliveredAt: ch.lastDeliveredAt,
      })),
  });

  kit.add({
    method: 'post',
    path: '/webhook-channels',
    tag: 'Scheduling',
    summary: 'Register HMAC-SHA256 signed webhook channel (blocks SSRF targets)',
    access: 'tenant',
    minRole: 'ADMIN',
    successStatus: 201,
    body: z.object({ name: z.string().min(2), url: z.string().min(1), secret: z.string().min(8) }),
    handler: async ({ tenant, body }) => {
      const ch = await scheduling.createWebhookChannel.execute({ tenantId: tenant.tenantId, ...body });
      return { id: ch.id.value, name: ch.name, url: ch.url.value };
    },
  });

  // ---------- Billing
  kit.add({
    method: 'get',
    path: '/billing/plans',
    tag: 'Billing',
    summary: 'SlotMatrix plan catalog (STARTER, PRO, ENTERPRISE)',
    access: 'public',
    handler: async () =>
      PLAN_CODES.map((p) => {
        const x = PlanQuota.forPlan(p);
        return {
          plan: p,
          maxActiveResources: x.maxActiveResources,
          maxBookingsPerMonth: x.maxBookingsPerMonth,
          smartWaitlistEnabled: x.smartWaitlistEnabled,
          securityDepositEnabled: x.securityDepositEnabled,
          publicBookingPortalEnabled: x.publicBookingPortalEnabled,
          vipWaitlistPriorityEnabled: x.vipWaitlistPriorityEnabled,
          exportableAuditLogs: x.exportableAuditLogs,
        };
      }),
  });

  kit.add({
    method: 'post',
    path: '/webhooks/billing',
    tag: 'Billing',
    summary: 'Payment gateway webhook (HMAC signed, idempotent by externalEventId)',
    access: 'public',
    handler: ({ req, rawBody }) => handleBillingWebhook(c, rawBody, req.header(BILLING_SIGNATURE_HEADER)),
  });

  kit.add({
    method: 'post',
    path: '/billing/simulate',
    tag: 'Billing',
    summary: 'Plan simulator: fires a real signed webhook at the idempotent endpoint',
    access: 'tenant',
    minRole: 'OWNER',
    body: z.object({
      event: z.enum(['upgrade', 'payment_failed', 'cancel']).default('upgrade'),
      plan: z.enum(PLAN_CODES as [string, ...string[]]).default('PRO'),
      eventId: z.string().min(3).max(100).optional(),
    }),
    handler: async ({ tenant, body }) => {
      const type =
        body.event === 'upgrade'
          ? 'checkout.session.completed'
          : body.event === 'cancel'
          ? 'customer.subscription.deleted'
          : 'invoice.payment_failed';
      const payload = {
        id: body.eventId ?? `evt_sim_${randomUUID()}`,
        type,
        data: {
          object: {
            customer: `cus_${tenant.tenantId.slice(0, 8)}`,
            metadata: { workspace_id: tenant.tenantId, ...(body.event === 'upgrade' ? { plan: body.plan } : {}) },
          },
        },
      };
      const raw = JSON.stringify(payload);
      const signature = signBillingPayload(raw, c.config.billingWebhookSecret);
      if (c.config.selfBaseUrl) {
        const res = await fetch(`${c.config.selfBaseUrl}/api/webhooks/billing`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', [BILLING_SIGNATURE_HEADER]: signature },
          body: raw,
        });
        return { eventId: payload.id, webhookHttpStatus: res.status, result: await res.json() };
      }
      return { eventId: payload.id, webhookHttpStatus: 200, result: await handleBillingWebhook(c, raw, signature) };
    },
  });

  // ---------- Public Self-Booking Portal (/public/book/:slug)
  kit.add({
    method: 'get',
    path: '/public/book/:slug',
    tag: 'Public',
    summary: 'Public Self-Booking Catalog & Available Slots (sanitized, requires PRO/ENTERPRISE)',
    access: 'public',
    query: z.object({ date: z.string().optional() }),
    handler: ({ params, query }) => q.publicBookingPortal.execute({ slug: params.slug, dateIso: query.date }),
  });

  kit.add({
    method: 'post',
    path: '/public/book/:slug/schedule',
    tag: 'Public',
    summary: 'Public client self-booking for a procedure slot',
    access: 'public',
    successStatus: 201,
    body: z.object({
      procedureId: z.string().min(1),
      startAt: z.string().datetime(),
      clientName: z.string().min(2).max(120),
      clientEmail: z.string().email(),
    }),
    handler: async ({ params, body }) => {
      const ws = await c.infra.workspaces.findBySlug(params.slug);
      if (!ws) throw new NotFoundError('Public booking portal not found');
      const ent = await c.entitlements.forWorkspace(ws.id.value);
      if (!ent.publicBookingPortalEnabled) throw new NotFoundError('Public booking portal not found');
      const b = await scheduling.scheduleBooking.execute({
        tenantId: ws.id.value,
        procedureId: body.procedureId,
        startAt: new Date(body.startAt),
        clientName: body.clientName,
        clientEmail: body.clientEmail,
      });
      return {
        bookingId: b.id.value,
        procedureName: b.procedureName,
        startAt: b.serviceSlot.startAt,
        endAt: b.serviceSlot.endAt,
        status: b.status,
        depositCents: b.depositAmount.amountCents,
      };
    },
  });

  kit.add({
    method: 'post',
    path: '/public/book/:slug/waitlist',
    tag: 'Public',
    summary: 'Public client joins Smart Waitlist when day is full',
    access: 'public',
    successStatus: 201,
    body: waitlistJoinBody.omit({ priority: true }),
    handler: async ({ params, body }) => {
      const ws = await c.infra.workspaces.findBySlug(params.slug);
      if (!ws) throw new NotFoundError('Public booking portal not found');
      const ent = await c.entitlements.forWorkspace(ws.id.value);
      if (!ent.publicBookingPortalEnabled) throw new NotFoundError('Public booking portal not found');
      const entry = await scheduling.joinWaitlist.execute({
        tenantId: ws.id.value,
        procedureId: body.procedureId,
        clientName: body.clientName,
        clientEmail: body.clientEmail,
        desiredStartAt: new Date(body.desiredStartAt),
        desiredEndAt: new Date(body.desiredEndAt),
      });
      return { waitlistEntryId: entry.id.value, status: entry.status };
    },
  });

  kit.add({
    method: 'get',
    path: '/health',
    tag: 'Public',
    summary: 'Liveness probe',
    access: 'public',
    handler: async () => ({ status: 'ok', service: 'slotmatrix-api' }),
  });
}
