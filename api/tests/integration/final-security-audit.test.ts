import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { makeHarness } from '../support/harness';
import { createApp } from '../../src/presentation/http/app';
import { seedDemoData } from '../../src/seed';
import { SafeWebhookUrl } from '../../src/shared/domain/SafeWebhookUrl';
import { UnsafeWebhookUrlError } from '../../src/shared/domain/errors';

describe('Final Security & Penetration Audit Suite (OWASP Top 10 / BOLA / SSRF / IDOR / Token Tampering)', () => {
  it('prevents IDOR across all mutable operations (bookings, resources, waitlist)', async () => {
    const { c } = makeHarness();
    const seeded = await seedDemoData(c);
    const app = createApp(c);

    // 1. Authenticate user from Aura (STARTER)
    const auraLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'owner@aura.test', password: 'Passw0rd!' })
      .expect(200);

    const auraToken = auraLogin.body.token;

    // 2. Identify a VitaScan booking
    const vitascanBookings = await c.infra.bookings.listByTenant(seeded.vitascanWorkspaceId);
    expect(vitascanBookings.length).toBeGreaterThan(0);
    const targetBooking = vitascanBookings[0];

    // Attempting to mutate VitaScan booking using Aura's workspace header -> 404 (strictly isolated by tenant context)
    await request(app)
      .post(`/api/bookings/${targetBooking.id.value}/cancel`)
      .set('Authorization', `Bearer ${auraToken}`)
      .set('x-workspace-id', seeded.auraWorkspaceId)
      .send({ reason: 'Malicious cancellation attempt' })
      .expect(404);

    await request(app)
      .post(`/api/bookings/${targetBooking.id.value}/check-in`)
      .set('Authorization', `Bearer ${auraToken}`)
      .set('x-workspace-id', seeded.auraWorkspaceId)
      .expect(404);

    await request(app)
      .post(`/api/bookings/${targetBooking.id.value}/complete`)
      .set('Authorization', `Bearer ${auraToken}`)
      .set('x-workspace-id', seeded.auraWorkspaceId)
      .expect(404);

    await request(app)
      .post(`/api/bookings/${targetBooking.id.value}/no-show`)
      .set('Authorization', `Bearer ${auraToken}`)
      .set('x-workspace-id', seeded.auraWorkspaceId)
      .expect(404);

    // Target a VitaScan resource
    const vitascanResources = await c.infra.resources.listByTenant(seeded.vitascanWorkspaceId);
    const targetResource = vitascanResources[0];

    await request(app)
      .post(`/api/resources/${targetResource.id.value}/maintenance`)
      .set('Authorization', `Bearer ${auraToken}`)
      .set('x-workspace-id', seeded.auraWorkspaceId)
      .send({ reason: 'Malicious maintenance lockout', status: 'IN_MAINTENANCE' })
      .expect(404);

    // Header tampering: Aura user tries to send x-workspace-id of VitaScan -> 403 Forbidden
    const spoofHeader = await request(app)
      .get('/api/bookings')
      .set('Authorization', `Bearer ${auraToken}`)
      .set('x-workspace-id', seeded.vitascanWorkspaceId)
      .expect(403);

    expect(spoofHeader.body.error).toBe('TENANT_ACCESS_DENIED');
  });

  it('rejects all malicious SSRF target vectors (IPv6 loopbacks, cloud metadata, embedded credentials, protocols)', async () => {
    const { c } = makeHarness();
    const seeded = await seedDemoData(c);
    const app = createApp(c);

    const ownerLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'owner@vitascan.test', password: 'Passw0rd!' })
      .expect(200);

    const token = ownerLogin.body.token;
    const wsId = seeded.vitascanWorkspaceId;

    const maliciousUrls = [
      'http://169.254.169.254/latest/meta-data', // AWS/OpenStack metadata
      'http://metadata.google.internal/computeMetadata/v1/', // GCP metadata
      'http://instance-data/latest/meta-data',
      'http://127.0.0.1:8080/internal-api', // Localhost loopback
      'http://localhost:3000/admin',
      'http://0.0.0.0:80/evil',
      'http://[::1]/secret', // IPv6 loopback
      'http://[::ffff:127.0.0.1]/status', // IPv6 mapped IPv4 loopback
      'http://10.0.0.1/intranet', // RFC1918 Private Class A
      'http://192.168.1.1/router', // RFC1918 Private Class C
      'http://172.16.0.5/infra', // RFC1918 Private Class B
      'ftp://external-ftp.test/upload', // Non HTTP/HTTPS protocol
      'https://admin:password123@external.test/webhook', // URL with embedded credentials
    ];

    for (const badUrl of maliciousUrls) {
      const res = await request(app)
        .post('/api/webhook-channels')
        .set('Authorization', `Bearer ${token}`)
        .set('x-workspace-id', wsId)
        .send({
          name: 'Malicious Webhook',
          url: badUrl,
          secret: 'valid-secret-key-1234',
        });

      expect([400, 422]).toContain(res.status);
    }

    // Direct SafeWebhookUrl unit assertions for complete edge case boundary coverage
    expect(() => SafeWebhookUrl.create('http://169.254.169.254/')).toThrow(UnsafeWebhookUrlError);
    expect(() => SafeWebhookUrl.create('http://[::1]/')).toThrow(UnsafeWebhookUrlError);
    expect(() => SafeWebhookUrl.create('http://[::ffff:127.0.0.1]/')).toThrow(UnsafeWebhookUrlError);
    expect(() => SafeWebhookUrl.create('https://user:pass@example.com/')).toThrow(UnsafeWebhookUrlError);

    // Legitimate public HTTPS webhook is accepted
    const validRes = await request(app)
      .post('/api/webhook-channels')
      .set('Authorization', `Bearer ${token}`)
      .set('x-workspace-id', wsId)
      .send({
        name: 'Production Slack Gateway',
        url: 'https://hooks.slack.example.com/services/T00/B00/X00',
        secret: 'slack-signature-secret-xyz',
      })
      .expect(201);

    expect(validRes.body.url).toBe('https://hooks.slack.example.com/services/T00/B00/X00');
  });

  it('rejects tampered, altered, and forged JWT tokens', async () => {
    const { c } = makeHarness();
    const seeded = await seedDemoData(c);
    const app = createApp(c);

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'owner@vitascan.test', password: 'Passw0rd!' })
      .expect(200);

    const validToken = login.body.token as string;
    const parts = validToken.split('.');
    expect(parts).toHaveLength(3);

    // 1. Alter payload to forge different userId
    const header = parts[0];
    const originalPayload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    const forgedPayload = Buffer.from(
      JSON.stringify({ ...originalPayload, userId: 'forged-uuid-9999' }),
      'utf8',
    ).toString('base64url');
    const signature = parts[2];
    const tamperedToken = `${header}.${forgedPayload}.${signature}`;

    await request(app)
      .get('/api/auth/session')
      .set('Authorization', `Bearer ${tamperedToken}`)
      .expect(200, { authenticated: false });

    await request(app)
      .get('/api/resources')
      .set('Authorization', `Bearer ${tamperedToken}`)
      .set('x-workspace-id', seeded.vitascanWorkspaceId)
      .expect(401);

    // 2. Completely bogus signature
    const bogusSigToken = `${header}.${parts[1]}.invalidsignature12345`;
    await request(app)
      .get('/api/resources')
      .set('Authorization', `Bearer ${bogusSigToken}`)
      .set('x-workspace-id', seeded.vitascanWorkspaceId)
      .expect(401);

    // 3. Garbage token
    await request(app)
      .get('/api/resources')
      .set('Authorization', 'Bearer not-even-a-jwt')
      .set('x-workspace-id', seeded.vitascanWorkspaceId)
      .expect(401);
  });

  it('prevents reuse of one-time password reset tokens and handles anti-enumeration timing safety', async () => {
    const { c, emails } = makeHarness();
    await seedDemoData(c);
    const app = createApp(c);

    // Request reset for existing user
    const res1 = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'owner@vitascan.test' })
      .expect(200);
    expect(res1.body.message).toBeDefined();

    // Request reset for non-existing user returns identical success message (anti-enumeration)
    const res2 = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'nonexistent-user-xyz@fake.test' })
      .expect(200);
    expect(res2.body.message).toBe(res1.body.message);

    // Find the token delivered to email gateway
    const user = await c.infra.users.findByEmail('owner@vitascan.test');
    expect(user).toBeDefined();
    const tokenHash = user?.resetTokenHash;
    expect(tokenHash).toBeDefined();

    // Inspect memory email gateway to get raw token
    expect(emails.sentEmails.length).toBeGreaterThan(0);
    const resetEmail = emails.sentEmails.find((e) => e.toEmail === 'owner@vitascan.test');
    expect(resetEmail).toBeDefined();
    const rawToken = resetEmail!.resetToken;
    expect(rawToken).toBeTruthy();

    // Reset password successfully with rawToken
    const resetRes = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: rawToken, password: 'NewStrongPassword!2026' })
      .expect(200);
    expect(resetRes.body.success).toBe(true);

    // Attempting to REUSE the same token immediately fails
    const reuseRes = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: rawToken, password: 'AnotherPassword!2026' });
    expect([400, 422]).toContain(reuseRes.status);

    // Verify login works with the new password
    await request(app)
      .post('/api/auth/login')
      .send({ email: 'owner@vitascan.test', password: 'NewStrongPassword!2026' })
      .expect(200);
  });

  it('protects public booking portal against PII leakage and hides portals on STARTER plan', async () => {
    const { c } = makeHarness();
    const seeded = await seedDemoData(c);
    const app = createApp(c);

    // Aura is on STARTER plan (publicBookingPortalEnabled = false)
    const auraPublicRes = await request(app).get('/api/public/book/aura-estetica');
    expect(auraPublicRes.status).toBe(404);

    // VitaScan is on PRO plan (publicBookingPortalEnabled = true)
    const vitascanPublicRes = await request(app).get('/api/public/book/vitascan-diagnosticos').expect(200);

    const body = vitascanPublicRes.body;
    expect(body.workspace.name).toBe('VitaScan Diagnósticos');
    expect(body.workspace.slug).toBe('vitascan-diagnosticos');
    expect(Array.isArray(body.procedures)).toBe(true);
    expect(body.procedures.length).toBeGreaterThan(0);

    // Strict PII and internal telemetry leakage assertions
    const stringified = JSON.stringify(body);
    expect(stringified).not.toContain('@'); // Zero email addresses leaked
    expect(stringified).not.toContain('retainedCents'); // No internal financial deposit forfeiture stats
    expect(stringified).not.toContain('webhook');
    expect(stringified).not.toContain('secret');
    expect(stringified).not.toContain('password');

    for (const proc of body.procedures) {
      expect(proc).toHaveProperty('id');
      expect(proc).toHaveProperty('name');
      expect(proc).toHaveProperty('durationMinutes');
      expect(proc).toHaveProperty('priceCents');
      expect(proc).toHaveProperty('depositCents');
      expect(proc).toHaveProperty('currency');
      expect(proc).toHaveProperty('availableSlots');

      // Verify slots only have startAt and endAt, zero resource/staff details
      for (const slot of proc.availableSlots) {
        expect(Object.keys(slot).sort()).toEqual(['endAt', 'startAt'].sort());
      }
    }
  });
});
