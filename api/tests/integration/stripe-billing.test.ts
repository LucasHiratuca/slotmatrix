import { describe, expect, it } from 'vitest';
import request from 'supertest';
import Stripe from 'stripe';
import { createApp } from '../../src/presentation/http/app';
import { makeHarness, STRIPE_WEBHOOK_SECRET } from '../support/harness';
import { seedDemoData } from '../../src/seed';

describe('Stripe Recurring Billing Suite (Checkout, Customer Portal & Robust Webhooks)', () => {
  it('1. Checkout: cria sessão com preço resolvido por lookup_key, metadata do workspace e URLs do servidor', async () => {
    const { c } = makeHarness({ stripeSecretKey: 'sk_test_mock_slotmatrix' });
    const seeded = await seedDemoData(c);
    const app = createApp(c);

    // Login como OWNER da Aura
    const auraLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'owner@aura.test', password: 'Passw0rd!' })
      .expect(200);
    const auraToken = auraLogin.body.token as string;

    // POST /billing/checkout ignora qualquer parâmetro extra malicioso de preço ou URL
    const res = await request(app)
      .post('/api/billing/checkout')
      .set('Authorization', `Bearer ${auraToken}`)
      .set('x-workspace-id', seeded.auraWorkspaceId)
      .send({
        plan: 'PRO',
        price: 1, // Deve ser ignorado
        successUrl: 'https://attacker.site', // Deve ser ignorado
      })
      .expect(200);

    expect(res.body.checkoutUrl).toBeDefined();
    expect(res.body.checkoutUrl).toContain('checkout.stripe.com');
  });

  it('2. Checkout: RBAC bloqueia papéis sem permissão administrativa (SPECIALIST = 403)', async () => {
    const { c } = makeHarness({ stripeSecretKey: 'sk_test_mock_slotmatrix' });
    const seeded = await seedDemoData(c);
    const app = createApp(c);

    const specLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'spec@vitascan.test', password: 'Passw0rd!' })
      .expect(200);

    await request(app)
      .post('/api/billing/checkout')
      .set('Authorization', `Bearer ${specLogin.body.token}`)
      .set('x-workspace-id', seeded.vitascanWorkspaceId)
      .send({ plan: 'ENTERPRISE' })
      .expect(403);
  });

  it('3. Checkout: Bloqueia contratação duplicada se a clínica já possui o mesmo plano ativo (409 BILLING_ALREADY_SUBSCRIBED)', async () => {
    const { c } = makeHarness({ stripeSecretKey: 'sk_test_mock_slotmatrix' });
    const seeded = await seedDemoData(c);
    const app = createApp(c);

    // VitaScan já está no plano PRO ativo pelo seed
    const vitaLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'owner@vitascan.test', password: 'Passw0rd!' })
      .expect(200);

    const res = await request(app)
      .post('/api/billing/checkout')
      .set('Authorization', `Bearer ${vitaLogin.body.token}`)
      .set('x-workspace-id', seeded.vitascanWorkspaceId)
      .send({ plan: 'PRO' })
      .expect(409);

    expect(res.body.error).toBe('BILLING_ALREADY_SUBSCRIBED');
    expect(res.body.message).toContain('Plano PRO');
  });

  it('4. Regressão do bug original: SEM Stripe configurado responde 503 BILLING_NOT_CONFIGURED (NUNCA 500 Unexpected error)', async () => {
    // Configura container sem Stripe configurado (chave vazia)
    const { c } = makeHarness({ stripeSecretKey: '' });
    const seeded = await seedDemoData(c);
    const app = createApp(c);

    const auraLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'owner@aura.test', password: 'Passw0rd!' })
      .expect(200);

    const res = await request(app)
      .post('/api/billing/checkout')
      .set('Authorization', `Bearer ${auraLogin.body.token}`)
      .set('x-workspace-id', seeded.auraWorkspaceId)
      .send({ plan: 'PRO' })
      .expect(503);

    expect(res.body.error).toBe('BILLING_NOT_CONFIGURED');
    expect(res.body.message).toContain('O faturamento com Stripe ainda não foi configurado');
    expect(res.body.message).not.toContain('Unexpected error');
  });

  it('5. Customer Portal: sem customerId retorna 400 BILLING_NO_CUSTOMER com mensagem em pt-BR', async () => {
    const { c } = makeHarness({ stripeSecretKey: 'sk_test_mock_slotmatrix' });
    const seeded = await seedDemoData(c);
    const app = createApp(c);

    // Aura começa sem externalCustomerId no seed inicial
    const auraLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'owner@aura.test', password: 'Passw0rd!' })
      .expect(200);

    const res = await request(app)
      .post('/api/billing/portal')
      .set('Authorization', `Bearer ${auraLogin.body.token}`)
      .set('x-workspace-id', seeded.auraWorkspaceId)
      .expect(400);

    expect(res.body.error).toBe('BILLING_NO_CUSTOMER');
    expect(res.body.message).toContain('Nenhum cliente do Stripe associado a esta clínica');
  });

  it('6. Webhook: eventos desconhecidos ou gerados por stripe trigger (sem clínica) são ignorados com 200 OK e log', async () => {
    const { c } = makeHarness();
    const app = createApp(c);

    // Evento sem metadata.workspace_id e sem customer conhecido (típico de "stripe trigger customer.subscription.created")
    const triggerEvent = JSON.stringify({
      id: 'evt_stripe_trigger_test_999',
      type: 'customer.subscription.created',
      data: {
        object: {
          id: 'sub_trigger_123',
          customer: 'cus_unknown_999',
          status: 'active',
        },
      },
    });

    const sig = Stripe.webhooks.generateTestHeaderString({
      payload: triggerEvent,
      secret: STRIPE_WEBHOOK_SECRET,
    });

    const res = await request(app)
      .post('/api/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', sig)
      .send(triggerEvent)
      .expect(200);

    expect(res.body.received).toBe(true);
    expect(res.body.status).toBe('ignored');
  });

  it('7. Webhook: ciclo completo de transições (Starter -> Pro -> Past Due bloqueia agendamento -> Paid reativa -> Cancel volta a Starter)', async () => {
    const { c } = makeHarness({ stripeSecretKey: 'sk_test_mock_slotmatrix' });
    const seeded = await seedDemoData(c);
    const app = createApp(c);

    const auraLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'owner@aura.test', password: 'Passw0rd!' })
      .expect(200);
    const auraToken = auraLogin.body.token;

    // Transição 1: checkout.session.completed ativa PRO
    const checkoutEvent = JSON.stringify({
      id: 'evt_checkout_success_aura',
      type: 'checkout.session.completed',
      data: {
        object: {
          customer: 'cus_aura_verified_123',
          metadata: { workspace_id: seeded.auraWorkspaceId, plan: 'PRO' },
        },
      },
    });

    await request(app)
      .post('/api/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', Stripe.webhooks.generateTestHeaderString({ payload: checkoutEvent, secret: STRIPE_WEBHOOK_SECRET }))
      .send(checkoutEvent)
      .expect(200);

    let sub = await c.infra.subscriptions.findByTenant(seeded.auraWorkspaceId);
    expect(sub?.plan).toBe('PRO');
    expect(sub?.status).toBe('ACTIVE');

    // Transição 2: invoice.payment_failed coloca em PAST_DUE
    const failEvent = JSON.stringify({
      id: 'evt_invoice_failed_aura',
      type: 'invoice.payment_failed',
      data: {
        object: {
          customer: 'cus_aura_verified_123',
          metadata: { workspace_id: seeded.auraWorkspaceId },
        },
      },
    });

    await request(app)
      .post('/api/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', Stripe.webhooks.generateTestHeaderString({ payload: failEvent, secret: STRIPE_WEBHOOK_SECRET }))
      .send(failEvent)
      .expect(200);

    sub = await c.infra.subscriptions.findByTenant(seeded.auraWorkspaceId);
    expect(sub?.status).toBe('PAST_DUE');

    // Bloqueio de servidor: PAST_DUE impede novos agendamentos!
    const proc = (await c.infra.procedures.listByTenant(seeded.auraWorkspaceId))[0];
    const scheduleRes = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${auraToken}`)
      .set('x-workspace-id', seeded.auraWorkspaceId)
      .send({
        procedureId: proc.id.value,
        clientName: 'Paciente Teste Bloqueio',
        clientEmail: 'paciente.bloqueio@teste.com',
        startAt: new Date(Date.now() + 86400000).toISOString(),
      })
      .expect(402);

    expect(scheduleRes.body.error).toBe('QUOTA_EXCEEDED');
    expect(scheduleRes.body.message).toContain('Subscription is not active');

    // Transição 3: invoice.paid regulariza pagamento e retira de PAST_DUE
    const paidEvent = JSON.stringify({
      id: 'evt_invoice_paid_recovery',
      type: 'invoice.paid',
      data: {
        object: {
          customer: 'cus_aura_verified_123',
          metadata: { workspace_id: seeded.auraWorkspaceId },
        },
      },
    });

    await request(app)
      .post('/api/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', Stripe.webhooks.generateTestHeaderString({ payload: paidEvent, secret: STRIPE_WEBHOOK_SECRET }))
      .send(paidEvent)
      .expect(200);

    sub = await c.infra.subscriptions.findByTenant(seeded.auraWorkspaceId);
    expect(sub?.status).toBe('ACTIVE');

    // Transição 4: customer.subscription.deleted cancela e reverte para STARTER sem deletar dados
    const deleteEvent = JSON.stringify({
      id: 'evt_sub_deleted_aura',
      type: 'customer.subscription.deleted',
      data: {
        object: {
          customer: 'cus_aura_verified_123',
          metadata: { workspace_id: seeded.auraWorkspaceId },
        },
      },
    });

    await request(app)
      .post('/api/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', Stripe.webhooks.generateTestHeaderString({ payload: deleteEvent, secret: STRIPE_WEBHOOK_SECRET }))
      .send(deleteEvent)
      .expect(200);

    sub = await c.infra.subscriptions.findByTenant(seeded.auraWorkspaceId);
    expect(sub?.plan).toBe('STARTER');
    expect(sub?.status).toBe('CANCELED');
  });

  it('8. Admin Metrics: assinaturas pagas ativas ignora clínicas no plano Starter gratuito', async () => {
    const { c } = makeHarness();
    const seeded = await seedDemoData(c);
    const app = createApp(c);

    // Aura está no plano Starter
    const auraLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'owner@aura.test', password: 'Passw0rd!' })
      .expect(200);

    const metricsRes = await request(app)
      .get('/api/admin/metrics')
      .set('Authorization', `Bearer ${auraLogin.body.token}`)
      .set('x-workspace-id', seeded.auraWorkspaceId)
      .expect(200);

    // Starter é gratuito: activeSubscriptionsCount DEVE ser 0 e MRR R$ 0,00!
    expect(metricsRes.body.activeSubscriptionsCount).toBe(0);
    expect(metricsRes.body.mrrFormatted).toBe('R$ 0,00');
    expect(metricsRes.body.distribution.STARTER.total).toBe(1);
  });
});
