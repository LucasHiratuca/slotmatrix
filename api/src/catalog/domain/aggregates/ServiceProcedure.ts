import { AggregateRoot } from '../../../shared/domain/AggregateRoot';
import { TenantId, UniqueEntityId } from '../../../shared/domain/UniqueEntityId';
import { ValidationError } from '../../../shared/domain/errors';
import { ResourceCategory, RESOURCE_CATEGORIES } from './BookableResource';
import { ResourceCapabilitySet } from '../value-objects/ResourceCapabilitySet';
import { TurnaroundBuffer } from '../value-objects/TurnaroundBuffer';
import { Money } from '../value-objects/Money';
import { CancellationPolicyRule } from '../value-objects/CancellationPolicyRule';

export interface ResourceRequirement {
  readonly category: ResourceCategory;
  readonly requiredCapabilities: ResourceCapabilitySet;
  readonly turnaround: TurnaroundBuffer;
}

export interface ServiceProcedureProps {
  tenantId: TenantId;
  name: string;
  durationMinutes: number;
  price: Money;
  depositAmount: Money;
  cancellationPolicy: CancellationPolicyRule;
  requirements: ResourceRequirement[];
  active: boolean;
  createdAt: Date;
}

export class ServiceProcedure extends AggregateRoot<ServiceProcedureProps> {
  private constructor(props: ServiceProcedureProps, id: UniqueEntityId) {
    super(props, id);
  }

  static create(
    input: {
      tenantId: TenantId;
      name: string;
      durationMinutes: number;
      priceCents: number;
      depositCents: number;
      currency?: string;
      cancellationPolicy?: CancellationPolicyRule;
      requirements: {
        category: ResourceCategory;
        requiredCapabilities?: string[];
        prepMinutes?: number;
        cleanupMinutes?: number;
      }[];
      now: Date;
    },
    id = UniqueEntityId.generate(),
  ): ServiceProcedure {
    if (!input.name || input.name.trim().length < 2 || input.name.length > 120) {
      throw new ValidationError('ServiceProcedure name must have 2-120 chars');
    }
    if (!Number.isInteger(input.durationMinutes) || input.durationMinutes < 10 || input.durationMinutes > 480) {
      throw new ValidationError('durationMinutes must be between 10 and 480');
    }
    if (!Array.isArray(input.requirements) || input.requirements.length === 0) {
      throw new ValidationError('ServiceProcedure must require at least one BookableResource');
    }
    const curr = input.currency ?? 'BRL';
    const price = Money.create(input.priceCents, curr);
    const deposit = Money.create(input.depositCents, curr);
    if (deposit.amountCents > price.amountCents) {
      throw new ValidationError('depositAmount cannot exceed procedure price');
    }
    const reqs: ResourceRequirement[] = input.requirements.map((r) => {
      if (!RESOURCE_CATEGORIES.includes(r.category)) {
        throw new ValidationError(`Invalid requirement category: ${r.category}`);
      }
      return Object.freeze({
        category: r.category,
        requiredCapabilities: ResourceCapabilitySet.create(r.requiredCapabilities ?? []),
        turnaround: TurnaroundBuffer.create(r.prepMinutes ?? 0, r.cleanupMinutes ?? 0),
      });
    });

    return new ServiceProcedure(
      {
        tenantId: input.tenantId,
        name: input.name.trim(),
        durationMinutes: input.durationMinutes,
        price,
        depositAmount: deposit,
        cancellationPolicy: input.cancellationPolicy ?? CancellationPolicyRule.standard(),
        requirements: reqs,
        active: true,
        createdAt: input.now,
      },
      id,
    );
  }

  static reconstitute(props: ServiceProcedureProps, id: UniqueEntityId): ServiceProcedure {
    return new ServiceProcedure(props, id);
  }

  get tenantId(): TenantId { return this.props.tenantId; }
  get name(): string { return this.props.name; }
  get durationMinutes(): number { return this.props.durationMinutes; }
  get price(): Money { return this.props.price; }
  get depositAmount(): Money { return this.props.depositAmount; }
  get cancellationPolicy(): CancellationPolicyRule { return this.props.cancellationPolicy; }
  get requirements(): ReadonlyArray<ResourceRequirement> { return [...this.props.requirements]; }
  get active(): boolean { return this.props.active; }
  get createdAt(): Date { return this.props.createdAt; }
  get requiresDeposit(): boolean { return !this.props.depositAmount.isZero; }
}
