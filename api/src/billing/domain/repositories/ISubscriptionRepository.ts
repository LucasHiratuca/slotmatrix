import { Subscription } from '../aggregates/Subscription';

export interface PlanStatusCount {
  plan: string;
  status: string;
  count: number;
}

export interface ISubscriptionRepository {
  save(subscription: Subscription): Promise<void>;
  findByTenant(tenantId: string): Promise<Subscription | null>;
  findByExternalCustomerId(customerId: string): Promise<Subscription | null>;
  countByPlanAndStatus(): Promise<PlanStatusCount[]>;
}
