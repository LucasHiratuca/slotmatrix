import { WorkspaceEntitlements } from '../WorkspaceEntitlementPolicy';
import { DomainException, FeatureNotEntitledError, QuotaExceededError } from '../../../shared/domain/errors';

export class CanUseSmartWaitlistSpecification {
  violation(entitlements: WorkspaceEntitlements, opts?: { requestVipPriority?: boolean }): DomainException | null {
    if (!entitlements.subscriptionHealthy) {
      return new QuotaExceededError('Subscription is not active');
    }
    if (!entitlements.smartWaitlistEnabled) {
      return new FeatureNotEntitledError(`Plan ${entitlements.planLabel} does not include Smart Waitlist (upgrade to PRO or ENTERPRISE)`);
    }
    if (opts?.requestVipPriority && !entitlements.vipWaitlistPriorityEnabled) {
      return new FeatureNotEntitledError(`VIP Waitlist priority requires the ENTERPRISE plan (current: ${entitlements.planLabel})`);
    }
    return null;
  }

  isSatisfiedBy(entitlements: WorkspaceEntitlements, opts?: { requestVipPriority?: boolean }): boolean {
    return this.violation(entitlements, opts) === null;
  }

  assertSatisfiedBy(entitlements: WorkspaceEntitlements, opts?: { requestVipPriority?: boolean }): void {
    const v = this.violation(entitlements, opts);
    if (v) throw v;
  }
}
