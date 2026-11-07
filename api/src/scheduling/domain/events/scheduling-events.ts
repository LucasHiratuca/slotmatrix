import { DomainEvent } from '../../../shared/domain/DomainEvent';

export class BookingScheduledDomainEvent implements DomainEvent {
  readonly name = 'BookingScheduled';
  constructor(
    readonly tenantId: string,
    readonly aggregateId: string, // bookingId
    readonly procedureId: string,
    readonly clientName: string,
    readonly status: string,
    readonly startAt: Date,
    readonly endAt: Date,
    readonly occurredAt: Date,
  ) {}
}

export class BookingDepositConfirmedDomainEvent implements DomainEvent {
  readonly name = 'BookingDepositConfirmed';
  constructor(
    readonly tenantId: string,
    readonly aggregateId: string,
    readonly depositCents: number,
    readonly occurredAt: Date,
  ) {}
}

export class BookingCancelledDomainEvent implements DomainEvent {
  readonly name = 'BookingCancelled';
  constructor(
    readonly tenantId: string,
    readonly aggregateId: string,
    readonly procedureId: string,
    readonly startAt: Date,
    readonly endAt: Date,
    readonly releasedResourceIds: string[],
    readonly retainedCents: number,
    readonly refundedCents: number,
    readonly actorId: string | null,
    readonly reason: string,
    readonly occurredAt: Date,
  ) {}
}

export class NoShowRecordedDomainEvent implements DomainEvent {
  readonly name = 'NoShowRecorded';
  constructor(
    readonly tenantId: string,
    readonly aggregateId: string,
    readonly procedureId: string,
    readonly retainedCents: number,
    readonly actorId: string,
    readonly occurredAt: Date,
  ) {}
}

export class WaitlistSlotOfferedDomainEvent implements DomainEvent {
  readonly name = 'WaitlistSlotOffered';
  constructor(
    readonly tenantId: string,
    readonly aggregateId: string, // waitlistEntryId
    readonly procedureId: string,
    readonly clientName: string,
    readonly clientContact: string,
    readonly offeredStartAt: Date,
    readonly offeredEndAt: Date,
    readonly offerExpiresAt: Date,
    readonly occurredAt: Date,
  ) {}
}

export class WaitlistOfferClaimedDomainEvent implements DomainEvent {
  readonly name = 'WaitlistOfferClaimed';
  constructor(
    readonly tenantId: string,
    readonly aggregateId: string,
    readonly procedureId: string,
    readonly bookingId: string,
    readonly occurredAt: Date,
  ) {}
}

export class WaitlistOfferExpiredDomainEvent implements DomainEvent {
  readonly name = 'WaitlistOfferExpired';
  constructor(
    readonly tenantId: string,
    readonly aggregateId: string,
    readonly procedureId: string,
    readonly offeredStartAt: Date,
    readonly offeredEndAt: Date,
    readonly reservedResourceIds: string[],
    readonly occurredAt: Date,
  ) {}
}
