import { createHmac, timingSafeEqual } from 'node:crypto';
import { BillingCommand, IBillingWebhookAcl } from '../application/ports';
import { PLAN_CODES, PlanCode } from '../domain/value-objects/PlanQuota';
import { ValidationError } from '../../shared/domain/errors';

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
    if (!p || typeof p.id !== 'string' || typeof p.type !== 'string') throw new ValidationError('Malformed billing event');
    const obj = p.data?.object ?? {};
    const tenantId: unknown = obj.metadata?.workspace_id;
    if (typeof tenantId !== 'string' || !tenantId) throw new ValidationError('Billing event is missing metadata.workspace_id');
    const base = { externalEventId: p.id as string, tenantId };

    switch (p.type) {
      case 'checkout.session.completed':
      case 'customer.subscription.updated':
      case 'invoice.paid': {
        const rawPlan = obj.metadata?.plan;
        let plan: PlanCode | undefined;
        if (rawPlan !== undefined) {
          const up = String(rawPlan).toUpperCase() as PlanCode;
          if (!PLAN_CODES.includes(up)) throw new ValidationError(`Unknown plan in billing event: ${rawPlan}`);
          plan = up;
        }
        return {
          type: 'ACTIVATE_PLAN',
          ...base,
          plan,
          externalCustomerId: typeof obj.customer === 'string' ? obj.customer : undefined,
          periodEnd: typeof obj.current_period_end === 'number' ? new Date(obj.current_period_end * 1000) : undefined,
        };
      }
      case 'invoice.payment_failed':
        return { type: 'MARK_PAST_DUE', ...base };
      case 'customer.subscription.deleted':
        return { type: 'CANCEL_SUBSCRIPTION', ...base };
      default:
        return null;
    }
  }
}
