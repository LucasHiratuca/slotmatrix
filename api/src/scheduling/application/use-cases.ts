import { Clock, DomainEventDispatcher, UnitOfWork } from '../../shared/application/ports';
import {
  NotFoundError,
  QuotaExceededError,
  ResourceAllocationConflictError,
} from '../../shared/domain/errors';
import { TenantId } from '../../shared/domain/UniqueEntityId';
import { SafeWebhookUrl } from '../../shared/domain/SafeWebhookUrl';
import { IBookableResourceRepository } from '../../catalog/domain/repositories/IBookableResourceRepository';
import { IServiceProcedureRepository } from '../../catalog/domain/repositories/IServiceProcedureRepository';
import { Booking } from '../domain/aggregates/Booking';
import { WaitlistEntry, WaitlistPriority } from '../domain/aggregates/WaitlistEntry';
import { WebhookChannel } from '../domain/entities/WebhookChannel';
import { IBookingRepository } from '../domain/repositories/IBookingRepository';
import { IWaitlistRepository } from '../domain/repositories/IWaitlistRepository';
import { ExistingResourceHold, MultiResourceAvailabilityDomainService } from '../domain/services/MultiResourceAvailabilityDomainService';
import { CanUseSmartWaitlistSpecification } from '../domain/specifications/CanUseSmartWaitlistSpecification';
import { TimeSlot } from '../domain/value-objects/TimeSlot';
import { WorkspaceEntitlementPolicy } from '../domain/WorkspaceEntitlementPolicy';
import { IWebhookChannelRepository } from './ports';

const availabilitySvc = new MultiResourceAvailabilityDomainService();
const waitlistSpec = new CanUseSmartWaitlistSpecification();

export interface SchedulingDeps {
  uow: UnitOfWork;
  dispatcher: DomainEventDispatcher;
  clock: Clock;
  resources: IBookableResourceRepository;
  procedures: IServiceProcedureRepository;
  bookings: IBookingRepository;
  waitlist: IWaitlistRepository;
  webhookChannels: IWebhookChannelRepository;
  entitlements: WorkspaceEntitlementPolicy;
}

/** Constrói todas as travas ativas (Bookings vigentes + SlotOffers vigentes na Waitlist, exceto uma entry sendo aceita). */
export async function collectActiveHolds(
  d: Pick<SchedulingDeps, 'bookings' | 'waitlist'>,
  tenantId: string,
  searchWindow: TimeSlot,
  now: Date,
  opts?: { forUpdate?: boolean; excludeWaitlistEntryId?: string; procedure?: { requirements: readonly { category: string; turnaround: { prepMinutes: number; cleanupMinutes: number } }[] } },
): Promise<ExistingResourceHold[]> {
  const expanded = searchWindow.expandWithBuffers(240, 240);
  const bookingHolds = await d.bookings.findActiveResourceHoldsInWindow(tenantId, expanded, now, {
    forUpdate: opts?.forUpdate,
  });
  const activeOffers = await d.waitlist.listActiveOffersByTenant(tenantId, now, {
    forUpdate: opts?.forUpdate,
  });

  const holds: ExistingResourceHold[] = [...bookingHolds];
  for (const entry of activeOffers) {
    if (opts?.excludeWaitlistEntryId && entry.id.value === opts.excludeWaitlistEntryId) continue;
    const offer = entry.activeOffer;
    if (!offer) continue;
    // Bloqueio conservador dos recursos reservados pela SlotOffer ativa
    const slotWithBuffer = offer.offeredSlot.expandWithBuffers(30, 30);
    for (const resourceId of offer.reservedResourceIds) {
      holds.push({ resourceId, effectiveOccupiedSlot: slotWithBuffer });
    }
  }
  return holds;
}

export class ScheduleMultiResourceBookingUseCase {
  constructor(private readonly d: SchedulingDeps) {}

  async execute(input: {
    tenantId: string;
    procedureId: string;
    startAt: Date;
    clientName: string;
    clientEmail: string;
    preferredResourceIds?: string[];
    originWaitlistEntryId?: string;
  }): Promise<Booking> {
    const now = this.d.clock.now();
    const procedure = await this.d.procedures.findById(input.tenantId, input.procedureId);
    if (!procedure) throw new NotFoundError('ServiceProcedure not found');

    const serviceSlot = TimeSlot.fromDuration(input.startAt, procedure.durationMinutes);

    // Transação protegida contra condição de corrida (lock de cota + SELECT ... FOR UPDATE determinístico nos recursos e alocações)
    const { booking, events } = await this.d.uow.run(async () => {
      await this.d.entitlements.lockForQuotaCheck?.(input.tenantId);
      const ent = await this.d.entitlements.forWorkspace(input.tenantId);
      if (!ent.subscriptionHealthy) {
        throw new QuotaExceededError('Subscription is not active: cannot schedule bookings');
      }

      if (ent.maxBookingsPerMonth !== null) {
        const count = await this.d.bookings.countByTenantInMonth(
          input.tenantId,
          input.startAt.getUTCFullYear(),
          input.startAt.getUTCMonth() + 1,
        );
        if (count >= ent.maxBookingsPerMonth) {
          throw new QuotaExceededError(
            `Monthly booking quota reached for plan ${ent.planLabel}: ${count}/${ent.maxBookingsPerMonth}`,
          );
        }
      }

      const candidateResources = await this.d.resources.listByTenant(input.tenantId, {
        onlyActive: true,
        forUpdate: true,
      });
      const existingHolds = await collectActiveHolds(this.d, input.tenantId, serviceSlot, now, {
        forUpdate: true,
        excludeWaitlistEntryId: input.originWaitlistEntryId,
      });

      const allocResult = availabilitySvc.allocateResourcesForSlot({
        procedure,
        serviceSlot,
        candidateResources,
        existingHolds,
        preferredResourceIds: input.preferredResourceIds,
      });

      if (!allocResult.ok) {
        throw new ResourceAllocationConflictError(allocResult.reason);
      }

      const created = Booking.schedule({
        tenantId: TenantId.from(input.tenantId),
        procedureId: procedure.id,
        procedureName: procedure.name,
        clientName: input.clientName,
        clientEmail: input.clientEmail,
        serviceSlot,
        allocations: allocResult.allocations,
        priceCents: procedure.price.amountCents,
        depositAmount: procedure.depositAmount,
        requireDepositPayment: ent.securityDepositEnabled && procedure.requiresDeposit,
        cancellationPolicy: procedure.cancellationPolicy,
        originWaitlistEntryId: input.originWaitlistEntryId ?? null,
        now,
      });

      await this.d.bookings.save(created);
      return { booking: created, events: created.pullDomainEvents() };
    });

    await this.d.dispatcher.dispatch(events);
    return booking;
  }
}

async function requireBooking(d: Pick<SchedulingDeps, 'bookings'>, tenantId: string, bookingId: string): Promise<Booking> {
  const b = await d.bookings.findById(tenantId, bookingId);
  if (!b) throw new NotFoundError('Booking not found');
  return b;
}

async function persistBooking(d: Pick<SchedulingDeps, 'uow' | 'bookings' | 'dispatcher'>, booking: Booking): Promise<Booking> {
  const events = await d.uow.run(async () => {
    await d.bookings.save(booking);
    return booking.pullDomainEvents();
  });
  await d.dispatcher.dispatch(events);
  return booking;
}

export class ConfirmBookingDepositUseCase {
  constructor(private readonly d: Pick<SchedulingDeps, 'bookings' | 'clock' | 'uow' | 'dispatcher'>) {}
  async execute(input: { tenantId: string; bookingId: string }): Promise<Booking> {
    const b = await requireBooking(this.d, input.tenantId, input.bookingId);
    b.confirmDeposit(this.d.clock.now());
    return persistBooking(this.d, b);
  }
}

export class CheckInBookingUseCase {
  constructor(private readonly d: Pick<SchedulingDeps, 'bookings' | 'clock' | 'uow' | 'dispatcher'>) {}
  async execute(input: { tenantId: string; bookingId: string }): Promise<Booking> {
    const b = await requireBooking(this.d, input.tenantId, input.bookingId);
    b.checkIn(this.d.clock.now());
    return persistBooking(this.d, b);
  }
}

export class CompleteBookingUseCase {
  constructor(private readonly d: Pick<SchedulingDeps, 'bookings' | 'clock' | 'uow' | 'dispatcher'>) {}
  async execute(input: { tenantId: string; bookingId: string }): Promise<Booking> {
    const b = await requireBooking(this.d, input.tenantId, input.bookingId);
    b.complete(this.d.clock.now());
    return persistBooking(this.d, b);
  }
}

export class CancelBookingUseCase {
  constructor(private readonly d: Pick<SchedulingDeps, 'bookings' | 'clock' | 'uow' | 'dispatcher'>) {}
  async execute(input: { tenantId: string; bookingId: string; actorId: string | null; reason: string }): Promise<Booking> {
    const b = await requireBooking(this.d, input.tenantId, input.bookingId);
    b.cancel(this.d.clock.now(), input.actorId, input.reason);
    return persistBooking(this.d, b);
  }
}

export class RecordBookingNoShowUseCase {
  constructor(private readonly d: Pick<SchedulingDeps, 'bookings' | 'clock' | 'uow' | 'dispatcher'>) {}
  async execute(input: { tenantId: string; bookingId: string; actorId: string }): Promise<Booking> {
    const b = await requireBooking(this.d, input.tenantId, input.bookingId);
    b.markAsNoShow(this.d.clock.now(), input.actorId);
    return persistBooking(this.d, b);
  }
}

export class JoinWaitlistUseCase {
  constructor(private readonly d: Pick<SchedulingDeps, 'waitlist' | 'procedures' | 'entitlements' | 'clock' | 'uow'>) {}

  async execute(input: {
    tenantId: string;
    procedureId: string;
    clientName: string;
    clientEmail: string;
    desiredStartAt: Date;
    desiredEndAt: Date;
    priority?: WaitlistPriority;
  }): Promise<WaitlistEntry> {
    const [ent, procedure] = await Promise.all([
      this.d.entitlements.forWorkspace(input.tenantId),
      this.d.procedures.findById(input.tenantId, input.procedureId),
    ]);
    if (!procedure) throw new NotFoundError('ServiceProcedure not found');
    waitlistSpec.assertSatisfiedBy(ent, { requestVipPriority: input.priority === 'VIP' });

    const entry = WaitlistEntry.join({
      tenantId: TenantId.from(input.tenantId),
      procedureId: procedure.id,
      clientName: input.clientName,
      clientEmail: input.clientEmail,
      desiredWindow: TimeSlot.create(input.desiredStartAt, input.desiredEndAt),
      priority: input.priority ?? 'STANDARD',
      now: this.d.clock.now(),
    });
    await this.d.uow.run(() => this.d.waitlist.save(entry));
    return entry;
  }
}

/**
 * Converte uma SlotOffer válida num Booking real de forma atômica dentro da mesma transação.
 */
export class ClaimWaitlistOfferUseCase {
  constructor(private readonly d: SchedulingDeps) {}

  async execute(input: { tenantId: string; waitlistEntryId: string }): Promise<{ entry: WaitlistEntry; booking: Booking }> {
    const now = this.d.clock.now();

    const { entry, booking, events } = await this.d.uow.run(async () => {
      await this.d.entitlements.lockForQuotaCheck?.(input.tenantId);
      const entryRow = await this.d.waitlist.findById(input.tenantId, input.waitlistEntryId, { forUpdate: true });
      if (!entryRow) throw new NotFoundError('WaitlistEntry not found');
      const offer = entryRow.activeOffer;
      if (!offer || entryRow.status !== 'OFFERED') {
        // Delega para o próprio agregado lançar InvalidStateTransitionError semântico
        entryRow.claimOffer('none', now);
        throw new NotFoundError('No active offer');
      }
      // Valida expiração antes mesmo de alocar
      if (now.getTime() > offer.expiresAt.getTime()) {
        entryRow.claimOffer('none', now);
      }

      const ent = await this.d.entitlements.forWorkspace(input.tenantId);
      const procedure = await this.d.procedures.findById(input.tenantId, entryRow.procedureId.value);
      if (!procedure) throw new NotFoundError('ServiceProcedure not found');

      const candidateResources = await this.d.resources.listByTenant(input.tenantId, {
        onlyActive: true,
        forUpdate: true,
      });
      const existingHolds = await collectActiveHolds(this.d, input.tenantId, offer.offeredSlot, now, {
        forUpdate: true,
        excludeWaitlistEntryId: entryRow.id.value,
      });

      const alloc = availabilitySvc.allocateResourcesForSlot({
        procedure,
        serviceSlot: offer.offeredSlot,
        candidateResources,
        existingHolds,
        preferredResourceIds: [...offer.reservedResourceIds],
      });

      const finalAlloc = alloc.ok
        ? alloc
        : availabilitySvc.allocateResourcesForSlot({
            procedure,
            serviceSlot: offer.offeredSlot,
            candidateResources,
            existingHolds,
          });

      if (!finalAlloc.ok) {
        throw new ResourceAllocationConflictError(finalAlloc.reason);
      }

      const createdBooking = Booking.schedule({
        tenantId: TenantId.from(input.tenantId),
        procedureId: procedure.id,
        procedureName: procedure.name,
        clientName: entryRow.clientName,
        clientEmail: entryRow.clientEmail,
        serviceSlot: offer.offeredSlot,
        allocations: finalAlloc.allocations,
        priceCents: procedure.price.amountCents,
        depositAmount: procedure.depositAmount,
        requireDepositPayment: ent.securityDepositEnabled && procedure.requiresDeposit,
        cancellationPolicy: procedure.cancellationPolicy,
        originWaitlistEntryId: entryRow.id.value,
        now,
      });

      entryRow.claimOffer(createdBooking.id.value, now);
      await this.d.bookings.save(createdBooking);
      await this.d.waitlist.save(entryRow);
      return {
        entry: entryRow,
        booking: createdBooking,
        events: [...createdBooking.pullDomainEvents(), ...entryRow.pullDomainEvents()],
      };
    });

    await this.d.dispatcher.dispatch(events);
    return { entry, booking };
  }
}

export class ExpireWaitlistOfferUseCase {
  constructor(private readonly d: Pick<SchedulingDeps, 'waitlist' | 'clock' | 'uow' | 'dispatcher'>) {}

  async execute(input: { tenantId: string; waitlistEntryId: string }): Promise<WaitlistEntry> {
    const entry = await this.d.waitlist.findById(input.tenantId, input.waitlistEntryId);
    if (!entry) throw new NotFoundError('WaitlistEntry not found');
    entry.expireOffer(this.d.clock.now());
    const events = await this.d.uow.run(async () => {
      await this.d.waitlist.save(entry);
      return entry.pullDomainEvents();
    });
    await this.d.dispatcher.dispatch(events);
    return entry;
  }
}

export class CreateWebhookChannelUseCase {
  constructor(private readonly d: Pick<SchedulingDeps, 'webhookChannels' | 'uow'>) {}
  async execute(input: { tenantId: string; name: string; url: string; secret: string }): Promise<WebhookChannel> {
    const ch = WebhookChannel.create({
      tenantId: TenantId.from(input.tenantId),
      name: input.name,
      url: SafeWebhookUrl.create(input.url),
      secret: input.secret,
    });
    await this.d.uow.run(() => this.d.webhookChannels.save(ch));
    return ch;
  }
}
