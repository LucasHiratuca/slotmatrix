import { createHmac, timingSafeEqual } from 'node:crypto';
import { BillingCommand, IBillingWebhookAcl } from '../application/ports';
import { PLAN_CODES, PlanCode } from '../domain/value-objects/PlanQuota';

export const BILLING_SIGNATURE_HEADER = 'x-billing-signature';

export function signBillingPayload(rawBody: string, secret: string): string {
  return 'sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex');
}

export class BillingWebhookAcl implements IBillingWebhookAcl {
  constructor(private readonly secret: string) {}

  verifySignature(rawBody: string, signature: string | undefined): boolean {
    if (!signature) return false;
    const expected = Buffer.from(signBillingPayload(rawBody, this.secret));
    const given = Buffer.from(signature);
    return expected.length === given.length && timingSafeEqual(expected, given);
  }

  translate(payload: unknown): BillingCommand | null {
    const p = payload as any;
    if (!p || typeof p.id !== 'string' || typeof p.type !== 'string') {
      return null;
    }

    const obj = p.data?.object ?? {};
    const rawTenantId =
      obj.metadata?.workspace_id ||
      obj.client_reference_id ||
      obj.subscription_data?.metadata?.workspace_id ||
      obj.lines?.data?.[0]?.metadata?.workspace_id;

    const tenantId: string = typeof rawTenantId === 'string' ? rawTenantId : '';
    const externalCustomerId: string | undefined =
      typeof obj.customer === 'string' ? obj.customer : obj.customer?.id;

    // Se o evento não traz nem workspaceId nem customerId (ex: stripe trigger sem metadata), ignora com segurança
    if (!tenantId && !externalCustomerId) {
      return null;
    }

    const eventCreatedAt = typeof p.created === 'number' ? new Date(p.created * 1000) : undefined;
    const base = {
      externalEventId: p.id as string,
      tenantId,
      externalCustomerId,
      eventCreatedAt,
    };

    switch (p.type) {
      case 'checkout.session.completed': {
        const rawPlan = obj.metadata?.plan;
        let plan: PlanCode | undefined;
        if (rawPlan) {
          const up = String(rawPlan).toUpperCase() as PlanCode;
          if (PLAN_CODES.includes(up)) plan = up;
        }
        return {
          type: 'ACTIVATE_PLAN',
          ...base,
          plan,
        };
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const status = obj.status;

        // Incomplete / Incomplete_expired não ativam o plano
        if (status === 'incomplete' || status === 'incomplete_expired') {
          return null;
        }

        if (status === 'past_due' || status === 'unpaid') {
          return { type: 'MARK_PAST_DUE', ...base };
        }

        if (status === 'canceled') {
          return { type: 'CANCEL_SUBSCRIPTION', ...base };
        }

        // Status ativo ou em teste (trialing)
        const priceItem = obj.items?.data?.[0]?.price;
        const lookupKey = priceItem?.lookup_key;
        let plan: PlanCode | undefined;

        if (lookupKey === 'slotmatrix_enterprise_monthly') {
          plan = 'ENTERPRISE';
        } else if (lookupKey === 'slotmatrix_pro_monthly') {
          plan = 'PRO';
        } else if (obj.metadata?.plan) {
          const up = String(obj.metadata.plan).toUpperCase() as PlanCode;
          if (PLAN_CODES.includes(up)) plan = up;
        } else if (priceItem?.metadata?.plan) {
          const up = String(priceItem.metadata.plan).toUpperCase() as PlanCode;
          if (PLAN_CODES.includes(up)) plan = up;
        }

        const periodEnd =
          typeof obj.current_period_end === 'number'
            ? new Date(obj.current_period_end * 1000)
            : undefined;

        return {
          type: 'ACTIVATE_PLAN',
          ...base,
          plan,
          periodEnd,
        };
      }

      case 'customer.subscription.deleted': {
        return { type: 'CANCEL_SUBSCRIPTION', ...base };
      }

      case 'invoice.payment_failed': {
        return { type: 'MARK_PAST_DUE', ...base };
      }

      case 'invoice.paid': {
        // Confirmação de renovação ou recuperação de pagamento
        return { type: 'CLEAR_PAST_DUE', ...base };
      }

      default:
        return null;
    }
  }
}
