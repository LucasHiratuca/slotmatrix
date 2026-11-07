import { Booking } from '../aggregates/Booking';
import { ExistingResourceHold } from '../services/MultiResourceAvailabilityDomainService';
import { TimeSlot } from '../value-objects/TimeSlot';

export interface IBookingRepository {
  save(booking: Booking): Promise<void>;
  findById(tenantId: string, id: string): Promise<Booking | null>;
  listByTenant(tenantId: string, opts?: { status?: string; limit?: number }): Promise<Booking[]>;
  countByTenantInMonth(tenantId: string, year: number, month1To12: number): Promise<number>;
  /**
   * Retorna todas as alocações de recursos ativas (CONFIRMED, CHECKED_IN, COMPLETED ou PENDING_DEPOSIT não vencido)
   * que se sobrepõem à janela informada. Quando chamado dentro de uma transação MySQL com `forUpdate: true`,
   * adquire lock nas linhas (`SELECT ... FOR UPDATE`) para erradicar race conditions de double-booking.
   */
  findActiveResourceHoldsInWindow(
    tenantId: string,
    window: TimeSlot,
    now: Date,
    opts?: { forUpdate?: boolean; excludeBookingId?: string },
  ): Promise<ExistingResourceHold[]>;
  /** Uso exclusivo do ExpirationWorker do sistema. */
  findExpiredPendingDepositsSystemWide(now: Date, limit: number): Promise<Booking[]>;
}
