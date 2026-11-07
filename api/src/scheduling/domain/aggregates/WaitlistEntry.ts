import { AggregateRoot } from '../../../shared/domain/AggregateRoot';
import { TenantId, UniqueEntityId } from '../../../shared/domain/UniqueEntityId';
import { InvalidStateTransitionError, ValidationError } from '../../../shared/domain/errors';
import { TimeSlot } from '../value-objects/TimeSlot';
import {
  WaitlistOfferClaimedDomainEvent,
  WaitlistOfferExpiredDomainEvent,
  WaitlistSlotOfferedDomainEvent,
} from '../events/scheduling-events';

export type WaitlistStatus = 'WAITING' | 'OFFERED' | 'CLAIMED' | 'OFFER_EXPIRED' | 'CANCELLED';
export type WaitlistPriority = 'STANDARD' | 'VIP';

export interface SlotOffer {
  readonly offeredSlot: TimeSlot;
  readonly reservedResourceIds: ReadonlyArray<string>;
  readonly offeredAt: Date;
  readonly expiresAt: Date;
}

export interface WaitlistEntryProps {
  tenantId: TenantId;
  procedureId: UniqueEntityId;
  clientName: string;
  clientEmail: string;
  desiredWindow: TimeSlot;
  priority: WaitlistPriority;
  status: WaitlistStatus;
  activeOffer: SlotOffer | null;
  claimedBookingId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class WaitlistEntry extends AggregateRoot<WaitlistEntryProps> {
  private constructor(props: WaitlistEntryProps, id: UniqueEntityId) {
    super(props, id);
  }

  static join(
    input: {
      tenantId: TenantId;
      procedureId: UniqueEntityId;
      clientName: string;
      clientEmail: string;
      desiredWindow: TimeSlot;
      priority?: WaitlistPriority;
      now: Date;
    },
    id = UniqueEntityId.generate(),
  ): WaitlistEntry {
    if (!input.clientName || input.clientName.trim().length < 2) {
      throw new ValidationError('Client name must have at least 2 chars');
    }
    if (!input.clientEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.clientEmail.trim())) {
      throw new ValidationError('Valid client e-mail is required');
    }
    return new WaitlistEntry(
      {
        tenantId: input.tenantId,
        procedureId: input.procedureId,
        clientName: input.clientName.trim(),
        clientEmail: input.clientEmail.trim().toLowerCase(),
        desiredWindow: input.desiredWindow,
        priority: input.priority ?? 'STANDARD',
        status: 'WAITING',
        activeOffer: null,
        claimedBookingId: null,
        createdAt: input.now,
        updatedAt: input.now,
      },
      id,
    );
  }

  static reconstitute(props: WaitlistEntryProps, id: UniqueEntityId): WaitlistEntry {
    return new WaitlistEntry(props, id);
  }

  get tenantId(): TenantId { return this.props.tenantId; }
  get procedureId(): UniqueEntityId { return this.props.procedureId; }
  get clientName(): string { return this.props.clientName; }
  get clientEmail(): string { return this.props.clientEmail; }
  get desiredWindow(): TimeSlot { return this.props.desiredWindow; }
  get priority(): WaitlistPriority { return this.props.priority; }
  get status(): WaitlistStatus { return this.props.status; }
  get activeOffer(): SlotOffer | null { return this.props.activeOffer; }
  get claimedBookingId(): string | null { return this.props.claimedBookingId; }
  get createdAt(): Date { return this.props.createdAt; }
  get updatedAt(): Date { return this.props.updatedAt; }

  /** Verifica se este pedido na fila aceita um slot liberado (mesmo procedimento e dentro da janela desejada). */
  matchesSlot(procedureId: string, slot: TimeSlot): boolean {
    if (this.props.status !== 'WAITING') return false;
    if (this.props.procedureId.value !== procedureId) return false;
    return this.props.desiredWindow.contains(slot) || this.props.desiredWindow.overlapsWith(slot);
  }

  /** WAITING -> OFFERED (com TTL exato em minutos, padrão 30m). */
  issueSlotOffer(
    offeredSlot: TimeSlot,
    reservedResourceIds: string[],
    ttlMinutes: number,
    now: Date,
  ): void {
    if (this.props.status !== 'WAITING') {
      throw new InvalidStateTransitionError(`Cannot issue SlotOffer when entry is ${this.props.status}`);
    }
    if (!Number.isInteger(ttlMinutes) || ttlMinutes <= 0) {
      throw new ValidationError('SlotOffer ttlMinutes must be a positive integer');
    }
    const expiresAt = new Date(now.getTime() + ttlMinutes * 60_000);
    this.props.status = 'OFFERED';
    this.props.activeOffer = Object.freeze({
      offeredSlot,
      reservedResourceIds: Object.freeze([...reservedResourceIds]),
      offeredAt: now,
      expiresAt,
    });
    this.props.updatedAt = now;
    this.addDomainEvent(
      new WaitlistSlotOfferedDomainEvent(
        this.props.tenantId.value,
        this.id.value,
        this.props.procedureId.value,
        this.props.clientName,
        this.props.clientEmail,
        offeredSlot.startAt,
        offeredSlot.endAt,
        expiresAt,
        now,
      ),
    );
  }

  /** OFFERED -> CLAIMED. Falha se `now > offerExpiresAt`. */
  claimOffer(bookingId: string, now: Date): void {
    if (this.props.status !== 'OFFERED' || !this.props.activeOffer) {
      throw new InvalidStateTransitionError(`Cannot claim offer when entry is ${this.props.status}`);
    }
    if (now.getTime() > this.props.activeOffer.expiresAt.getTime()) {
      throw new InvalidStateTransitionError('SlotOffer has already expired');
    }
    this.props.status = 'CLAIMED';
    this.props.claimedBookingId = bookingId;
    this.props.updatedAt = now;
    this.addDomainEvent(
      new WaitlistOfferClaimedDomainEvent(
        this.props.tenantId.value,
        this.id.value,
        this.props.procedureId.value,
        bookingId,
        now,
      ),
    );
  }

  /** OFFERED -> OFFER_EXPIRED. Emite WaitlistOfferExpiredDomainEvent para cascata ao próximo da fila. */
  expireOffer(now: Date): void {
    if (this.props.status !== 'OFFERED' || !this.props.activeOffer) {
      throw new InvalidStateTransitionError(`Cannot expire offer when entry is ${this.props.status}`);
    }
    const offer = this.props.activeOffer;
    this.props.status = 'OFFER_EXPIRED';
    this.props.updatedAt = now;
    this.addDomainEvent(
      new WaitlistOfferExpiredDomainEvent(
        this.props.tenantId.value,
        this.id.value,
        this.props.procedureId.value,
        offer.offeredSlot.startAt,
        offer.offeredSlot.endAt,
        [...offer.reservedResourceIds],
        now,
      ),
    );
  }
}
