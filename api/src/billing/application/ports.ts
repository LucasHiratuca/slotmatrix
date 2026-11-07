import { PlanCode } from '../domain/value-objects/PlanQuota';

export type BillingCommand =
  | { type: 'ACTIVATE_PLAN'; externalEventId: string; tenantId: string; plan?: PlanCode; externalCustomerId?: string; periodEnd?: Date }
  | { type: 'MARK_PAST_DUE'; externalEventId: string; tenantId: string }
  | { type: 'CANCEL_SUBSCRIPTION'; externalEventId: string; tenantId: string };

export interface IBillingWebhookAcl {
  verifySignature(rawBody: string, signature: string | undefined): boolean;
  translate(payload: unknown): BillingCommand | null;
}

export interface IProcessedWebhookStore {
  registerIfNew(externalEventId: string, payload: unknown, receivedAt: Date): Promise<boolean>;
}
