import { PlanCode } from '../domain/value-objects/PlanQuota';

export type BillingCommandBase = {
  externalEventId: string;
  tenantId: string;
  externalCustomerId?: string;
};

export type BillingCommand =
  | (BillingCommandBase & { type: 'ACTIVATE_PLAN'; plan?: PlanCode; periodEnd?: Date })
  | (BillingCommandBase & { type: 'MARK_PAST_DUE' })
  | (BillingCommandBase & { type: 'CANCEL_SUBSCRIPTION' });

export interface IBillingWebhookAcl {
  verifySignature(rawBody: string, signature: string | undefined): boolean;
  translate(payload: unknown): BillingCommand | null;
}

export interface IProcessedWebhookStore {
  registerIfNew(externalEventId: string, payload: unknown, receivedAt: Date): Promise<boolean>;
}
