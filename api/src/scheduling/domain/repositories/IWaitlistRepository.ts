import { WaitlistEntry } from '../aggregates/WaitlistEntry';

export interface IWaitlistRepository {
  save(entry: WaitlistEntry): Promise<void>;
  findById(tenantId: string, id: string): Promise<WaitlistEntry | null>;
  listByTenant(tenantId: string): Promise<WaitlistEntry[]>;
  /** Lista entradas WAITING para um procedimento ordenadas por prioridade (VIP primeiro) e depois FIFO (createdAt ASC). */
  listWaitingByProcedureOrdered(tenantId: string, procedureId: string): Promise<WaitlistEntry[]>;
  /** Lista entradas com SlotOffer ativa (status = OFFERED e expiresAt > now) para bloquear preventivamente o slot. */
  listActiveOffersByTenant(tenantId: string, now: Date): Promise<WaitlistEntry[]>;
  /** Uso exclusivo do ExpirationWorker do sistema. */
  findExpiredOffersSystemWide(now: Date, limit: number): Promise<WaitlistEntry[]>;
}
