import request from 'supertest';
import Stripe from 'stripe';
import { afterEach, describe, expect, it } from 'vitest';
import { makeHarness, STRIPE_WEBHOOK_SECRET } from '../support/harness';
import { createApp } from '../../src/presentation/http/app';
import { seedDemoData } from '../../src/seed';
import { loadEnv } from '../../src/infrastructure/mysql-infrastructure';
import {
  assertTenantDocumentKey,
  validateAndBuildTenantUploadKey,
} from '../../src/shared/infrastructure/upload-security';
import { ValidationError, ForbiddenError } from '../../src/shared/domain/errors';

function extractCookie(setCookieHeader: string[] | string | undefined, name: string): string | null {
  if (!setCookieHeader) return null;
  const list = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
  for (const raw of list) {
    const [pair] = raw.split(';');
    const eq = pair.indexOf('=');
    if (eq > 0 && pair.slice(0, eq).trim() === name) {
      return pair.slice(eq + 1).trim();
    }
  }
  return null;
}

describe('Security Hardening Regression Suite (OWASP Top 10:2025 / API Top 10:2023 / ASVS 5.0 / LGPD)', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('rejects unsigned or tampered Stripe webhooks (401) and accepts valid signed webhooks idempotently', async () => {
    const { c } = makeHarness();
    const seeded = await seedDemoData(c);
    const app = createApp(c);

    const payload = JSON.stringify({
      id: 'evt_sec_stripe_1',
      type: 'checkout.session.completed',
      data: {
        object: {
          customer: 'cus_sec_1',
          metadata: { workspace_id: seeded.auraWorkspaceId, plan: 'PRO' },
        },
      },
    });

    // Missing signature -> 401
    await request(app)
      .post('/api/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .send(payload)
      .expect(401);

    // Tampered signature -> 401
    await request(app)
      .post('/api/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', 't=12345,v1=deadbeef')
      .send(payload)
      .expect(401);

    // Verify Aura stays STARTER
    const subBefore = await c.infra.subscriptions.findByTenant(seeded.auraWorkspaceId);
    expect(subBefore?.plan).toBe('STARTER');

    // Valid signature -> 200
    const sig = Stripe.webhooks.generateTestHeaderString({
      payload,
      secret: STRIPE_WEBHOOK_SECRET,
    });
    const okRes = await request(app)
      .post('/api/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', sig)
      .send(payload)
      .expect(200);
    expect(okRes.body.status).toBe('processed');

    // Replay -> idempotent duplicate
    const replayRes = await request(app)
      .post('/api/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', sig)
      .send(payload)
      .expect(200);
    expect(replayRes.body.status).toBe('duplicate');
  });

  it('blocks /api/billing/simulate when simulator disabled or in production mode', async () => {
    const { c } = makeHarness({ enableBillingSimulator: false, isProduction: false });
    const seeded = await seedDemoData(c);
    const app = createApp(c);

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'owner@aura.test', password: 'Passw0rd!' })
      .expect(200);

    await request(app)
      .post('/api/billing/simulate')
      .set('Authorization', `Bearer ${login.body.token}`)
      .set('x-workspace-id', seeded.auraWorkspaceId)
      .send({ event: 'upgrade', plan: 'ENTERPRISE' })
      .expect(403);
  });

  it('isolates GET /api/admin/metrics strictly to the caller active tenant', async () => {
    const { c } = makeHarness();
    const seeded = await seedDemoData(c);
    const app = createApp(c);

    // Register brand new tenant on STARTER (MRR should be 0, NEVER VitaScan/Aura MRR)
    const reg = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'isolated@clinica.test',
        name: 'Dra Isolada',
        password: 'StrongPassword!9',
        workspaceName: 'Clinica Isolada',
      })
      .expect(201);

    const isolatedMetrics = await request(app)
      .get('/api/admin/metrics')
      .set('Authorization', `Bearer ${reg.body.token}`)
      .set('x-workspace-id', reg.body.workspaceId)
      .expect(200);

    expect(isolatedMetrics.body.mrrCents).toBe(0);
    expect(isolatedMetrics.body.distribution.PRO.total).toBe(0);
    expect(isolatedMetrics.body.distribution.STARTER.total).toBe(1);

    // Cross-tenant header attempt rejected with 403
    await request(app)
      .get('/api/admin/metrics')
      .set('Authorization', `Bearer ${reg.body.token}`)
      .set('x-workspace-id', seeded.vitascanWorkspaceId)
      .expect(403);
  });

  it('enforces HttpOnly cookie authentication and revokes JWT immediately on logout', async () => {
    const { c } = makeHarness();
    const seeded = await seedDemoData(c);
    const app = createApp(c);

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'owner@vitascan.test', password: 'Passw0rd!' })
      .expect(200);

    const setCookieHeader = loginRes.headers['set-cookie'] as unknown as string[] | undefined;
    expect(setCookieHeader?.some((s) => s.includes('HttpOnly') && s.includes('SameSite=Lax'))).toBe(true);
    const cookieValue = extractCookie(setCookieHeader, 'slotmatrix_session');
    expect(cookieValue).toBeTruthy();

    // Session endpoint works using only HttpOnly cookie
    const sessionOk = await request(app)
      .get('/api/auth/session')
      .set('Cookie', `slotmatrix_session=${cookieValue}`)
      .expect(200);
    expect(sessionOk.body.authenticated).toBe(true);
    expect(sessionOk.body.email).toBe('owner@vitascan.test');

    // Tenant endpoint works using only HttpOnly cookie
    await request(app)
      .get('/api/resources')
      .set('Cookie', `slotmatrix_session=${cookieValue}`)
      .set('x-workspace-id', seeded.vitascanWorkspaceId)
      .expect(200);

    // Logout revokes token jti
    await request(app)
      .post('/api/auth/logout')
      .set('Cookie', `slotmatrix_session=${cookieValue}`)
      .expect(200);

    // Replaying revoked JWT via cookie OR Bearer fails
    const sessionAfter = await request(app)
      .get('/api/auth/session')
      .set('Cookie', `slotmatrix_session=${cookieValue}`)
      .expect(200);
    expect(sessionAfter.body.authenticated).toBe(false);

    await request(app)
      .get('/api/resources')
      .set('Authorization', `Bearer ${loginRes.body.token}`)
      .set('x-workspace-id', seeded.vitascanWorkspaceId)
      .expect(401);
  });

  it('restricts GET /api/members and GET /api/webhook-channels to ADMIN+', async () => {
    const { c } = makeHarness();
    const seeded = await seedDemoData(c);
    const app = createApp(c);

    const specLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'spec@vitascan.test', password: 'Passw0rd!' })
      .expect(200);

    await request(app)
      .get('/api/members')
      .set('Authorization', `Bearer ${specLogin.body.token}`)
      .set('x-workspace-id', seeded.vitascanWorkspaceId)
      .expect(403);

    await request(app)
      .get('/api/webhook-channels')
      .set('Authorization', `Bearer ${specLogin.body.token}`)
      .set('x-workspace-id', seeded.vitascanWorkspaceId)
      .expect(403);
  });

  it('locks down document uploads and downloads against unauthenticated access, XSS types, spoofing, and IDOR/traversal', async () => {
    const { c } = makeHarness();
    const seeded = await seedDemoData(c);
    const app = createApp(c);

    // Unauthenticated upload/download -> 401
    await request(app)
      .post('/api/upload')
      .attach('file', Buffer.from('%PDF-1.4\n'), 'exam.pdf')
      .expect(401);

    await request(app)
      .get(`/api/documents/workspaces/${seeded.vitascanWorkspaceId}/docs/test.pdf`)
      .expect(401);

    const specLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'spec@vitascan.test', password: 'Passw0rd!' })
      .expect(200);

    // SPECIALIST lacks COORDINATOR+ permission -> 403
    await request(app)
      .post('/api/upload')
      .set('Authorization', `Bearer ${specLogin.body.token}`)
      .set('x-workspace-id', seeded.vitascanWorkspaceId)
      .attach('file', Buffer.from('%PDF-1.4\n'), 'exam.pdf')
      .expect(403);

    const ownerLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'owner@vitascan.test', password: 'Passw0rd!' })
      .expect(200);

    // SVG XSS attempt -> 422
    await request(app)
      .post('/api/upload')
      .set('Authorization', `Bearer ${ownerLogin.body.token}`)
      .set('x-workspace-id', seeded.vitascanWorkspaceId)
      .attach('file', Buffer.from('<svg onload="alert(1)"/>'), { filename: 'xss.svg', contentType: 'image/svg+xml' })
      .expect(422);

    // Fake PDF magic bytes -> 422
    await request(app)
      .post('/api/upload')
      .set('Authorization', `Bearer ${ownerLogin.body.token}`)
      .set('x-workspace-id', seeded.vitascanWorkspaceId)
      .attach('file', Buffer.from('<html>not-a-pdf</html>'), { filename: 'fake.pdf', contentType: 'application/pdf' })
      .expect(422);

    // Cross-tenant key access -> 403
    await request(app)
      .get(`/api/documents/workspaces/${seeded.auraWorkspaceId}/docs/secret.pdf`)
      .set('Authorization', `Bearer ${ownerLogin.body.token}`)
      .set('x-workspace-id', seeded.vitascanWorkspaceId)
      .expect(403);

    // Path traversal attempt -> 403
    await request(app)
      .get(`/api/documents/workspaces/${seeded.vitascanWorkspaceId}/docs/..%2F..%2Fetc%2Fpasswd.pdf`)
      .set('Authorization', `Bearer ${ownerLogin.body.token}`)
      .set('x-workspace-id', seeded.vitascanWorkspaceId)
      .expect(403);

    // Pure validator unit assertions
    const valid = validateAndBuildTenantUploadKey(seeded.vitascanWorkspaceId, 'application/pdf', Buffer.from('%PDF-1.7 test'));
    expect(valid.key.startsWith(`workspaces/${seeded.vitascanWorkspaceId}/docs/`)).toBe(true);
    expect(() =>
      validateAndBuildTenantUploadKey(seeded.vitascanWorkspaceId, 'image/svg+xml', Buffer.from('<svg/>')),
    ).toThrow(ValidationError);
    expect(() =>
      assertTenantDocumentKey(seeded.vitascanWorkspaceId, `workspaces/${seeded.auraWorkspaceId}/docs/abc.pdf`),
    ).toThrow(ForbiddenError);
  });

  it('prevents concurrent TOCTOU quota bypass on STARTER resource creation', async () => {
    const { c } = makeHarness();
    const app = createApp(c);

    const reg = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'toctou@clinica.test',
        name: 'Dra Quota',
        password: 'StrongPassword!9',
        workspaceName: 'Clinica Quota',
      })
      .expect(201);

    const requests = Array.from({ length: 8 }, (_, idx) =>
      request(app)
        .post('/api/resources')
        .set('Authorization', `Bearer ${reg.body.token}`)
        .set('x-workspace-id', reg.body.workspaceId)
        .send({ name: `Sala Concorrente ${idx + 1}`, category: 'ROOM', capabilities: ['ECO'] }),
    );

    const results = await Promise.all(requests);
    const created = results.filter((r) => r.status === 201);
    const quotaRejected = results.filter((r) => r.status === 402);

    expect(created).toHaveLength(5);
    expect(quotaRejected).toHaveLength(3);
  });

  it('prevents double-booking and returns clean 409 conflicts under concurrent identical booking requests', async () => {
    const { c } = makeHarness();
    const seeded = await seedDemoData(c);
    const app = createApp(c);

    const slot = '2026-06-15T14:00:00.000Z';
    const bookingRequests = Array.from({ length: 6 }, (_, idx) =>
      request(app)
        .post('/api/public/book/vitascan-diagnosticos/schedule')
        .send({
          procedureId: seeded.vitascanProcedureId,
          startAt: slot,
          clientName: `Paciente ${idx + 1}`,
          clientEmail: `pac${idx + 1}@example.com`,
        }),
    );

    const results = await Promise.all(bookingRequests);
    const created = results.filter((r) => r.status === 201);
    const conflicts = results.filter((r) => r.status === 409);
    const serverErrors = results.filter((r) => r.status >= 500);

    // VitaScan has 2 parallel Doppler combinations (2 specialists x 2 rooms x 2 USG_DOPPLER_HD equipments)
    expect(serverErrors).toHaveLength(0);
    expect(created).toHaveLength(2);
    expect(conflicts).toHaveLength(4);

    // Verify zero resource double-allocation across the 2 concurrent bookings
    const allocatedIds = created.flatMap((r) =>
      (r.body.allocations ?? []).map((a: { resourceId: string }) => a.resourceId),
    );
    expect(new Set(allocatedIds).size).toBe(allocatedIds.length);
  });

  it('enforces CORS allowlist, security headers, Swagger prod gating, and auth rate limiting', async () => {
    const { c } = makeHarness({
      enableApiDocs: false,
      corsOrigins: ['https://app.slotmatrix.clinic'],
    });
    const app = createApp(c);

    // Swagger disabled when enableApiDocs=false
    await request(app).get('/api/openapi.json').expect(404);

    // Security headers present and CORS rejects untrusted Origin
    const evilHealth = await request(app)
      .get('/api/health')
      .set('Origin', 'https://evil.example.com')
      .expect(200);
    expect(evilHealth.headers['x-powered-by']).toBeUndefined();
    expect(evilHealth.headers['x-content-type-options']).toBe('nosniff');
    expect(evilHealth.headers['x-frame-options']).toBe('DENY');
    expect(evilHealth.headers['access-control-allow-origin']).toBeUndefined();

    // Allowed origin receives CORS header + credentials
    const okHealth = await request(app)
      .get('/api/health')
      .set('Origin', 'https://app.slotmatrix.clinic')
      .expect(200);
    expect(okHealth.headers['access-control-allow-origin']).toBe('https://app.slotmatrix.clinic');
    expect(okHealth.headers['access-control-allow-credentials']).toBe('true');

    // Auth brute-force rate limit triggers 429 after 30 failed attempts
    for (let i = 0; i < 30; i += 1) {
      await request(app)
        .post('/api/auth/login')
        .send({ email: 'nobody@slotmatrix.test', password: 'wrong' });
    }
    const throttled = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@slotmatrix.test', password: 'wrong' })
      .expect(429);
    expect(throttled.body.error).toBe('RATE_LIMITED');
    expect(throttled.headers['retry-after']).toBeDefined();
  });

  it('fails closed in loadEnv() when NODE_ENV=production lacks strong secrets', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.JWT_SECRET;
    process.env.BILLING_WEBHOOK_SECRET = 'valid_billing_secret_more_than_24_chars';
    expect(() => loadEnv()).toThrow(/JWT_SECRET/);

    process.env.JWT_SECRET = 'slotmatrix-production-grade-secret-key-2026'; // known weak default
    expect(() => loadEnv()).toThrow(/JWT_SECRET/);

    process.env.JWT_SECRET = 'ultra_strong_random_jwt_secret_for_prod_998877';
    const cfg = loadEnv();
    expect(cfg.isProduction).toBe(true);
    expect(cfg.enableBillingSimulator).toBe(false);
    expect(cfg.enableApiDocs).toBe(false);
  });
});
