import { AggregateRoot } from '../../../shared/domain/AggregateRoot';
import { TenantId, UniqueEntityId } from '../../../shared/domain/UniqueEntityId';
import { InvalidStateTransitionError, ValidationError } from '../../../shared/domain/errors';
import { TimeSlot } from '../value-objects/TimeSlot';
import { ResourceCategory } from '../../../catalog/domain/aggregates/BookableResource';
import { Money } from '../../../catalog/domain/value-objects/Money';
import { CancellationPolicyRule } from '../../../catalog/domain/value-objects/CancellationPolicyRule';
import {
  BookingCancelledDomainEvent,
  BookingDepositConfirmedDomainEvent,
  BookingScheduledDomainEvent,
  NoShowRecordedDomainEvent,
} from '../events/scheduling-events';

export type BookingStatus =
  | 'PENDING_DEPOSIT'
  | 'CONFIRMED'
  | 'CHECKED_IN'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'NO_SHOW'
  | 'EXPIRED';

export type DepositStatus = 'NOT_REQUIRED' | 'PENDING' | 'PAID' | 'REFUNDED' | 'PARTIALLY_RETAINED' | 'FORFEITED';

/**
 * Trava temporal individual de um recurso dentro de um Booking.
 * Note que `effectiveOccupiedSlot` inclui os minutos de preparo e de esterilização/turnaround específicos daquele recurso.
 */
export interface ResourceAllocation {
  readonly resourceId: string;
  readonly resourceName: string;
  readonly category: ResourceCategory;
  readonly serviceSlot: TimeSlot;
  readonly prepMinutes: number;
  readonly cleanupMinutes: number;
  readonly effectiveOccupiedSlot: TimeSlot;
}

export interface BookingProps {
  tenantId: TenantId;
  procedureId: UniqueEntityId;
  procedureName: string;
  clientName: string;
  clientEmail: string;
  serviceSlot: TimeSlot;
  allocations: ResourceAllocation[];
  status: BookingStatus;
  priceCents: number;
  currency: string;
  depositAmount: Money;
  depositStatus: DepositStatus;
  depositExpiresAt: Date | null;
  cancellationPolicy: CancellationPolicyRule;
  retainedCents: number;
  refundedCents: number;
  cancellationReason: string | null;
  originWaitlistEntryId: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export class Booking extends AggregateRoot<BookingProps> {
  private constructor(props: BookingProps, id: UniqueEntityId) {
    super(props, id);
  }

  static schedule(
    input: {
      tenantId: TenantId;
      procedureId: UniqueEntityId;
      procedureName: string;
      clientName: string;
      clientEmail: string;
      serviceSlot: TimeSlot;
      allocations: ResourceAllocation[];
      priceCents: number;
      depositAmount: Money;
      depositHoldMinutes?: number;
      requireDepositPayment: boolean; // true se procedimento tem sinal > 0 e plano tem securityDepositEnabled
      cancellationPolicy: CancellationPolicyRule;
      originWaitlistEntryId?: string | null;
      now: Date;
    },
    id = UniqueEntityId.generate(),
  ): Booking {
    if (!input.clientName || input.clientName.trim().length < 2) {
      throw new ValidationError('Client name must have at least 2 chars');
    }
    if (!input.clientEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.clientEmail.trim())) {
      throw new ValidationError('Valid client e-mail is required');
    }
    if (!Array.isArray(input.allocations) || input.allocations.length === 0) {
      throw new ValidationError('Booking must allocate at least one BookableResource');
    }

    const needsDeposit = input.requireDepositPayment && !input.depositAmount.isZero;
    const status: BookingStatus = needsDeposit ? 'PENDING_DEPOSIT' : 'CONFIRMED';
    const depositStatus: DepositStatus = needsDeposit ? 'PENDING' : 'NOT_REQUIRED';
    const holdMin = input.depositHoldMinutes ?? 30;
    const depositExpiresAt = needsDeposit ? new Date(input.now.getTime() + holdMin * 60_000) : null;

    const booking = new Booking(
      {
        tenantId: input.tenantId,
        procedureId: input.procedureId,
        procedureName: input.procedureName,
        clientName: input.clientName.trim(),
        clientEmail: input.clientEmail.trim().toLowerCase(),
        serviceSlot: input.serviceSlot,
        allocations: input.allocations.map((a) => Object.freeze({ ...a })),
        status,
        priceCents: input.priceCents,
        currency: input.depositAmount.currency,
        depositAmount: needsDeposit ? input.depositAmount : Money.zero(input.depositAmount.currency),
        depositStatus,
        depositExpiresAt,
        cancellationPolicy: input.cancellationPolicy,
        retainedCents: 0,
        refundedCents: 0,
        cancellationReason: null,
        originWaitlistEntryId: input.originWaitlistEntryId ?? null,
        version: 1,
        createdAt: input.now,
        updatedAt: input.now,
      },
      id,
    );

    booking.addDomainEvent(
      new BookingScheduledDomainEvent(
        input.tenantId.value,
        id.value,
        input.procedureId.value,
        booking.props.clientName,
        status,
        input.serviceSlot.startAt,
        input.serviceSlot.endAt,
        input.now,
      ),
    );
    return booking;
  }

  static reconstitute(props: BookingProps, id: UniqueEntityId): Booking {
    return new Booking(props, id);
  }

  get tenantId(): TenantId { return this.props.tenantId; }
  get procedureId(): UniqueEntityId { return this.props.procedureId; }
  get procedureName(): string { return this.props.procedureName; }
  get clientName(): string { return this.props.clientName; }
  get clientEmail(): string { return this.props.clientEmail; }
  get serviceSlot(): TimeSlot { return this.props.serviceSlot; }
  get allocations(): ReadonlyArray<ResourceAllocation> { return [...this.props.allocations]; }
  get status(): BookingStatus { return this.props.status; }
  get priceCents(): number { return this.props.priceCents; }
  get currency(): string { return this.props.currency; }
  get depositAmount(): Money { return this.props.depositAmount; }
  get depositStatus(): DepositStatus { return this.props.depositStatus; }
  get depositExpiresAt(): Date | null { return this.props.depositExpiresAt; }
  get cancellationPolicy(): CancellationPolicyRule { return this.props.cancellationPolicy; }
  get retainedCents(): number { return this.props.retainedCents; }
  get refundedCents(): number { return this.props.refundedCents; }
  get cancellationReason(): string | null { return this.props.cancellationReason; }
  get originWaitlistEntryId(): string | null { return this.props.originWaitlistEntryId; }
  get version(): number { return this.props.version; }
  get createdAt(): Date { return this.props.createdAt; }
  get updatedAt(): Date { return this.props.updatedAt; }

  /** Reserva ocupa recursos na grade enquanto estiver PENDING_DEPOSIT (não vencido), CONFIRMED ou CHECKED_IN. */
  holdsResources(now?: Date): boolean {
    if (this.props.status === 'CONFIRMED' || this.props.status === 'CHECKED_IN' || this.props.status === 'COMPLETED') {
      return true;
    }
    if (this.props.status === 'PENDING_DEPOSIT') {
      if (!now || !this.props.depositExpiresAt) return true;
      return now.getTime() <= this.props.depositExpiresAt.getTime();
    }
    return false;
  }

  /** PENDING_DEPOSIT -> CONFIRMED */
  confirmDeposit(now: Date): void {
    if (this.props.status !== 'PENDING_DEPOSIT') {
      throw new InvalidStateTransitionError(`Cannot confirm deposit when booking is ${this.props.status}`);
    }
    if (this.props.depositExpiresAt && now.getTime() > this.props.depositExpiresAt.getTime()) {
      throw new InvalidStateTransitionError('Deposit payment window has already expired');
    }
    this.props.status = 'CONFIRMED';
    this.props.depositStatus = 'PAID';
    this.props.depositExpiresAt = null;
    this.bump(now);
    this.addDomainEvent(
      new BookingDepositConfirmedDomainEvent(this.props.tenantId.value, this.id.value, this.props.depositAmount.amountCents, now),
    );
  }

  /** CONFIRMED -> CHECKED_IN */
  checkIn(now: Date): void {
    if (this.props.status !== 'CONFIRMED') {
      throw new InvalidStateTransitionError(`Cannot check-in booking in status ${this.props.status} (must be CONFIRMED)`);
    }
    this.props.status = 'CHECKED_IN';
    this.bump(now);
  }

  /** CHECKED_IN -> COMPLETED */
  complete(now: Date): void {
    if (this.props.status !== 'CHECKED_IN') {
      throw new InvalidStateTransitionError(`Cannot complete booking in status ${this.props.status} (must be CHECKED_IN)`);
    }
    this.props.status = 'COMPLETED';
    this.bump(now);
  }

  /**
   * PENDING_DEPOSIT | CONFIRMED -> CANCELLED.
   * Se o sinal já estava PAID, aplica a CancellationPolicyRule para calcular retenção e reembolso em centavos.
   * Emite BookingCancelledDomainEvent para acionar a Smart Waitlist.
   */
  cancel(cancelledAt: Date, actorId: string | null, reason: string): void {
    if (this.props.status !== 'CONFIRMED' && this.props.status !== 'PENDING_DEPOSIT') {
      throw new InvalidStateTransitionError(`Cannot cancel booking in status ${this.props.status}`);
    }
    if (!reason || reason.trim().length < 2) {
      throw new ValidationError('Cancellation reason is required');
    }
    const wasConfirmedWithPaidDeposit = this.props.status === 'CONFIRMED' && this.props.depositStatus === 'PAID';
    if (wasConfirmedWithPaidDeposit) {
      const outcome = this.props.cancellationPolicy.evaluateCancellation(
        this.props.depositAmount,
        this.props.serviceSlot.startAt,
        cancelledAt,
      );
      this.props.retainedCents = outcome.retained.amountCents;
      this.props.refundedCents = outcome.refunded.amountCents;
      this.props.depositStatus =
        outcome.retained.amountCents === 0
          ? 'REFUNDED'
          : outcome.refunded.amountCents === 0
          ? 'FORFEITED'
          : 'PARTIALLY_RETAINED';
    } else {
      this.props.retainedCents = 0;
      this.props.refundedCents = 0;
    }

    this.props.status = 'CANCELLED';
    this.props.cancellationReason = reason.trim();
    this.bump(cancelledAt);

    this.addDomainEvent(
      new BookingCancelledDomainEvent(
        this.props.tenantId.value,
        this.id.value,
        this.props.procedureId.value,
        this.props.serviceSlot.startAt,
        this.props.serviceSlot.endAt,
        this.props.allocations.map((a) => a.resourceId),
        this.props.retainedCents,
        this.props.refundedCents,
        actorId,
        this.props.cancellationReason,
        cancelledAt,
      ),
    );
  }

  /**
   * CONFIRMED -> NO_SHOW.
   * Proibido registrar NO_SHOW antes do horário de início do agendamento (`serviceSlot.startAt`).
   * Retém 100% do SecurityDeposit pago conforme a política.
   */
  markAsNoShow(recordedAt: Date, actorId: string): void {
    if (this.props.status !== 'CONFIRMED') {
      throw new InvalidStateTransitionError(`Cannot mark NO_SHOW when booking is ${this.props.status}`);
    }
    if (recordedAt.getTime() < this.props.serviceSlot.startAt.getTime()) {
      throw new InvalidStateTransitionError('Cannot mark a booking as NO_SHOW before its scheduled start time');
    }
    if (this.props.depositStatus === 'PAID') {
      const outcome = this.props.cancellationPolicy.evaluateNoShow(this.props.depositAmount);
      this.props.retainedCents = outcome.retained.amountCents;
      this.props.refundedCents = outcome.refunded.amountCents;
      this.props.depositStatus = 'FORFEITED';
    }
    this.props.status = 'NO_SHOW';
    this.bump(recordedAt);
    this.addDomainEvent(
      new NoShowRecordedDomainEvent(
        this.props.tenantId.value,
        this.id.value,
        this.props.procedureId.value,
        this.props.retainedCents,
        actorId,
        recordedAt,
      ),
    );
  }

  /** Expira reserva PENDING_DEPOSIT cujo prazo venceu. */
  expireUnpaidDeposit(now: Date): void {
    if (this.props.status !== 'PENDING_DEPOSIT') {
      throw new InvalidStateTransitionError(`Cannot expire booking in status ${this.props.status}`);
    }
    this.props.status = 'EXPIRED';
    this.bump(now);
  }

  private bump(now: Date) {
    this.props.version += 1;
    this.props.updatedAt = now;
  }
}
