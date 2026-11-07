import { Clock } from '../../shared/application/ports';
import { NotFoundError } from '../../shared/domain/errors';
import { BookableResource } from '../../catalog/domain/aggregates/BookableResource';
import { ServiceProcedure } from '../../catalog/domain/aggregates/ServiceProcedure';
import { IBookableResourceRepository } from '../../catalog/domain/repositories/IBookableResourceRepository';
import { IServiceProcedureRepository } from '../../catalog/domain/repositories/IServiceProcedureRepository';
import { IWorkspaceRepository } from '../../tenancy/domain/repositories/IWorkspaceRepository';
import { Booking } from '../domain/aggregates/Booking';
import { WaitlistEntry } from '../domain/aggregates/WaitlistEntry';
import { IBookingRepository } from '../domain/repositories/IBookingRepository';
import { IWaitlistRepository } from '../domain/repositories/IWaitlistRepository';
import { MultiResourceAvailabilityDomainService } from '../domain/services/MultiResourceAvailabilityDomainService';
import { TimeSlot } from '../domain/value-objects/TimeSlot';
import { WorkspaceEntitlementPolicy } from '../domain/WorkspaceEntitlementPolicy';
import { collectActiveHolds } from './use-cases';

const availabilitySvc = new MultiResourceAvailabilityDomainService();

export function resourceDto(r: BookableResource) {
  return {
    id: r.id.value,
    name: r.name,
    category: r.category,
    status: r.status,
    capabilities: [...r.capabilities.tags],
    weeklyWindows: r.weeklyWindows,
    maintenanceBlocks: r.maintenanceBlocks.map((b) => ({
      id: b.id,
      startAt: b.slot.startAt,
      endAt: b.slot.endAt,
      reason: b.reason,
    })),
    createdAt: r.createdAt,
  };
}

export function procedureDto(p: ServiceProcedure) {
  return {
    id: p.id.value,
    name: p.name,
    durationMinutes: p.durationMinutes,
    priceCents: p.price.amountCents,
    depositCents: p.depositAmount.amountCents,
    currency: p.price.currency,
    cancellationPolicy: {
      fullRefundThresholdHours: p.cancellationPolicy.fullRefundThresholdHours,
      partialRefundThresholdHours: p.cancellationPolicy.partialRefundThresholdHours,
      partialRetentionPercent: p.cancellationPolicy.partialRetentionPercent,
    },
    requirements: p.requirements.map((r) => ({
      category: r.category,
      requiredCapabilities: [...r.requiredCapabilities.tags],
      prepMinutes: r.turnaround.prepMinutes,
      cleanupMinutes: r.turnaround.cleanupMinutes,
    })),
    active: p.active,
    createdAt: p.createdAt,
  };
}

export function bookingDto(b: Booking) {
  return {
    id: b.id.value,
    procedureId: b.procedureId.value,
    procedureName: b.procedureName,
    clientName: b.clientName,
    clientEmail: b.clientEmail,
    startAt: b.serviceSlot.startAt,
    endAt: b.serviceSlot.endAt,
    durationMinutes: b.serviceSlot.durationMinutes(),
    status: b.status,
    priceCents: b.priceCents,
    currency: b.currency,
    depositCents: b.depositAmount.amountCents,
    depositStatus: b.depositStatus,
    depositExpiresAt: b.depositExpiresAt,
    retainedCents: b.retainedCents,
    refundedCents: b.refundedCents,
    cancellationReason: b.cancellationReason,
    originWaitlistEntryId: b.originWaitlistEntryId,
    allocations: b.allocations.map((a) => ({
      resourceId: a.resourceId,
      resourceName: a.resourceName,
      category: a.category,
      serviceStartAt: a.serviceSlot.startAt,
      serviceEndAt: a.serviceSlot.endAt,
      prepMinutes: a.prepMinutes,
      cleanupMinutes: a.cleanupMinutes,
      effectiveStartAt: a.effectiveOccupiedSlot.startAt,
      effectiveEndAt: a.effectiveOccupiedSlot.endAt,
    })),
    version: b.version,
    createdAt: b.createdAt,
  };
}

export function waitlistDto(w: WaitlistEntry) {
  return {
    id: w.id.value,
    procedureId: w.procedureId.value,
    clientName: w.clientName,
    clientEmail: w.clientEmail,
    desiredStartAt: w.desiredWindow.startAt,
    desiredEndAt: w.desiredWindow.endAt,
    priority: w.priority,
    status: w.status,
    activeOffer: w.activeOffer
      ? {
          offeredStartAt: w.activeOffer.offeredSlot.startAt,
          offeredEndAt: w.activeOffer.offeredSlot.endAt,
          reservedResourceIds: [...w.activeOffer.reservedResourceIds],
          offeredAt: w.activeOffer.offeredAt,
          expiresAt: w.activeOffer.expiresAt,
        }
      : null,
    claimedBookingId: w.claimedBookingId,
    createdAt: w.createdAt,
  };
}

interface QDeps {
  resources: IBookableResourceRepository;
  procedures: IServiceProcedureRepository;
  bookings: IBookingRepository;
  waitlist: IWaitlistRepository;
  workspaces: IWorkspaceRepository;
  entitlements: WorkspaceEntitlementPolicy;
  clock: Clock;
}

export class FindAvailableProcedureSlotsQuery {
  constructor(private readonly d: QDeps) {}

  async execute(input: {
    tenantId: string;
    procedureId: string;
    from: Date;
    to: Date;
    stepMinutes?: number;
  }) {
    const procedure = await this.d.procedures.findById(input.tenantId, input.procedureId);
    if (!procedure) throw new NotFoundError('ServiceProcedure not found');
    const searchWindow = TimeSlot.create(input.from, input.to);
    const now = this.d.clock.now();
    const [candidateResources, existingHolds] = await Promise.all([
      this.d.resources.listByTenant(input.tenantId, { onlyActive: true }),
      collectActiveHolds(this.d, input.tenantId, searchWindow, now),
    ]);

    const slots = availabilitySvc.findAvailableSlots({
      procedure,
      searchWindow,
      stepMinutes: input.stepMinutes ?? 30,
      candidateResources,
      existingHolds,
    });

    return {
      procedure: procedureDto(procedure),
      availableSlots: slots.map((s) => ({
        startAt: s.serviceSlot.startAt,
        endAt: s.serviceSlot.endAt,
        allocations: s.allocations.map((a) => ({
          resourceId: a.resourceId,
          resourceName: a.resourceName,
          category: a.category,
          prepMinutes: a.prepMinutes,
          cleanupMinutes: a.cleanupMinutes,
          effectiveStartAt: a.effectiveOccupiedSlot.startAt,
          effectiveEndAt: a.effectiveOccupiedSlot.endAt,
        })),
      })),
    };
  }
}

/**
 * Retorna a matriz visual de ocupação por Especialista, Sala e Equipamento num intervalo,
 * separando claramente `serviceWindow` (Atendimento) de `turnaroundWindow` (Preparo/Esterilização).
 */
export class GetResourceTimelineMatrixQuery {
  constructor(private readonly d: QDeps) {}

  async execute(input: { tenantId: string; dateIso?: string }) {
    const now = this.d.clock.now();
    const dayStr = (input.dateIso ?? now.toISOString()).slice(0, 10);
    const dayStart = new Date(`${dayStr}T00:00:00.000Z`);
    const dayEnd = new Date(`${dayStr}T23:59:59.999Z`);
    const daySlot = TimeSlot.create(dayStart, dayEnd);

    const [resources, allBookings, activeOffers] = await Promise.all([
      this.d.resources.listByTenant(input.tenantId),
      this.d.bookings.listByTenant(input.tenantId, { limit: 500 }),
      this.d.waitlist.listActiveOffersByTenant(input.tenantId, now),
    ]);

    const activeBookings = allBookings.filter((b) => b.holdsResources(now) && b.serviceSlot.overlapsWith(daySlot));

    const rows = resources.map((r) => {
      const blocks: {
        bookingId: string;
        procedureName: string;
        clientName: string;
        bookingStatus: string;
        serviceStartAt: Date;
        serviceEndAt: Date;
        prepMinutes: number;
        cleanupMinutes: number;
        effectiveStartAt: Date;
        effectiveEndAt: Date;
      }[] = [];

      for (const b of activeBookings) {
        for (const a of b.allocations) {
          if (a.resourceId === r.id.value) {
            blocks.push({
              bookingId: b.id.value,
              procedureName: b.procedureName,
              clientName: b.clientName,
              bookingStatus: b.status,
              serviceStartAt: a.serviceSlot.startAt,
              serviceEndAt: a.serviceSlot.endAt,
              prepMinutes: a.prepMinutes,
              cleanupMinutes: a.cleanupMinutes,
              effectiveStartAt: a.effectiveOccupiedSlot.startAt,
              effectiveEndAt: a.effectiveOccupiedSlot.endAt,
            });
          }
        }
      }

      blocks.sort((x, y) => x.effectiveStartAt.getTime() - y.effectiveStartAt.getTime());

      return {
        resource: resourceDto(r),
        allocations: blocks,
        waitlistOfferHolds: activeOffers
          .filter((o) => o.activeOffer?.reservedResourceIds.includes(r.id.value))
          .map((o) => ({
            waitlistEntryId: o.id.value,
            clientName: o.clientName,
            offeredStartAt: o.activeOffer!.offeredSlot.startAt,
            offeredEndAt: o.activeOffer!.offeredSlot.endAt,
            expiresAt: o.activeOffer!.expiresAt,
          })),
      };
    });

    return {
      date: dayStr,
      resources: rows,
    };
  }
}

export class GetWorkspaceSchedulingKpisQuery {
  constructor(private readonly d: QDeps) {}

  async execute(tenantId: string) {
    const [resources, bookings, waitlist] = await Promise.all([
      this.d.resources.listByTenant(tenantId),
      this.d.bookings.listByTenant(tenantId, { limit: 1000 }),
      this.d.waitlist.listByTenant(tenantId),
    ]);

    const nonCancelled = bookings.filter((b) => b.status !== 'CANCELLED' && b.status !== 'EXPIRED');
    const noShows = bookings.filter((b) => b.status === 'NO_SHOW').length;
    const finalizedOrActive = bookings.filter((b) =>
      ['CONFIRMED', 'CHECKED_IN', 'COMPLETED', 'NO_SHOW'].includes(b.status),
    ).length;

    const noShowRatePercent =
      finalizedOrActive === 0 ? 0 : Math.round((noShows / finalizedOrActive) * 1000) / 10;

    const protectedRevenueCents = bookings.reduce((sum, b) => sum + b.retainedCents, 0);
    const waitlistRecoveredBookings = bookings.filter(
      (b) => b.originWaitlistEntryId && ['CONFIRMED', 'CHECKED_IN', 'COMPLETED'].includes(b.status),
    );
    const waitlistRecoveredRevenueCents = waitlistRecoveredBookings.reduce((sum, b) => sum + b.priceCents, 0);

    // Ocupação por categoria (minutos efetivos alocados / capacidade diária de 14h = 840m por recurso ativo)
    const byCategory: Record<string, { activeResources: number; occupiedMinutes: number; utilizationPercent: number }> = {
      SPECIALIST: { activeResources: 0, occupiedMinutes: 0, utilizationPercent: 0 },
      ROOM: { activeResources: 0, occupiedMinutes: 0, utilizationPercent: 0 },
      EQUIPMENT: { activeResources: 0, occupiedMinutes: 0, utilizationPercent: 0 },
    };

    for (const r of resources) {
      if (r.isActive && byCategory[r.category]) {
        byCategory[r.category].activeResources += 1;
      }
    }
    for (const b of nonCancelled) {
      for (const a of b.allocations) {
        if (byCategory[a.category]) {
          byCategory[a.category].occupiedMinutes += a.effectiveOccupiedSlot.durationMinutes();
        }
      }
    }
    for (const cat of Object.keys(byCategory)) {
      const item = byCategory[cat];
      const cap = item.activeResources * 840;
      item.utilizationPercent = cap === 0 ? 0 : Math.min(100, Math.round((item.occupiedMinutes / cap) * 1000) / 10);
    }

    return {
      totalBookings: bookings.length,
      confirmedOrCompletedBookings: nonCancelled.length,
      noShowCount: noShows,
      noShowRatePercent,
      protectedRevenueCents,
      waitlistRecoveredBookings: waitlistRecoveredBookings.length,
      waitlistRecoveredRevenueCents,
      activeWaitlistOffers: waitlist.filter((w) => w.status === 'OFFERED').length,
      waitingInQueue: waitlist.filter((w) => w.status === 'WAITING').length,
      utilizationByCategory: byCategory,
    };
  }
}

/**
 * Portal Público de Autoagendamento (`/public/book/:slug`).
 * DTO sanitizado: nunca expõe e-mails de pacientes, valores retidos internos, IDs de usuários ou webhooks.
 */
export class GetPublicBookingCatalogBySlugQuery {
  constructor(private readonly d: QDeps) {}

  async execute(input: { slug: string; dateIso?: string }) {
    const ws = await this.d.workspaces.findBySlug(input.slug);
    if (!ws) throw new NotFoundError('Public booking portal not found');
    const tenantId = ws.id.value;
    const ent = await this.d.entitlements.forWorkspace(tenantId);
    if (!ent.publicBookingPortalEnabled) {
      throw new NotFoundError('Public booking portal not found');
    }

    const now = this.d.clock.now();
    const dayStr = (input.dateIso ?? new Date(now.getTime() + 86400_000).toISOString()).slice(0, 10);
    const searchWindow = TimeSlot.create(new Date(`${dayStr}T08:00:00.000Z`), new Date(`${dayStr}T20:00:00.000Z`));

    const [procedures, resources, existingHolds] = await Promise.all([
      this.d.procedures.listByTenant(tenantId),
      this.d.resources.listByTenant(tenantId, { onlyActive: true }),
      collectActiveHolds(this.d, tenantId, searchWindow, now),
    ]);

    return {
      workspace: { name: ws.name, slug: ws.slug.value },
      date: dayStr,
      procedures: procedures
        .filter((p) => p.active)
        .map((p) => {
          const slots = availabilitySvc.findAvailableSlots({
            procedure: p,
            searchWindow,
            stepMinutes: 30,
            candidateResources: resources,
            existingHolds,
            maxResults: 20,
          });
          return {
            id: p.id.value,
            name: p.name,
            durationMinutes: p.durationMinutes,
            priceCents: p.price.amountCents,
            depositCents: ent.securityDepositEnabled ? p.depositAmount.amountCents : 0,
            currency: p.price.currency,
            requiredCategories: p.requirements.map((r) => r.category),
            availableSlots: slots.map((s) => ({
              startAt: s.serviceSlot.startAt,
              endAt: s.serviceSlot.endAt,
            })),
          };
        }),
    };
  }
}
