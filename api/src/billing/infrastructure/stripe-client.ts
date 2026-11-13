import Stripe from 'stripe';

export interface CheckoutSessionOptions {
  tenantId: string;
  workspaceName: string;
  userEmail?: string;
  plan: 'PRO' | 'ENTERPRISE';
  successUrl: string;
  cancelUrl: string;
}

export interface CustomerPortalOptions {
  customerId: string;
  returnUrl: string;
}

export class StripeBillingGateway {
  private stripe: Stripe | null = null;

  constructor(
    private readonly secretKey: string | undefined,
    private readonly webhookSecret: string | undefined,
  ) {
    if (this.secretKey && this.secretKey.startsWith('sk_')) {
      this.stripe = new Stripe(this.secretKey, {
        apiVersion: '2024-06-20' as any,
      });
    }
  }

  isConfigured(): boolean {
    return this.stripe !== null;
  }

  hasWebhookSecret(): boolean {
    return typeof this.webhookSecret === 'string' && this.webhookSecret.length >= 10;
  }

  async createCheckoutSession(opts: CheckoutSessionOptions): Promise<string> {
    if (!this.stripe) {
      // Retorno para ambiente de desenvolvimento local sem chave configurada
      return `${opts.successUrl}?simulated_session_id=cs_test_mock_${Date.now()}`;
    }

    const priceCents = opts.plan === 'ENTERPRISE' ? 89000 : 34900;
    const planName = opts.plan === 'ENTERPRISE' ? 'SlotMatrix Enterprise Plan' : 'SlotMatrix Pro Plan';

    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      client_reference_id: opts.tenantId,
      customer_email: opts.userEmail,
      metadata: {
        workspace_id: opts.tenantId,
        plan: opts.plan,
      },
      line_items: [
        {
          price_data: {
            currency: 'brl',
            product_data: {
              name: planName,
              description: `Assinatura recorrente mensal para o Workspace: ${opts.workspaceName}`,
            },
            unit_amount: priceCents,
            recurring: {
              interval: 'month',
            },
          },
          quantity: 1,
        },
      ],
      success_url: opts.successUrl,
      cancel_url: opts.cancelUrl,
    });

    if (!session.url) {
      throw new Error('Falha ao gerar URL de Checkout do Stripe');
    }

    return session.url;
  }

  async createCustomerPortalSession(opts: CustomerPortalOptions): Promise<string> {
    if (!this.stripe) {
      return `${opts.returnUrl}?portal_mock=true`;
    }

    const portal = await this.stripe.billingPortal.sessions.create({
      customer: opts.customerId,
      return_url: opts.returnUrl,
    });

    return portal.url;
  }

  verifyWebhookSignature(rawBody: string, signature: string | undefined): Stripe.Event {
    if (!this.webhookSecret) {
      throw new Error('Stripe Webhook Secret não configurado');
    }
    if (!signature) {
      throw new Error('Cabeçalho stripe-signature ausente');
    }
    return Stripe.webhooks.constructEvent(rawBody, signature, this.webhookSecret);
  }
}
