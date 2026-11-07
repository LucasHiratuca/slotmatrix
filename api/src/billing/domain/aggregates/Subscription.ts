import { AggregateRoot } from '../../../shared/domain/AggregateRoot';
import { TenantId, UniqueEntityId } from '../../../shared/domain/UniqueEntityId';
import { InvalidStateTransitionError } from '../../../shared/domain/errors';
import { PlanCode, PlanQuota } from '../value-objects/PlanQuota';
import { SubscriptionPlanChangedDomainEvent, SubscriptionStatusChangedDomainEvent } from '../events/billing-events';

export type SubscriptionStatus = 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED';

export interface SubscriptionProps {
  tenantId: TenantId;
  plan: PlanCode;
  status: SubscriptionStatus;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  externalCustomerId: string | null;
  updatedAt: Date;
}

export class Subscription extends AggregateRoot<SubscriptionProps> {
  private constructor(props: SubscriptionProps, id: UniqueEntityId) {
    super(props, id);
  }

  static startTrial(input: { tenantId: TenantId; now: Date; trialDays?: number }): Subscription {
    const days = input.trialDays ?? 14;
    return new Subscription(
      {
        tenantId: input.tenantId,
        plan: 'STARTER',
        status: 'TRIALING',
        trialEndsAt: new Date(input.now.getTime() + days * 86400_000),
        currentPeriodEnd: null,
        externalCustomerId: null,
        updatedAt: input.now,
      },
      UniqueEntityId.generate(),
    );
  }

  static reconstitute(props: SubscriptionProps, id: UniqueEntityId): Subscription {
    return new Subscription(props, id);
  }

  get tenantId(): TenantId { return this.props.tenantId; }
  get plan(): PlanCode { return this.props.plan; }
  get status(): SubscriptionStatus { return this.props.status; }
  get trialEndsAt(): Date | null { return this.props.trialEndsAt; }
  get currentPeriodEnd(): Date | null { return this.props.currentPeriodEnd; }
  get externalCustomerId(): string | null { return this.props.externalCustomerId; }
  get updatedAt(): Date { return this.props.updatedAt; }
  get quota(): PlanQuota { return PlanQuota.forPlan(this.props.plan); }
  get isHealthy(): boolean { return this.props.status === 'TRIALING' || this.props.status === 'ACTIVE'; }

  activate(now: Date, opts?: { plan?: PlanCode; currentPeriodEnd?: Date; externalCustomerId?: string }): void {
    const from = this.props.status;
    this.props.status = 'ACTIVE';
    this.props.trialEndsAt = null;
    if (opts?.currentPeriodEnd) this.props.currentPeriodEnd = opts.currentPeriodEnd;
    if (opts?.externalCustomerId) this.props.externalCustomerId = opts.externalCustomerId;
    this.props.updatedAt = now;
    if (from !== 'ACTIVE') this.statusChanged(from, now);
    if (opts?.plan) this.changePlan(opts.plan, now);
  }

  markPastDue(now: Date): void {
    const from = this.props.status;
    if (from === 'CANCELED') throw new InvalidStateTransitionError('Cannot mark a CANCELED subscription as PAST_DUE');
    if (from === 'PAST_DUE') return;
    this.props.status = 'PAST_DUE';
    this.props.updatedAt = now;
    this.statusChanged(from, now);
  }

  cancel(now: Date): void {
    const from = this.props.status;
    if (from === 'CANCELED') return;
    this.props.status = 'CANCELED';
    this.props.updatedAt = now;
    this.statusChanged(from, now);
    this.changePlan('STARTER', now);
  }

  upgradePlan(newPlan: PlanCode, now: Date): void {
    if (this.props.status === 'CANCELED') {
      throw new InvalidStateTransitionError('Cannot change the plan of a CANCELED subscription; reactivate it first');
    }
    this.changePlan(newPlan, now);
  }

  private changePlan(newPlan: PlanCode, now: Date) {
    const prev = this.props.plan;
    if (prev === newPlan) return;
    this.props.plan = newPlan;
    this.props.updatedAt = now;
    this.addDomainEvent(new SubscriptionPlanChangedDomainEvent(this.props.tenantId.value, this.id.value, prev, newPlan, now));
  }

  private statusChanged(from: SubscriptionStatus, now: Date) {
    this.addDomainEvent(new SubscriptionStatusChangedDomainEvent(this.props.tenantId.value, this.id.value, from, this.props.status, now));
  }
}
