import { WorkspaceEntitlements } from '../../../scheduling/domain/WorkspaceEntitlementPolicy';
import { DomainException, QuotaExceededError } from '../../../shared/domain/errors';

export class CanRegisterResourceSpecification {
  violation(input: { entitlements: WorkspaceEntitlements; currentActiveResourceCount: number }): DomainException | null {
    const { entitlements: e, currentActiveResourceCount } = input;
    if (!e.subscriptionHealthy) {
      return new QuotaExceededError('Subscription is not active: cannot register new BookableResources until billing is regularized');
    }
    if (e.maxActiveResources !== null && currentActiveResourceCount >= e.maxActiveResources) {
      return new QuotaExceededError(
        `BookableResource quota reached for plan ${e.planLabel}: ${currentActiveResourceCount}/${e.maxActiveResources}`,
      );
    }
    return null;
  }

  isSatisfiedBy(input: Parameters<CanRegisterResourceSpecification['violation']>[0]): boolean {
    return this.violation(input) === null;
  }

  assertSatisfiedBy(input: Parameters<CanRegisterResourceSpecification['violation']>[0]): void {
    const v = this.violation(input);
    if (v) throw v;
  }
}
