import { DomainEvent } from '../../shared/domain/DomainEvent';
import { Clock, DomainEventDispatcher, EventHandler, UnitOfWork } from '../../shared/application/ports';
import { IBookableResourceRepository } from '../../catalog/domain/repositories/IBookableResourceRepository';
import { IServiceProcedureRepository } from '../../catalog/domain/repositories/IServiceProcedureRepository';
import { IBookingRepository } from '../domain/repositories/IBookingRepository';
import { IWaitlistRepository } from '../domain/repositories/IWaitlistRepository';
import { MultiResourceAvailabilityDomainService } from '../domain/services/MultiResourceAvailabilityDomainService';
import { TimeSlot } from '../domain/value-objects/TimeSlot';
import { WorkspaceEntitlementPolicy } from '../domain/WorkspaceEntitlementPolicy';
import { BookingCancelledDomainEvent, WaitlistOfferExpiredDomainEvent } from '../domain/events/scheduling-events';
import { INotificationGateway, IWebhookChannelRepository } from './ports';
import { collectActiveHolds } from './use-cases';

const availabilitySvc = new MultiResourceAvailabilityDomainService();

interface MatchDeps {
  uow: UnitOfWork;
  dispatcher: DomainEventDispatcher;
  clock: Clock;
  entitlements: WorkspaceEntitlementPolicy;
  resources: IBookableResourceRepository;
  procedures: IServiceProcedureRepository;
  bookings: IBookingRepository;
  waitlist: IWaitlistRepository;
  webhookChannels: IWebhookChannelRepository;
  notifications: INotificationGateway;
  offerTtlMinutes?: number;
}

async function matchNextWaitlistCandidate(
  d: MatchDeps,
  input: {
    tenantId: string;
    procedureId: string;
    freedSlot: TimeSlot;
    preferredResourceIds: string[];
  },
): Promise<void> {
  const ent = await d.entitlements.forWorkspace(input.tenantId);
  if (!ent.subscriptionHealthy || !ent.smartWaitlistEnabled) return;

  const [procedure, candidates] = await Promise.all([
    d.procedures.findById(input.tenantId, input.procedureId),
    d.waitlist.listWaitingByProcedureOrdered(input.tenantId, input.procedureId),
  ]);
  if (!procedure || candidates.length === 0) return;

  const matchingCandidate = candidates.find((c) => c.matchesSlot(input.procedureId, input.freedSlot));
  if (!matchingCandidate) return;

  const now = d.clock.now();
  const [allActiveResources, existingHolds] = await Promise.all([
    d.resources.listByTenant(input.tenantId, { onlyActive: true }),
    collectActiveHolds(d, input.tenantId, input.freedSlot, now),
  ]);

  let alloc = availabilitySvc.allocateResourcesForSlot({
    procedure,
    serviceSlot: input.freedSlot,
    candidateResources: allActiveResources,
    existingHolds,
    preferredResourceIds: input.preferredResourceIds,
  });
  if (!alloc.ok) {
    alloc = availabilitySvc.allocateResourcesForSlot({
      procedure,
      serviceSlot: input.freedSlot,
      candidateResources: allActiveResources,
      existingHolds,
    });
  }
  if (!alloc.ok) return;

  const reservedIds = alloc.allocations.map((a) => a.resourceId);
  const ttl = d.offerTtlMinutes ?? 30;
  matchingCandidate.issueSlotOffer(input.freedSlot, reservedIds, ttl, now);

  const events = await d.uow.run(async () => {
    await d.waitlist.save(matchingCandidate);
    return matchingCandidate.pullDomainEvents();
  });
  await d.dispatcher.dispatch(events);

  const channels = await d.webhookChannels.listByTenant(input.tenantId);
  const offer = matchingCandidate.activeOffer!;
  for (const ch of channels) {
    if (!ch.enabled) continue;
    try {
      await d.notifications.send(ch, {
        type: 'waitlist.slot_offered',
        tenantId: input.tenantId,
        referenceId: matchingCandidate.id.value,
        procedureId: input.procedureId,
        clientName: matchingCandidate.clientName,
        clientEmail: matchingCandidate.clientEmail,
        slotStartAt: input.freedSlot.startAt.toISOString(),
        slotEndAt: input.freedSlot.endAt.toISOString(),
        offerExpiresAt: offer.expiresAt.toISOString(),
        claimUrl: `/api/waitlist/${matchingCandidate.id.value}/claim`,
        message: `Exclusive SlotOffer issued to ${matchingCandidate.clientName} for ${procedure.name} (expires in ${ttl}m)`,
        occurredAt: now.toISOString(),
      });
      ch.markDelivered(now);
      await d.webhookChannels.save(ch);
    } catch (err) {
      console.error(`[webhook] channel ${ch.id.value} failed`, err);
    }
  }
}

/**
 * Escuta BookingCancelledDomainEvent: se o Workspace possuir Smart Waitlist ativa (PRO/ENTERPRISE),
 * oferece automaticamente a vaga liberada para o 1º candidato compatível da fila.
 */
export class OnBookingCancelledMatchWaitlistHandler implements EventHandler<BookingCancelledDomainEvent> {
  constructor(private readonly d: MatchDeps) {}

  async handle(e: BookingCancelledDomainEvent): Promise<void> {
    const freedSlot = TimeSlot.create(e.startAt, e.endAt);
    await matchNextWaitlistCandidate(this.d, {
      tenantId: e.tenantId,
      procedureId: e.procedureId,
      freedSlot,
      preferredResourceIds: e.releasedResourceIds,
    });
  }
}

/**
 * Cascata reativa: quando uma SlotOffer expira sem aceite, repassa automaticamente a oferta
 * para o próximo candidato WAITING elegível da fila!
 */
export class OnWaitlistOfferExpiredCascadeHandler implements EventHandler<WaitlistOfferExpiredDomainEvent> {
  constructor(private readonly d: MatchDeps) {}

  async handle(e: WaitlistOfferExpiredDomainEvent): Promise<void> {
    const freedSlot = TimeSlot.create(e.offeredStartAt, e.offeredEndAt);
    await matchNextWaitlistCandidate(this.d, {
      tenantId: e.tenantId,
      procedureId: e.procedureId,
      freedSlot,
      preferredResourceIds: e.reservedResourceIds,
    });
  }
}

/**
 * Reage a mudanças de plano (SubscriptionPlanChanged) pelo nome do evento (sem acoplar scheduling/catalog a billing):
 * em caso de downgrade (ex: PRO -> STARTER), arquiva BookableResources excedentes preservando os mais antigos ativos.
 */
export class OnSubscriptionPlanChangedHandler implements EventHandler<DomainEvent> {
  constructor(
    private readonly d: {
      resources: IBookableResourceRepository;
      entitlements: WorkspaceEntitlementPolicy;
      uow: UnitOfWork;
    },
  ) {}

  async handle(e: DomainEvent): Promise<void> {
    const ent = await this.d.entitlements.forWorkspace(e.tenantId);
    if (ent.maxActiveResources === null) return;
    const all = (await this.d.resources.listByTenant(e.tenantId))
      .filter((r) => r.status === 'ACTIVE')
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    if (all.length <= ent.maxActiveResources) return;
    const toArchive = all.slice(ent.maxActiveResources);
    await this.d.uow.run(async () => {
      for (const r of toArchive) {
        r.setStatus('ARCHIVED');
        await this.d.resources.save(r);
      }
    });
  }
}
