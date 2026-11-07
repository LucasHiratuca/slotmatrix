import { DomainEvent } from '../../../shared/domain/DomainEvent';
import { PlanCode } from '../value-objects/PlanQuota';

export class SubscriptionPlanChangedDomainEvent implements DomainEvent {
  readonly name = 'SubscriptionPlanChanged';
  constructor(
    readonly tenantId: string,
    readonly aggregateId: string,
    readonly previousPlan: PlanCode,
    readonly newPlan: PlanCode,
    readonly occurredAt: Date,
  ) {}
}

export class SubscriptionStatusChangedDomainEvent implements DomainEvent {
  readonly name = 'SubscriptionStatusChanged';
  constructor(
    readonly tenantId: string,
    readonly aggregateId: string,
    readonly from: string,
    readonly to: string,
    readonly occurredAt: Date,
  ) {}
}
