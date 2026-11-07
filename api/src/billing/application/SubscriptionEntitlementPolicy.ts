import { ISubscriptionRepository } from '../domain/repositories/ISubscriptionRepository';
import { PlanQuota } from '../domain/value-objects/PlanQuota';
import { WorkspaceEntitlementPolicy, WorkspaceEntitlements } from '../../scheduling/domain/WorkspaceEntitlementPolicy';

export class SubscriptionEntitlementPolicy implements WorkspaceEntitlementPolicy {
  constructor(private readonly subscriptions: ISubscriptionRepository) {}

  async forWorkspace(tenantId: string): Promise<WorkspaceEntitlements> {
    const sub = await this.subscriptions.findByTenant(tenantId);
    if (!sub) {
      return {
        subscriptionHealthy: false,
        maxActiveResources: 0,
        maxBookingsPerMonth: 0,
        smartWaitlistEnabled: false,
        securityDepositEnabled: false,
        publicBookingPortalEnabled: false,
        vipWaitlistPriorityEnabled: false,
        exportableAuditLogs: false,
        planLabel: 'NONE',
      };
    }
    const q: PlanQuota = sub.quota;
    return {
      subscriptionHealthy: sub.isHealthy,
      maxActiveResources: q.maxActiveResources,
      maxBookingsPerMonth: q.maxBookingsPerMonth,
      smartWaitlistEnabled: q.smartWaitlistEnabled,
      securityDepositEnabled: q.securityDepositEnabled,
      publicBookingPortalEnabled: q.publicBookingPortalEnabled,
      vipWaitlistPriorityEnabled: q.vipWaitlistPriorityEnabled,
      exportableAuditLogs: q.exportableAuditLogs,
      planLabel: q.plan,
    };
  }
}
