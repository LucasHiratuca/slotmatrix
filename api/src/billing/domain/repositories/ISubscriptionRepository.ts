import { Subscription } from '../aggregates/Subscription';

export interface ISubscriptionRepository {
  save(subscription: Subscription): Promise<void>;
  findByTenant(tenantId: string): Promise<Subscription | null>;
}
