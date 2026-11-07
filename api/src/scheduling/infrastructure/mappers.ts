import { Booking, BookingStatus, DepositStatus, ResourceAllocation } from '../domain/aggregates/Booking';
import { SlotOffer, WaitlistEntry, WaitlistPriority, WaitlistStatus } from '../domain/aggregates/WaitlistEntry';
import { WebhookChannel } from '../domain/entities/WebhookChannel';
import { TimeSlot } from '../domain/value-objects/TimeSlot';
import { ResourceCategory } from '../../catalog/domain/aggregates/BookableResource';
import { CancellationPolicyRule } from '../../catalog/domain/value-objects/CancellationPolicyRule';
import { Money } from '../../catalog/domain/value-objects/Money';
import { SafeWebhookUrl } from '../../shared/domain/SafeWebhookUrl';
import { TenantId, UniqueEntityId } from '../../shared/domain/UniqueEntityId';

export interface BookingRow {
  id: string;
  workspace_id: string;
  procedure_id: string;
  procedure_name: string;
  client_name: string;
  client_email: string;
  service_start_at: Date;
  service_end_at: Date;
  status: BookingStatus;
  price_cents: number;
  currency: string;
  deposit_cents: number;
  deposit_status: DepositStatus;
  deposit_expires_at: Date | null;
  cancellation_policy_json: string;
  retained_cents: number;
  refunded_cents: number;
  cancellation_reason: string | null;
  origin_waitlist_entry_id: string | null;
  version: number;
  created_at: Date;
  updated_at: Date;
}

export interface BookingAllocationRow {
  id: string;
  booking_id: string;
  workspace_id: string;
  resource_id: string;
  resource_name: string;
  category: ResourceCategory;
  service_start_at: Date;
  service_end_at: Date;
  prep_minutes: number;
  cleanup_minutes: number;
  effective_start_at: Date;
  effective_end_at: Date;
}

export const BookingMapper = {
  toDomain(r: BookingRow, allocRows: BookingAllocationRow[]): Booking {
    const pol = typeof r.cancellation_policy_json === 'string' ? JSON.parse(r.cancellation_policy_json) : r.cancellation_policy_json;
    const allocations: ResourceAllocation[] = allocRows.map((a) =>
      Object.freeze({
        resourceId: a.resource_id,
        resourceName: a.resource_name,
        category: a.category,
        serviceSlot: TimeSlot.create(new Date(a.service_start_at), new Date(a.service_end_at)),
        prepMinutes: a.prep_minutes,
        cleanupMinutes: a.cleanup_minutes,
        effectiveOccupiedSlot: TimeSlot.create(new Date(a.effective_start_at), new Date(a.effective_end_at)),
      }),
    );

    return Booking.reconstitute(
      {
        tenantId: TenantId.from(r.workspace_id),
        procedureId: UniqueEntityId.from(r.procedure_id),
        procedureName: r.procedure_name,
        clientName: r.client_name,
        clientEmail: r.client_email,
        serviceSlot: TimeSlot.create(new Date(r.service_start_at), new Date(r.service_end_at)),
        allocations,
        status: r.status,
        priceCents: r.price_cents,
        currency: r.currency,
        depositAmount: Money.create(r.deposit_cents, r.currency),
        depositStatus: r.deposit_status,
        depositExpiresAt: r.deposit_expires_at ? new Date(r.deposit_expires_at) : null,
        cancellationPolicy: CancellationPolicyRule.create(pol),
        retainedCents: r.retained_cents,
        refundedCents: r.refunded_cents,
        cancellationReason: r.cancellation_reason,
        originWaitlistEntryId: r.origin_waitlist_entry_id,
        version: r.version,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      },
      UniqueEntityId.from(r.id),
    );
  },

  toPersistence(b: Booking): { row: BookingRow; allocations: BookingAllocationRow[] } {
    return {
      row: {
        id: b.id.value,
        workspace_id: b.tenantId.value,
        procedure_id: b.procedureId.value,
        procedure_name: b.procedureName,
        client_name: b.clientName,
        client_email: b.clientEmail,
        service_start_at: b.serviceSlot.startAt,
        service_end_at: b.serviceSlot.endAt,
        status: b.status,
        price_cents: b.priceCents,
        currency: b.currency,
        deposit_cents: b.depositAmount.amountCents,
        deposit_status: b.depositStatus,
        deposit_expires_at: b.depositExpiresAt,
        cancellation_policy_json: JSON.stringify({
          fullRefundThresholdHours: b.cancellationPolicy.fullRefundThresholdHours,
          partialRefundThresholdHours: b.cancellationPolicy.partialRefundThresholdHours,
          partialRetentionPercent: b.cancellationPolicy.partialRetentionPercent,
        }),
        retained_cents: b.retainedCents,
        refunded_cents: b.refundedCents,
        cancellation_reason: b.cancellationReason,
        origin_waitlist_entry_id: b.originWaitlistEntryId,
        version: b.version,
        created_at: b.createdAt,
        updated_at: b.updatedAt,
      },
      allocations: b.allocations.map((a, idx) => ({
        id: `${b.id.value}:${idx + 1}`,
        booking_id: b.id.value,
        workspace_id: b.tenantId.value,
        resource_id: a.resourceId,
        resource_name: a.resourceName,
        category: a.category,
        service_start_at: a.serviceSlot.startAt,
        service_end_at: a.serviceSlot.endAt,
        prep_minutes: a.prepMinutes,
        cleanup_minutes: a.cleanupMinutes,
        effective_start_at: a.effectiveOccupiedSlot.startAt,
        effective_end_at: a.effectiveOccupiedSlot.endAt,
      })),
    };
  },
};

export interface WaitlistEntryRow {
  id: string;
  workspace_id: string;
  procedure_id: string;
  client_name: string;
  client_email: string;
  desired_start_at: Date;
  desired_end_at: Date;
  priority: WaitlistPriority;
  status: WaitlistStatus;
  offered_start_at: Date | null;
  offered_end_at: Date | null;
  reserved_resource_ids_json: string | null;
  offered_at: Date | null;
  offer_expires_at: Date | null;
  claimed_booking_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export const WaitlistEntryMapper = {
  toDomain(r: WaitlistEntryRow): WaitlistEntry {
    let activeOffer: SlotOffer | null = null;
    if (r.offered_start_at && r.offered_end_at && r.offered_at && r.offer_expires_at) {
      const ids: string[] = r.reserved_resource_ids_json
        ? typeof r.reserved_resource_ids_json === 'string'
          ? JSON.parse(r.reserved_resource_ids_json)
          : r.reserved_resource_ids_json
        : [];
      activeOffer = Object.freeze({
        offeredSlot: TimeSlot.create(new Date(r.offered_start_at), new Date(r.offered_end_at)),
        reservedResourceIds: Object.freeze(ids),
        offeredAt: new Date(r.offered_at),
        expiresAt: new Date(r.offer_expires_at),
      });
    }

    return WaitlistEntry.reconstitute(
      {
        tenantId: TenantId.from(r.workspace_id),
        procedureId: UniqueEntityId.from(r.procedure_id),
        clientName: r.client_name,
        clientEmail: r.client_email,
        desiredWindow: TimeSlot.create(new Date(r.desired_start_at), new Date(r.desired_end_at)),
        priority: r.priority,
        status: r.status,
        activeOffer,
        claimedBookingId: r.claimed_booking_id,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      },
      UniqueEntityId.from(r.id),
    );
  },

  toPersistence(w: WaitlistEntry): WaitlistEntryRow {
    const o = w.activeOffer;
    return {
      id: w.id.value,
      workspace_id: w.tenantId.value,
      procedure_id: w.procedureId.value,
      client_name: w.clientName,
      client_email: w.clientEmail,
      desired_start_at: w.desiredWindow.startAt,
      desired_end_at: w.desiredWindow.endAt,
      priority: w.priority,
      status: w.status,
      offered_start_at: o ? o.offeredSlot.startAt : null,
      offered_end_at: o ? o.offeredSlot.endAt : null,
      reserved_resource_ids_json: o ? JSON.stringify([...o.reservedResourceIds]) : null,
      offered_at: o ? o.offeredAt : null,
      offer_expires_at: o ? o.expiresAt : null,
      claimed_booking_id: w.claimedBookingId,
      created_at: w.createdAt,
      updated_at: w.updatedAt,
    };
  },
};

export interface WebhookChannelRow {
  id: string;
  workspace_id: string;
  name: string;
  url: string;
  secret: string;
  enabled: number | boolean;
  last_delivered_at: Date | null;
}

export const WebhookChannelMapper = {
  toDomain(r: WebhookChannelRow): WebhookChannel {
    return WebhookChannel.reconstitute(
      {
        tenantId: TenantId.from(r.workspace_id),
        name: r.name,
        url: SafeWebhookUrl.reconstitute(r.url),
        secret: r.secret,
        enabled: Boolean(r.enabled),
        lastDeliveredAt: r.last_delivered_at,
      },
      UniqueEntityId.from(r.id),
    );
  },
  toPersistence(c: WebhookChannel): WebhookChannelRow {
    return {
      id: c.id.value,
      workspace_id: c.tenantId.value,
      name: c.name,
      url: c.url.value,
      secret: c.secret,
      enabled: c.enabled,
      last_delivered_at: c.lastDeliveredAt,
    };
  },
};
