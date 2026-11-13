import Stripe from 'stripe';
import { BillingOperationError } from '../../shared/domain/errors';
import { PlanCode } from '../domain/value-objects/PlanQuota';

export interface CheckoutSessionOptions {
  tenantId: string;
  workspaceName: string;
  userEmail?: string;
  plan: 'PRO' | 'ENTERPRISE';
  successUrl: string;
  cancelUrl: string;
  attemptKey?: string;
}

export interface CustomerPortalOptions {
  customerId: string;
  returnUrl: string;
}

const LOOKUP_KEYS: Record<'PRO' | 'ENTERPRISE', string> = {
  PRO: 'slotmatrix_pro_monthly',
  ENTERPRISE: 'slotmatrix_enterprise_monthly',
};

export class StripeBillingGateway {
  private stripe: Stripe | null = null;
  private readonly isProduction: boolean;
  private readonly isMockMode: boolean;
  private priceCache = new Map<string, string>();
  private planByPriceId = new Map<string, PlanCode>();

  constructor(
    private readonly secretKey: string | undefined,
    private readonly webhookSecret: string | undefined,
    opts?: { isProduction?: boolean; mock?: boolean },
  ) {
    this.isProduction = opts?.isProduction ?? process.env.NODE_ENV === 'production';
    this.isMockMode = Boolean(opts?.mock) || this.secretKey === 'sk_test_mock_slotmatrix';

    // 1. Regra de segurança estrita: recusa sk_live_ fora de produção
    if (this.secretKey && !this.isProduction && this.secretKey.startsWith('sk_live_')) {
      console.error(
        '[Security] ⚠️ ATENÇÃO: Chave de produção do Stripe (sk_live_) detectada fora de production. Operação de faturamento desabilitada.',
      );
      this.stripe = null;
      return;
    }

    if (this.isMockMode) {
      this.priceCache.set(LOOKUP_KEYS.PRO, 'price_mock_pro');
      this.priceCache.set(LOOKUP_KEYS.ENTERPRISE, 'price_mock_enterprise');
      this.planByPriceId.set('price_mock_pro', 'PRO');
      this.planByPriceId.set('price_mock_enterprise', 'ENTERPRISE');
      return;
    }

    // 2. Chave de teste real vs placeholder/demo
    const isRealTestKey =
      Boolean(this.secretKey) &&
      (this.secretKey!.startsWith('sk_test_') || (this.isProduction && this.secretKey!.startsWith('sk_live_'))) &&
      !this.secretKey!.includes('demo') &&
      !this.secretKey!.includes('your_stripe');

    if (isRealTestKey) {
      this.stripe = new Stripe(this.secretKey!, {
        apiVersion: '2024-06-20' as any,
        timeout: 10000,
        maxNetworkRetries: 2,
        appInfo: {
          name: 'SlotMatrix',
          version: '1.0.0',
        },
      });
      console.log('[Billing] ✅ Stripe Gateway inicializado em modo de teste com sucesso.');
    } else {
      console.warn(
        '[Billing] ℹ️ Stripe não configurado ou chave placeholder detectada. Endpoints de billing responderão 503 BILLING_NOT_CONFIGURED.',
      );
    }
  }

  isConfigured(): boolean {
    return this.stripe !== null || this.isMockMode;
  }

  hasWebhookSecret(): boolean {
    return (
      typeof this.webhookSecret === 'string' &&
      this.webhookSecret.length >= 10 &&
      !this.webhookSecret.includes('demo') &&
      !this.webhookSecret.includes('your_stripe')
    );
  }

  async resolvePriceId(plan: 'PRO' | 'ENTERPRISE'): Promise<string> {
    if (!this.isConfigured()) {
      throw new BillingOperationError(
        'BILLING_NOT_CONFIGURED',
        'O faturamento com Stripe ainda não foi configurado nesta instalação. Fale com o administrador.',
        503,
      );
    }
    const lookupKey = LOOKUP_KEYS[plan];
    if (this.priceCache.has(lookupKey)) {
      return this.priceCache.get(lookupKey)!;
    }

    if (this.isMockMode) {
      const mockId = plan === 'ENTERPRISE' ? 'price_mock_enterprise' : 'price_mock_pro';
      this.priceCache.set(lookupKey, mockId);
      this.planByPriceId.set(mockId, plan);
      return mockId;
    }

    try {
      const prices = await this.stripe!.prices.list({
        lookup_keys: [lookupKey],
        active: true,
        limit: 1,
      });

      if (prices.data.length > 0) {
        const priceId = prices.data[0].id;
        this.priceCache.set(lookupKey, priceId);
        this.planByPriceId.set(priceId, plan);
        return priceId;
      }
    } catch (err: any) {
      this.handleStripeError(err, 'ao consultar preço por lookup_key');
    }

    throw new BillingOperationError(
      'BILLING_PRICE_NOT_FOUND',
      `O preço para o plano ${plan} (${lookupKey}) não foi encontrado no Stripe. Execute 'npm run stripe:setup'.`,
      400,
    );
  }

  async getOrCreateCustomer(opts: {
    tenantId: string;
    workspaceName: string;
    userEmail?: string;
    existingCustomerId?: string | null;
  }): Promise<string> {
    if (!this.isConfigured()) {
      throw new BillingOperationError(
        'BILLING_NOT_CONFIGURED',
        'O faturamento com Stripe ainda não foi configurado nesta instalação. Fale com o administrador.',
        503,
      );
    }

    if (opts.existingCustomerId) {
      if (this.isMockMode) return opts.existingCustomerId;
      try {
        const existing = await this.stripe!.customers.retrieve(opts.existingCustomerId);
        if (!existing.deleted) {
          return existing.id;
        }
      } catch {
        // Se der erro ao recuperar, recria
      }
    }

    if (this.isMockMode) {
      return `cus_mock_${opts.tenantId.slice(0, 12)}`;
    }

    try {
      const customer = await this.stripe!.customers.create(
        {
          name: opts.workspaceName,
          email: opts.userEmail,
          metadata: {
            workspace_id: opts.tenantId,
            app: 'SlotMatrix',
          },
        },
        {
          idempotencyKey: `cus_${opts.tenantId}`,
        },
      );
      return customer.id;
    } catch (err: any) {
      this.handleStripeError(err, 'ao criar cliente no Stripe');
    }
  }

  async createCheckoutSession(opts: CheckoutSessionOptions & { customerId: string }): Promise<string> {
    if (!this.isConfigured()) {
      throw new BillingOperationError(
        'BILLING_NOT_CONFIGURED',
        'O faturamento com Stripe ainda não foi configurado nesta instalação. Fale com o administrador.',
        503,
      );
    }

    const priceId = await this.resolvePriceId(opts.plan);
    const refId = `ref_${Math.random().toString(36).slice(2, 9)}`;

    if (this.isMockMode) {
      return `https://checkout.stripe.com/c/pay/cs_test_mock_${opts.plan.toLowerCase()}_${Date.now()}`;
    }

    try {
      const session = await this.stripe!.checkout.sessions.create(
        {
          mode: 'subscription',
          customer: opts.customerId,
          client_reference_id: opts.tenantId,
          line_items: [
            {
              price: priceId,
              quantity: 1,
            },
          ],
          metadata: {
            workspace_id: opts.tenantId,
            plan: opts.plan,
            reference_id: refId,
          },
          subscription_data: {
            metadata: {
              workspace_id: opts.tenantId,
              plan: opts.plan,
            },
          },
          locale: 'pt-BR',
          success_url: opts.successUrl,
          cancel_url: opts.cancelUrl,
        },
        {
          idempotencyKey: `cs_${opts.tenantId}_${opts.plan}_${opts.attemptKey || Math.floor(Date.now() / 60000)}`,
        },
      );

      if (!session.url) {
        throw new BillingOperationError(
          'BILLING_STRIPE_UNAVAILABLE',
          'O Stripe não retornou a URL da sessão de checkout.',
          502,
          refId,
        );
      }

      return session.url;
    } catch (err: any) {
      this.handleStripeError(err, 'ao criar sessão de checkout');
    }
  }

  async createCustomerPortalSession(opts: CustomerPortalOptions): Promise<string> {
    if (!this.isConfigured()) {
      throw new BillingOperationError(
        'BILLING_NOT_CONFIGURED',
        'O faturamento com Stripe ainda não foi configurado nesta instalação. Fale com o administrador.',
        503,
      );
    }

    if (!opts.customerId) {
      throw new BillingOperationError(
        'BILLING_NO_CUSTOMER',
        'Nenhum cliente do Stripe associado a esta clínica. Assine um plano primeiro.',
        400,
      );
    }

    if (this.isMockMode) {
      return `https://billing.stripe.com/p/session/test_mock_portal_${Date.now()}`;
    }

    const refId = `ref_${Math.random().toString(36).slice(2, 9)}`;

    try {
      const portal = await this.stripe!.billingPortal.sessions.create({
        customer: opts.customerId,
        return_url: opts.returnUrl,
      });

      return portal.url;
    } catch (err: any) {
      if (err?.code === 'resource_missing' || err?.message?.includes('No configuration')) {
        console.error(
          '[Billing] ❌ O Customer Portal não foi ativado no painel do Stripe (acesse https://dashboard.stripe.com/test/settings/billing/portal).',
        );
        throw new BillingOperationError(
          'BILLING_PORTAL_NOT_CONFIGURED',
          'O portal de autoatendimento ainda não foi ativado no painel de testes do Stripe. Ative-o em Configurações > Billing > Customer portal.',
          400,
          refId,
        );
      }
      this.handleStripeError(err, 'ao abrir portal de assinatura');
    }
  }

  verifyWebhookSignature(rawBody: string, signature: string | undefined): Stripe.Event {
    if (!this.webhookSecret || this.webhookSecret.includes('demo') || this.webhookSecret.length < 10) {
      throw new BillingOperationError(
        'BILLING_NOT_CONFIGURED',
        'STRIPE_WEBHOOK_SECRET não configurado no .env.',
        503,
      );
    }
    if (!signature) {
      throw new BillingOperationError('UNAUTHORIZED', 'Cabeçalho stripe-signature ausente.', 401);
    }
    try {
      return Stripe.webhooks.constructEvent(rawBody, signature, this.webhookSecret);
    } catch (err: any) {
      throw new BillingOperationError('UNAUTHORIZED', `Assinatura do webhook inválida: ${err.message}`, 401);
    }
  }

  async resolvePlanFromPrice(priceId: string): Promise<PlanCode | null> {
    if (this.planByPriceId.has(priceId)) {
      return this.planByPriceId.get(priceId)!;
    }
    if (this.isMockMode) {
      if (priceId.includes('enterprise')) return 'ENTERPRISE';
      if (priceId.includes('pro')) return 'PRO';
      return null;
    }
    if (!this.stripe) return null;
    try {
      const price = await this.stripe.prices.retrieve(priceId);
      if (price.lookup_key === 'slotmatrix_enterprise_monthly' || price.metadata?.plan === 'ENTERPRISE') {
        this.planByPriceId.set(priceId, 'ENTERPRISE');
        return 'ENTERPRISE';
      }
      if (price.lookup_key === 'slotmatrix_pro_monthly' || price.metadata?.plan === 'PRO') {
        this.planByPriceId.set(priceId, 'PRO');
        return 'PRO';
      }
    } catch {
      return null;
    }
    return null;
  }

  async retrieveSubscription(subscriptionId: string): Promise<Stripe.Subscription | null> {
    if (!this.stripe) return null;
    try {
      return await this.stripe.subscriptions.retrieve(subscriptionId);
    } catch {
      return null;
    }
  }

  private handleStripeError(err: any, context: string): never {
    if (err instanceof BillingOperationError) throw err;

    const refId = `ref_${Math.random().toString(36).slice(2, 9)}`;
    const type = err?.type || 'StripeError';
    const code = err?.code || 'unknown';
    const requestId = err?.requestId || 'none';

    console.error(`[Billing] Stripe error (${context}) - Type: ${type}, Code: ${code}, RequestId: ${requestId}`);

    if (type === 'StripeAuthenticationError' || code === 'api_key_expired' || err?.statusCode === 401) {
      throw new BillingOperationError(
        'BILLING_NOT_CONFIGURED',
        'Credenciais do Stripe inválidas ou expiradas. Verifique a chave STRIPE_SECRET_KEY no .env.',
        503,
        refId,
      );
    }

    if (code === 'resource_missing') {
      throw new BillingOperationError(
        'BILLING_PRICE_NOT_FOUND',
        'O item ou preço solicitado não foi encontrado no Stripe. Execute npm run stripe:setup.',
        400,
        refId,
      );
    }

    if (type === 'StripeConnectionError' || type === 'StripeAPIError' || (err?.statusCode && err.statusCode >= 500)) {
      throw new BillingOperationError(
        'BILLING_STRIPE_UNAVAILABLE',
        'O serviço do Stripe está temporariamente indisponível. Tente novamente em instantes.',
        502,
        refId,
      );
    }

    throw new BillingOperationError(
      'BILLING_STRIPE_UNAVAILABLE',
      `Não foi possível processar a operação no Stripe (${code}).`,
      400,
      refId,
    );
  }
}
