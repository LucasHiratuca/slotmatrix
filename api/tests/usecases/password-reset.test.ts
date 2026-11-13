import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { makeHarness, registerTenant } from '../support/harness';
import { createApp } from '../../src/presentation/http/app';
import { UnauthorizedError, ValidationError } from '../../src/shared/domain/errors';

describe('Password Recovery & Reset Cycle (RequestPasswordReset & ResetPassword)', () => {
  it('requests password reset, dispatches email with token, and updates password successfully', async () => {
    const h = makeHarness();
    const t = await registerTenant(h, 'Clinica Reset Test');

    // 1. Request password reset for existing user
    const requestRes = await h.c.tenancy.forgotPassword.execute({ email: t.email });
    expect(requestRes.message).toContain('password reset link has been sent');
    expect(h.emails.sentEmails).toHaveLength(1);

    const sentEmail = h.emails.sentEmails[0];
    expect(sentEmail.toEmail).toBe(t.email);
    expect(sentEmail.resetToken).toBeDefined();
    expect(sentEmail.resetToken.length).toBeGreaterThan(32);
    expect(sentEmail.resetUrl).toContain(sentEmail.resetToken);

    // 2. User cannot login with new password before resetting
    await expect(
      h.c.tenancy.login.execute({ email: t.email, password: 'NewSecurePassw0rd!2026' }),
    ).rejects.toBeInstanceOf(UnauthorizedError);

    // 3. Reset password using the received token
    const resetRes = await h.c.tenancy.resetPassword.execute({
      token: sentEmail.resetToken,
      password: 'NewSecurePassw0rd!2026',
    });
    expect(resetRes.success).toBe(true);

    // 4. Old password fails login
    await expect(
      h.c.tenancy.login.execute({ email: t.email, password: 'Passw0rd!' }),
    ).rejects.toBeInstanceOf(UnauthorizedError);

    // 5. New password succeeds login
    const loginRes = await h.c.tenancy.login.execute({
      email: t.email,
      password: 'NewSecurePassw0rd!2026',
    });
    expect(loginRes.userId).toBe(t.userId);
    expect(loginRes.token).toBeDefined();

    // 6. Token replay attack: token cannot be reused
    await expect(
      h.c.tenancy.resetPassword.execute({
        token: sentEmail.resetToken,
        password: 'AnotherPassw0rd!2026',
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('anti-enumeration: non-existent email returns generic success and sends no email', async () => {
    const h = makeHarness();
    const res = await h.c.tenancy.forgotPassword.execute({ email: 'ghost@nonexistent.domain' });
    expect(res.message).toContain('password reset link has been sent');
    expect(h.emails.sentEmails).toHaveLength(0);
  });

  it('rejects expired reset token (TTL 1 hour)', async () => {
    const h = makeHarness();
    const t = await registerTenant(h, 'Clinica Expire Test');

    await h.c.tenancy.forgotPassword.execute({ email: t.email });
    const token = h.emails.sentEmails[0].resetToken;

    // Advance clock by 61 minutes
    h.clock.advance(61 * 60 * 1000);

    await expect(
      h.c.tenancy.resetPassword.execute({ token, password: 'NewSecurePassw0rd!2026' }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('validates password constraints (< 8 characters)', async () => {
    const h = makeHarness();
    const t = await registerTenant(h, 'Clinica Short Pass Test');

    await h.c.tenancy.forgotPassword.execute({ email: t.email });
    const token = h.emails.sentEmails[0].resetToken;

    await expect(
      h.c.tenancy.resetPassword.execute({ token, password: 'short' }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('validates full HTTP API endpoints: /api/auth/forgot-password and /api/auth/reset-password', async () => {
    const h = makeHarness();
    const t = await registerTenant(h, 'Clinica HTTP Auth Test');
    const app = createApp(h.c);

    // 1. HTTP Forgot Password
    const forgotRes = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: t.email })
      .expect(200);

    expect(forgotRes.body.message).toContain('password reset link has been sent');
    expect(h.emails.sentEmails).toHaveLength(1);
    const token = h.emails.sentEmails[0].resetToken;

    // 2. HTTP Reset Password
    const resetRes = await request(app)
      .post('/api/auth/reset-password')
      .send({ token, password: 'BrandNewPassw0rd!2026' })
      .expect(200);

    expect(resetRes.body.success).toBe(true);

    // 3. Login with newly reset password via HTTP
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: t.email, password: 'BrandNewPassw0rd!2026' })
      .expect(200);

    expect(loginRes.body.userId).toBe(t.userId);
    expect(loginRes.body.token).toBeDefined();

    // 4. Old password fails with 401 Unauthorized
    await request(app)
      .post('/api/auth/login')
      .send({ email: t.email, password: 'Passw0rd!' })
      .expect(401);
  });
});
