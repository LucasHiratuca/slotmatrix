import { Clock, DomainEventDispatcher, UnitOfWork } from '../../shared/application/ports';
import { FeatureNotEntitledError, NotFoundError } from '../../shared/domain/errors';
import { TenantId } from '../../shared/domain/UniqueEntityId';
import { BookableResource, ResourceCategory, ResourceStatus, WeeklyWindow } from '../domain/aggregates/BookableResource';
import { ServiceProcedure } from '../domain/aggregates/ServiceProcedure';
import { IBookableResourceRepository } from '../domain/repositories/IBookableResourceRepository';
import { IServiceProcedureRepository } from '../domain/repositories/IServiceProcedureRepository';
import { CanRegisterResourceSpecification } from '../domain/specifications/CanRegisterResourceSpecification';
import { CancellationPolicyRule, CancellationPolicyProps } from '../domain/value-objects/CancellationPolicyRule';
import { WorkspaceEntitlementPolicy } from '../../scheduling/domain/WorkspaceEntitlementPolicy';
import { TimeSlot } from '../../scheduling/domain/value-objects/TimeSlot';

const registerSpec = new CanRegisterResourceSpecification();

interface CatalogDeps {
  uow: UnitOfWork;
  dispatcher: DomainEventDispatcher;
  clock: Clock;
  resources: IBookableResourceRepository;
  procedures: IServiceProcedureRepository;
  entitlements: WorkspaceEntitlementPolicy;
}

export class CreateBookableResourceUseCase {
  constructor(private readonly d: Pick<CatalogDeps, 'uow' | 'dispatcher' | 'clock' | 'resources' | 'entitlements'>) {}

  async execute(input: {
    tenantId: string;
    name: string;
    category: ResourceCategory;
    capabilities?: string[];
    weeklyWindows?: WeeklyWindow[];
  }): Promise<BookableResource> {
    const [entitlements, currentActiveResourceCount] = await Promise.all([
      this.d.entitlements.forWorkspace(input.tenantId),
      this.d.resources.countActiveByTenant(input.tenantId),
    ]);
    registerSpec.assertSatisfiedBy({ entitlements, currentActiveResourceCount });

    const resource = BookableResource.create({
      tenantId: TenantId.from(input.tenantId),
      name: input.name,
      category: input.category,
      capabilities: input.capabilities,
      weeklyWindows: input.weeklyWindows,
      now: this.d.clock.now(),
    });

    const events = await this.d.uow.run(async () => {
      await this.d.resources.save(resource);
      return resource.pullDomainEvents();
    });
    await this.d.dispatcher.dispatch(events);
    return resource;
  }
}

export class SetResourceMaintenanceBlockUseCase {
  constructor(private readonly d: Pick<CatalogDeps, 'uow' | 'resources' | 'entitlements'>) {}

  async execute(input: {
    tenantId: string;
    resourceId: string;
    startAt?: Date;
    endAt?: Date;
    reason?: string;
    status?: ResourceStatus;
  }): Promise<BookableResource> {
    const resource = await this.d.resources.findById(input.tenantId, input.resourceId);
    if (!resource) throw new NotFoundError('BookableResource not found');

    if (input.status && input.status !== resource.status) {
      if (input.status === 'ACTIVE') {
        const [entitlements, currentActiveResourceCount] = await Promise.all([
          this.d.entitlements.forWorkspace(input.tenantId),
          this.d.resources.countActiveByTenant(input.tenantId),
        ]);
        registerSpec.assertSatisfiedBy({ entitlements, currentActiveResourceCount });
      }
      resource.setStatus(input.status);
    }

    if (input.startAt && input.endAt) {
      resource.addMaintenanceBlock(TimeSlot.create(input.startAt, input.endAt), input.reason ?? 'Scheduled maintenance');
    }

    await this.d.uow.run(() => this.d.resources.save(resource));
    return resource;
  }
}

export class CreateServiceProcedureUseCase {
  constructor(private readonly d: Pick<CatalogDeps, 'uow' | 'clock' | 'procedures' | 'entitlements'>) {}

  async execute(input: {
    tenantId: string;
    name: string;
    durationMinutes: number;
    priceCents: number;
    depositCents: number;
    currency?: string;
    cancellationPolicy?: Partial<CancellationPolicyProps>;
    requirements: {
      category: ResourceCategory;
      requiredCapabilities?: string[];
      prepMinutes?: number;
      cleanupMinutes?: number;
    }[];
  }): Promise<ServiceProcedure> {
    const ent = await this.d.entitlements.forWorkspace(input.tenantId);
    if (input.depositCents > 0 && !ent.securityDepositEnabled) {
      throw new FeatureNotEntitledError(
        `Plan ${ent.planLabel} does not allow SecurityDeposit / CancellationPenalty enforcement (upgrade to PRO or ENTERPRISE)`,
      );
    }
    const procedure = ServiceProcedure.create({
      tenantId: TenantId.from(input.tenantId),
      name: input.name,
      durationMinutes: input.durationMinutes,
      priceCents: input.priceCents,
      depositCents: input.depositCents,
      currency: input.currency,
      cancellationPolicy: input.cancellationPolicy ? CancellationPolicyRule.create(input.cancellationPolicy) : undefined,
      requirements: input.requirements,
      now: this.d.clock.now(),
    });
    await this.d.uow.run(() => this.d.procedures.save(procedure));
    return procedure;
  }
}
