import { Subscription, SubscriptionStatus } from '../domain/aggregates/Subscription';
import { PlanCode } from '../domain/value-objects/PlanQuota';
import { TenantId, UniqueEntityId } from '../../shared/domain/UniqueEntityId';

export interface SubscriptionRow {
  id: string;
  workspace_id: string;
  plan: PlanCode;
  status: SubscriptionStatus;
  trial_ends_at: Date | null;
  current_period_end: Date | null;
  external_customer_id: string | null;
  updated_at: Date;
}

export const SubscriptionMapper = {
  toDomain(r: SubscriptionRow): Subscription {
    return Subscription.reconstitute(
      {
        tenantId: TenantId.from(r.workspace_id),
        plan: r.plan,
        status: r.status,
        trialEndsAt: r.trial_ends_at,
        currentPeriodEnd: r.current_period_end,
        externalCustomerId: r.external_customer_id,
        updatedAt: r.updated_at,
      },
      UniqueEntityId.from(r.id),
    );
  },
  toPersistence(s: Subscription): SubscriptionRow {
    return {
      id: s.id.value,
      workspace_id: s.tenantId.value,
      plan: s.plan,
      status: s.status,
      trial_ends_at: s.trialEndsAt,
      current_period_end: s.currentPeriodEnd,
      external_customer_id: s.externalCustomerId,
      updated_at: s.updatedAt,
    };
  },
};
