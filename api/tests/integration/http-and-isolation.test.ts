import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { makeHarness } from '../support/harness';
import { createApp } from '../../src/presentation/http/app';
import { seedDemoData } from '../../src/seed';
import { signBillingPayload } from '../../src/billing/infrastructure/BillingWebhookAcl';

describe('HTTP Presentation Layer, RBAC, Public Portal & Multi-Tenant Isolation', () => {
  it('authenticates seeded users, enforces RBAC roles, and maps DomainErrors to proper HTTP status codes', async () => {
    const { c } = makeHarness();
    const seeded = await seedDemoData(c);
    const app = createApp(c);

    // Login as Aura Owner (STARTER at 5/5 active resources)
    const auraLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'owner@aura.test', password: 'Passw0rd!' })
      .expect(200);

    const auraToken = auraLogin.body.token as string;

    // Attempting to create 6th resource in Estúdio Aura returns 402 QuotaExceededError
    const quotaRes = await request(app)
      .post('/api/resources')
      .set('Authorization', `Bearer ${auraToken}`)
      .set('x-workspace-id', seeded.auraWorkspaceId)
      .send({
        name: 'Recurso 06 Bloqueado',
        category: 'EQUIPMENT',
        capabilities: ['LASER_CO2'],
      })
      .expect(402);

    expect(quotaRes.body.error).toBe('QUOTA_EXCEEDED');

    // Login as VitaScan Specialist (read-only for resource catalog creation)
    const specLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'spec@vitascan.test', password: 'Passw0rd!' })
      .expect(200);

    const specToken = specLogin.body.token as string;

    // SPECIALIST cannot create a BookableResource (requires ADMIN -> 403)
    await request(app)
      .post('/api/resources')
      .set('Authorization', `Bearer ${specToken}`)
      .set('x-workspace-id', seeded.vitascanWorkspaceId)
      .send({
        name: 'Tentativa Specialist',
        category: 'ROOM',
        capabilities: ['SALA_ESTERIL'],
      })
      .expect(403);
  });

  it('verifies Billing Webhook signature and idempotency over HTTP', async () => {
    const { c } = makeHarness();
    const seeded = await seedDemoData(c);
    const app = createApp(c);

    const rawBody = JSON.stringify({
      id: 'evt_http_upgrade_aura_1',
      type: 'checkout.session.completed',
      data: {
        object: {
          customer: 'cus_aura_pro',
          metadata: {
            workspace_id: seeded.auraWorkspaceId,
            plan: 'PRO',
          },
        },
      },
    });

    // Invalid signature -> 401
    await request(app)
      .post('/api/webhooks/billing')
      .set('Content-Type', 'application/json')
      .set('x-billing-signature', 'invalid_signature')
      .send(rawBody)
      .expect(401);

    // Valid signature -> 200
    const validSig = signBillingPayload(rawBody, c.config.billingWebhookSecret);
    const firstCall = await request(app)
      .post('/api/webhooks/billing')
      .set('Content-Type', 'application/json')
      .set('x-billing-signature', validSig)
      .send(rawBody)
      .expect(200);

    expect(firstCall.body.status).toBe('processed');

    // Replay same eventId -> 200 with status: 'duplicate'
    const replayCall = await request(app)
      .post('/api/webhooks/billing')
      .set('Content-Type', 'application/json')
      .set('x-billing-signature', validSig)
      .send(rawBody)
      .expect(200);

    expect(replayCall.body.status).toBe('duplicate');
  });

  it('hides Public Self-Booking Portal on STARTER (404) and serves sanitized payload on PRO', async () => {
    const { c } = makeHarness();
    await seedDemoData(c);
    const app = createApp(c);

    // Estúdio Aura is on STARTER -> Public Portal disabled (404)
    await request(app).get('/api/public/book/estudio-aura').expect(404);

    // VitaScan is on PRO -> Public Portal enabled (200)
    const pubRes = await request(app).get('/api/public/book/vitascan-diagnosticos').expect(200);
    expect(pubRes.body.workspace.name).toBe('VitaScan Diagnósticos');
    expect(pubRes.body.procedures.length).toBeGreaterThanOrEqual(2);
    // Ensure internal resource IDs or member emails are never leaked
    expect(pubRes.body.members).toBeUndefined();
  });

  it('enforces strict Multi-Tenant Isolation across all tenant-scoped endpoints', async () => {
    const { c } = makeHarness();
    const seeded = await seedDemoData(c);
    const app = createApp(c);

    // Authenticate as Owner of Workspace A (Estúdio Aura)
    const auraLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'owner@aura.test', password: 'Passw0rd!' })
      .expect(200);
    const auraToken = auraLogin.body.token as string;

    // 1. Passing Workspace B's ID in x-workspace-id header while authenticated as Workspace A user -> 403 FORBIDDEN
    await request(app)
      .get('/api/resources')
      .set('Authorization', `Bearer ${auraToken}`)
      .set('x-workspace-id', seeded.vitascanWorkspaceId)
      .expect(403);

    await request(app)
      .get('/api/bookings')
      .set('Authorization', `Bearer ${auraToken}`)
      .set('x-workspace-id', seeded.vitascanWorkspaceId)
      .expect(403);

    // 2. Trying to cancel or check-in Workspace B's booking while scoped to Workspace A -> 404 NOT_FOUND
    await request(app)
      .post(`/api/bookings/${seeded.cancellableConfirmedBookingId}/cancel`)
      .set('Authorization', `Bearer ${auraToken}`)
      .set('x-workspace-id', seeded.auraWorkspaceId)
      .send({ reason: 'Cross-tenant attack attempt' })
      .expect(404);

    await request(app)
      .post(`/api/bookings/${seeded.cancellableConfirmedBookingId}/check-in`)
      .set('Authorization', `Bearer ${auraToken}`)
      .set('x-workspace-id', seeded.auraWorkspaceId)
      .expect(404);
  });

  it('manages recurring billing lifecycle: checkout, webhook transitions, customer portal and admin SaaS dashboard metrics', async () => {
    const { c } = makeHarness();
    const seeded = await seedDemoData(c);
    const app = createApp(c);

    // 1. Login as Aura Owner
    const auraLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'owner@aura.test', password: 'Passw0rd!' })
      .expect(200);
    const auraToken = auraLogin.body.token as string;

    // 2. Request Stripe Checkout Session for PRO plan
    const checkoutRes = await request(app)
      .post('/api/billing/checkout')
      .set('Authorization', `Bearer ${auraToken}`)
      .set('x-workspace-id', seeded.auraWorkspaceId)
      .send({ plan: 'PRO' })
      .expect(200);

    expect(checkoutRes.body.checkoutUrl).toBeDefined();

    // 3. Webhook: checkout.session.completed -> Upgrades Estúdio Aura to PRO with customer id
    const checkoutEvent = JSON.stringify({
      id: 'evt_stripe_checkout_aura_pro',
      type: 'checkout.session.completed',
      data: {
        object: {
          customer: 'cus_stripe_aura_test_1',
          metadata: {
            workspace_id: seeded.auraWorkspaceId,
            plan: 'PRO',
          },
        },
      },
    });

    const webRes1 = await request(app)
      .post('/api/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .send(checkoutEvent)
      .expect(200);

    expect(webRes1.body.received).toBe(true);
    expect(webRes1.body.status).toBe('processed');

    // 4. Now that Aura is on PRO, the 6th resource creation that was previously rejected with 402 succeeds!
    const resourceRes = await request(app)
      .post('/api/resources')
      .set('Authorization', `Bearer ${auraToken}`)
      .set('x-workspace-id', seeded.auraWorkspaceId)
      .send({
        name: 'Cabine 06 Pro Exclusiva',
        category: 'ROOM',
        capabilities: ['HIGIENE_FACIAL'],
      })
      .expect(201);

    expect(resourceRes.body.id).toBeDefined();

    // 5. Customer Portal Session creation for self-service
    const portalRes = await request(app)
      .post('/api/billing/portal')
      .set('Authorization', `Bearer ${auraToken}`)
      .set('x-workspace-id', seeded.auraWorkspaceId)
      .expect(200);

    expect(portalRes.body.portalUrl).toBeDefined();

    // 6. Webhook: invoice.payment_failed -> marks subscription PAST_DUE
    const failEvent = JSON.stringify({
      id: 'evt_stripe_invoice_fail_aura',
      type: 'invoice.payment_failed',
      data: {
        object: {
          customer: 'cus_stripe_aura_test_1',
        },
      },
    });

    await request(app)
      .post('/api/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .send(failEvent)
      .expect(200);

    const subAfterFail = await c.infra.subscriptions.findByTenant(seeded.auraWorkspaceId);
    expect(subAfterFail?.status).toBe('PAST_DUE');

    // 7. Webhook: customer.subscription.deleted -> resets workspace back to STARTER
    const cancelEvent = JSON.stringify({
      id: 'evt_stripe_cancel_aura',
      type: 'customer.subscription.deleted',
      data: {
        object: {
          customer: 'cus_stripe_aura_test_1',
        },
      },
    });

    await request(app)
      .post('/api/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .send(cancelEvent)
      .expect(200);

    const subAfterCancel = await c.infra.subscriptions.findByTenant(seeded.auraWorkspaceId);
    expect(subAfterCancel?.status).toBe('CANCELED');
    expect(subAfterCancel?.plan).toBe('STARTER');

    // 8. Admin SaaS Dashboard: MRR and subscription distribution
    const metricsRes = await request(app)
      .get('/api/admin/metrics')
      .set('Authorization', `Bearer ${auraToken}`)
      .set('x-workspace-id', seeded.auraWorkspaceId)
      .expect(200);

    expect(metricsRes.body.mrrFormatted).toBeDefined();
    expect(metricsRes.body.distribution).toBeDefined();
    expect(metricsRes.body.recentLogs).toBeDefined();

    // 9. Non-admin (SPECIALIST) cannot access Admin metrics
    const specLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'spec@vitascan.test', password: 'Passw0rd!' })
      .expect(200);

    await request(app)
      .get('/api/admin/metrics')
      .set('Authorization', `Bearer ${specLogin.body.token}`)
      .set('x-workspace-id', seeded.vitascanWorkspaceId)
      .expect(403);
  });
});
