import { BookableResource, MaintenanceBlock, ResourceCategory, ResourceStatus, WeeklyWindow } from '../domain/aggregates/BookableResource';
import { ResourceRequirement, ServiceProcedure } from '../domain/aggregates/ServiceProcedure';
import { CancellationPolicyRule } from '../domain/value-objects/CancellationPolicyRule';
import { Money } from '../domain/value-objects/Money';
import { ResourceCapabilitySet } from '../domain/value-objects/ResourceCapabilitySet';
import { TurnaroundBuffer } from '../domain/value-objects/TurnaroundBuffer';
import { TimeSlot } from '../../scheduling/domain/value-objects/TimeSlot';
import { TenantId, UniqueEntityId } from '../../shared/domain/UniqueEntityId';

export interface BookableResourceRow {
  id: string;
  workspace_id: string;
  name: string;
  category: ResourceCategory;
  status: ResourceStatus;
  capabilities_json: string;
  weekly_windows_json: string;
  maintenance_blocks_json: string;
  created_at: Date;
}

export const BookableResourceMapper = {
  toDomain(r: BookableResourceRow): BookableResource {
    const caps: string[] = typeof r.capabilities_json === 'string' ? JSON.parse(r.capabilities_json) : r.capabilities_json;
    const windows: WeeklyWindow[] = typeof r.weekly_windows_json === 'string' ? JSON.parse(r.weekly_windows_json) : r.weekly_windows_json;
    const rawBlocks: { id: string; startAt: string; endAt: string; reason: string }[] =
      typeof r.maintenance_blocks_json === 'string' ? JSON.parse(r.maintenance_blocks_json) : r.maintenance_blocks_json;

    const blocks: MaintenanceBlock[] = rawBlocks.map((b) =>
      Object.freeze({
        id: b.id,
        slot: TimeSlot.create(new Date(b.startAt), new Date(b.endAt)),
        reason: b.reason,
      }),
    );

    return BookableResource.reconstitute(
      {
        tenantId: TenantId.from(r.workspace_id),
        name: r.name,
        category: r.category,
        status: r.status,
        capabilities: ResourceCapabilitySet.create(caps),
        weeklyWindows: windows,
        maintenanceBlocks: blocks,
        createdAt: r.created_at,
      },
      UniqueEntityId.from(r.id),
    );
  },
  toPersistence(resource: BookableResource): BookableResourceRow {
    return {
      id: resource.id.value,
      workspace_id: resource.tenantId.value,
      name: resource.name,
      category: resource.category,
      status: resource.status,
      capabilities_json: JSON.stringify([...resource.capabilities.tags]),
      weekly_windows_json: JSON.stringify(resource.weeklyWindows),
      maintenance_blocks_json: JSON.stringify(
        resource.maintenanceBlocks.map((b) => ({
          id: b.id,
          startAt: b.slot.startAt.toISOString(),
          endAt: b.slot.endAt.toISOString(),
          reason: b.reason,
        })),
      ),
      created_at: resource.createdAt,
    };
  },
};

export interface ServiceProcedureRow {
  id: string;
  workspace_id: string;
  name: string;
  duration_minutes: number;
  price_cents: number;
  deposit_cents: number;
  currency: string;
  cancellation_policy_json: string;
  requirements_json: string;
  active: number | boolean;
  created_at: Date;
}

export const ServiceProcedureMapper = {
  toDomain(r: ServiceProcedureRow): ServiceProcedure {
    const pol = typeof r.cancellation_policy_json === 'string' ? JSON.parse(r.cancellation_policy_json) : r.cancellation_policy_json;
    const rawReqs: { category: ResourceCategory; requiredCapabilities: string[]; prepMinutes: number; cleanupMinutes: number }[] =
      typeof r.requirements_json === 'string' ? JSON.parse(r.requirements_json) : r.requirements_json;

    const requirements: ResourceRequirement[] = rawReqs.map((req) =>
      Object.freeze({
        category: req.category,
        requiredCapabilities: ResourceCapabilitySet.create(req.requiredCapabilities),
        turnaround: TurnaroundBuffer.create(req.prepMinutes, req.cleanupMinutes),
      }),
    );

    return ServiceProcedure.reconstitute(
      {
        tenantId: TenantId.from(r.workspace_id),
        name: r.name,
        durationMinutes: r.duration_minutes,
        price: Money.create(r.price_cents, r.currency),
        depositAmount: Money.create(r.deposit_cents, r.currency),
        cancellationPolicy: CancellationPolicyRule.create(pol),
        requirements,
        active: Boolean(r.active),
        createdAt: r.created_at,
      },
      UniqueEntityId.from(r.id),
    );
  },
  toPersistence(p: ServiceProcedure): ServiceProcedureRow {
    return {
      id: p.id.value,
      workspace_id: p.tenantId.value,
      name: p.name,
      duration_minutes: p.durationMinutes,
      price_cents: p.price.amountCents,
      deposit_cents: p.depositAmount.amountCents,
      currency: p.price.currency,
      cancellation_policy_json: JSON.stringify({
        fullRefundThresholdHours: p.cancellationPolicy.fullRefundThresholdHours,
        partialRefundThresholdHours: p.cancellationPolicy.partialRefundThresholdHours,
        partialRetentionPercent: p.cancellationPolicy.partialRetentionPercent,
      }),
      requirements_json: JSON.stringify(
        p.requirements.map((r) => ({
          category: r.category,
          requiredCapabilities: [...r.requiredCapabilities.tags],
          prepMinutes: r.turnaround.prepMinutes,
          cleanupMinutes: r.turnaround.cleanupMinutes,
        })),
      ),
      active: p.active,
      created_at: p.createdAt,
    };
  },
};
