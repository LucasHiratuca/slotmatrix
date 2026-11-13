import { AsyncLocalStorage } from 'node:async_hooks';
import { Infrastructure } from '../composition-root';
import { Clock, UnitOfWork } from '../shared/application/ports';
import { BcryptPasswordHasher, JwtTokenService } from '../shared/infrastructure/security';
import { WorkspaceMapper, WorkspaceRow, MemberRow, UserMapper, UserRow } from '../tenancy/infrastructure/mappers';
import { SubscriptionMapper, SubscriptionRow } from '../billing/infrastructure/mappers';
import { BookableResourceMapper, BookableResourceRow, ServiceProcedureMapper, ServiceProcedureRow } from '../catalog/infrastructure/mappers';
import {
  BookingAllocationRow,
  BookingMapper,
  BookingRow,
  WaitlistEntryMapper,
  WaitlistEntryRow,
  WebhookChannelMapper,
  WebhookChannelRow,
} from '../scheduling/infrastructure/mappers';
import { IWorkspaceRepository } from '../tenancy/domain/repositories/IWorkspaceRepository';
import { AuditLogEntry, IAuditLogRepository, IEmailGateway, IUserRepository, PasswordResetEmailPayload } from '../tenancy/application/ports';
import { ISubscriptionRepository } from '../billing/domain/repositories/ISubscriptionRepository';
import { IProcessedWebhookStore } from '../billing/application/ports';
import { IBookableResourceRepository } from '../catalog/domain/repositories/IBookableResourceRepository';
import { IServiceProcedureRepository } from '../catalog/domain/repositories/IServiceProcedureRepository';
import { IBookingRepository } from '../scheduling/domain/repositories/IBookingRepository';
import { IWaitlistRepository } from '../scheduling/domain/repositories/IWaitlistRepository';
import { INotificationGateway, IWebhookChannelRepository, SlotMatrixNotificationPayload } from '../scheduling/application/ports';
import { User } from '../tenancy/domain/entities/User';
import { Workspace } from '../tenancy/domain/aggregates/Workspace';
import { Subscription } from '../billing/domain/aggregates/Subscription';
import { BookableResource } from '../catalog/domain/aggregates/BookableResource';
import { ServiceProcedure } from '../catalog/domain/aggregates/ServiceProcedure';
import { Booking } from '../scheduling/domain/aggregates/Booking';
import { WaitlistEntry } from '../scheduling/domain/aggregates/WaitlistEntry';
import { WebhookChannel } from '../scheduling/domain/entities/WebhookChannel';
import { TimeSlot } from '../scheduling/domain/value-objects/TimeSlot';
import { ExistingResourceHold } from '../scheduling/domain/services/MultiResourceAvailabilityDomainService';

/**
 * Unit of Work em memória com semântica transacional serial:
 * Enfileira execuções para simular commits atômicos e isolamento em testes concorrentes.
 */
export class InMemoryUnitOfWork implements UnitOfWork {
  private queue: Promise<void> = Promise.resolve();
  private readonly als = new AsyncLocalStorage<boolean>();

  async run<T>(work: () => Promise<T>): Promise<T> {
    if (this.als.getStore()) {
      return work();
    }
    const prev = this.queue;
    let release!: () => void;
    this.queue = new Promise<void>((res) => {
      release = res;
    });
    await prev;
    try {
      return await this.als.run(true, work);
    } finally {
      release();
    }
  }
}

export class MutableClock implements Clock {
  constructor(private current = new Date()) {}
  now() { return new Date(this.current.getTime()); }
  set(d: Date) { this.current = d; }
  advance(ms: number) { this.current = new Date(this.current.getTime() + ms); }
}

export class InMemoryUserRepository implements IUserRepository {
  rows = new Map<string, UserRow>();
  async save(u: User) { this.rows.set(u.id.value, UserMapper.toPersistence(u)); }
  async findById(id: string) { const r = this.rows.get(id); return r ? UserMapper.toDomain(r) : null; }
  async findByEmail(email: string) { const r = [...this.rows.values()].find((x) => x.email === email); return r ? UserMapper.toDomain(r) : null; }
  async findByIds(ids: string[]) { return ids.map((i) => this.rows.get(i)).filter(Boolean).map((r) => UserMapper.toDomain(r!)); }
  async findByResetTokenHash(tokenHash: string) {
    const r = [...this.rows.values()].find((x) => x.reset_token_hash === tokenHash);
    return r ? UserMapper.toDomain(r) : null;
  }
}

export class InMemoryWorkspaceRepository implements IWorkspaceRepository {
  rows = new Map<string, WorkspaceRow>();
  members = new Map<string, MemberRow[]>();
  async save(w: Workspace) {
    const p = WorkspaceMapper.toPersistence(w);
    this.rows.set(p.row.id, p.row);
    this.members.set(p.row.id, p.members);
  }
  private hydrate(r?: WorkspaceRow) { return r ? WorkspaceMapper.toDomain(r, this.members.get(r.id) ?? []) : null; }
  async findById(id: string) { return this.hydrate(this.rows.get(id)); }
  async findBySlug(slug: string) { return this.hydrate([...this.rows.values()].find((r) => r.slug === slug)); }
  async listByMember(userId: string) {
    return [...this.rows.values()].filter((r) => (this.members.get(r.id) ?? []).some((m) => m.user_id === userId)).map((r) => this.hydrate(r)!);
  }
  async slugExists(slug: string) { return [...this.rows.values()].some((r) => r.slug === slug); }
}

export class InMemorySubscriptionRepository implements ISubscriptionRepository {
  rows = new Map<string, SubscriptionRow>();
  async save(s: Subscription) { this.rows.set(s.tenantId.value, SubscriptionMapper.toPersistence(s)); }
  async findByTenant(t: string) { const r = this.rows.get(t); return r ? SubscriptionMapper.toDomain(r) : null; }
  async findByExternalCustomerId(customerId: string) {
    const r = [...this.rows.values()].find((x) => x.external_customer_id === customerId);
    return r ? SubscriptionMapper.toDomain(r) : null;
  }
  async countByPlanAndStatus(): Promise<{ plan: string; status: string; count: number }[]> {
    const counts = new Map<string, number>();
    for (const r of this.rows.values()) {
      const key = `${r.plan}:${r.status}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()].map(([k, count]) => {
      const [plan, status] = k.split(':');
      return { plan, status, count };
    });
  }
  async lockByTenant?(tenantId: string): Promise<void> {}
}

export class InMemoryBookableResourceRepository implements IBookableResourceRepository {
  rows = new Map<string, BookableResourceRow>();
  async save(r: BookableResource) { this.rows.set(r.id.value, BookableResourceMapper.toPersistence(r)); }
  async findById(t: string, id: string) { const r = this.rows.get(id); return r && r.workspace_id === t ? BookableResourceMapper.toDomain(r) : null; }
  async listByTenant(t: string, opts?: { onlyActive?: boolean }) {
    return [...this.rows.values()]
      .filter((r) => r.workspace_id === t && (!opts?.onlyActive || r.status === 'ACTIVE'))
      .sort((a, b) => a.created_at.getTime() - b.created_at.getTime())
      .map(BookableResourceMapper.toDomain);
  }
  async countActiveByTenant(t: string) {
    return [...this.rows.values()].filter((r) => r.workspace_id === t && r.status === 'ACTIVE').length;
  }
}

export class InMemoryServiceProcedureRepository implements IServiceProcedureRepository {
  rows = new Map<string, ServiceProcedureRow>();
  async save(p: ServiceProcedure) { this.rows.set(p.id.value, ServiceProcedureMapper.toPersistence(p)); }
  async findById(t: string, id: string) { const r = this.rows.get(id); return r && r.workspace_id === t ? ServiceProcedureMapper.toDomain(r) : null; }
  async listByTenant(t: string) { return [...this.rows.values()].filter((r) => r.workspace_id === t).map(ServiceProcedureMapper.toDomain); }
}

export class InMemoryBookingRepository implements IBookingRepository {
  rows = new Map<string, BookingRow>();
  allocations = new Map<string, BookingAllocationRow[]>();

  async save(b: Booking) {
    const p = BookingMapper.toPersistence(b);
    this.rows.set(p.row.id, p.row);
    this.allocations.set(p.row.id, p.allocations);
  }

  private h(r: BookingRow) {
    return BookingMapper.toDomain(r, this.allocations.get(r.id) ?? []);
  }

  async findById(t: string, id: string) {
    const r = this.rows.get(id);
    return r && r.workspace_id === t ? this.h(r) : null;
  }

  async listByTenant(t: string, opts?: { status?: string; limit?: number }) {
    return [...this.rows.values()]
      .filter((r) => r.workspace_id === t && (!opts?.status || r.status === opts.status))
      .sort((a, b) => a.service_start_at.getTime() - b.service_start_at.getTime())
      .slice(0, opts?.limit ?? 200)
      .map((r) => this.h(r));
  }

  async countByTenantInMonth(t: string, year: number, month1To12: number) {
    return [...this.rows.values()].filter(
      (r) =>
        r.workspace_id === t &&
        r.status !== 'CANCELLED' &&
        r.status !== 'EXPIRED' &&
        r.service_start_at.getUTCFullYear() === year &&
        r.service_start_at.getUTCMonth() + 1 === month1To12,
    ).length;
  }

  async findActiveResourceHoldsInWindow(
    tenantId: string,
    window: TimeSlot,
    now: Date,
    opts?: { forUpdate?: boolean; excludeBookingId?: string },
  ): Promise<ExistingResourceHold[]> {
    const holds: ExistingResourceHold[] = [];
    for (const r of this.rows.values()) {
      if (r.workspace_id !== tenantId) continue;
      if (opts?.excludeBookingId && r.id === opts.excludeBookingId) continue;
      const b = this.h(r);
      if (!b.holdsResources(now)) continue;
      for (const a of b.allocations) {
        if (a.effectiveOccupiedSlot.overlapsWith(window)) {
          holds.push({ resourceId: a.resourceId, effectiveOccupiedSlot: a.effectiveOccupiedSlot });
        }
      }
    }
    return holds;
  }

  async findExpiredPendingDepositsSystemWide(now: Date, limit: number) {
    return [...this.rows.values()]
      .filter((r) => r.status === 'PENDING_DEPOSIT' && r.deposit_expires_at && r.deposit_expires_at <= now)
      .slice(0, limit)
      .map((r) => this.h(r));
  }
}

export class InMemoryWaitlistRepository implements IWaitlistRepository {
  rows = new Map<string, WaitlistEntryRow>();

  async save(e: WaitlistEntry) {
    this.rows.set(e.id.value, WaitlistEntryMapper.toPersistence(e));
  }
  async findById(t: string, id: string) {
    const r = this.rows.get(id);
    return r && r.workspace_id === t ? WaitlistEntryMapper.toDomain(r) : null;
  }
  async listByTenant(t: string) {
    return [...this.rows.values()]
      .filter((r) => r.workspace_id === t)
      .sort((a, b) => a.created_at.getTime() - b.created_at.getTime())
      .map(WaitlistEntryMapper.toDomain);
  }
  async listWaitingByProcedureOrdered(t: string, procedureId: string) {
    return [...this.rows.values()]
      .filter((r) => r.workspace_id === t && r.procedure_id === procedureId && r.status === 'WAITING')
      .sort((a, b) => {
        if (a.priority !== b.priority) return a.priority === 'VIP' ? -1 : 1;
        return a.created_at.getTime() - b.created_at.getTime();
      })
      .map(WaitlistEntryMapper.toDomain);
  }
  async listActiveOffersByTenant(t: string, now: Date) {
    return [...this.rows.values()]
      .filter((r) => r.workspace_id === t && r.status === 'OFFERED' && r.offer_expires_at && r.offer_expires_at > now)
      .map(WaitlistEntryMapper.toDomain);
  }
  async findExpiredOffersSystemWide(now: Date, limit: number) {
    return [...this.rows.values()]
      .filter((r) => r.status === 'OFFERED' && r.offer_expires_at && r.offer_expires_at <= now)
      .slice(0, limit)
      .map(WaitlistEntryMapper.toDomain);
  }
}

export class InMemoryWebhookChannelRepository implements IWebhookChannelRepository {
  rows = new Map<string, WebhookChannelRow>();
  async save(c: WebhookChannel) { this.rows.set(c.id.value, WebhookChannelMapper.toPersistence(c)); }
  async listByTenant(t: string) { return [...this.rows.values()].filter((r) => r.workspace_id === t).map(WebhookChannelMapper.toDomain); }
}

export class InMemoryAuditLogRepository implements IAuditLogRepository {
  entries: AuditLogEntry[] = [];
  async append(e: AuditLogEntry) { this.entries.push(Object.freeze({ ...e })); }
  async listByTenant(t: string, limit: number) {
    return this.entries
      .filter((e) => e.tenantId === t)
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
      .slice(0, limit);
  }
}

export class InMemoryProcessedWebhookStore implements IProcessedWebhookStore {
  ids = new Set<string>();
  async registerIfNew(id: string) {
    if (this.ids.has(id)) return false;
    this.ids.add(id);
    return true;
  }
}

export class RecordingNotificationGateway implements INotificationGateway {
  sent: { channelId: string; payload: SlotMatrixNotificationPayload }[] = [];
  async send(channel: WebhookChannel, payload: SlotMatrixNotificationPayload) {
    this.sent.push({ channelId: channel.id.value, payload });
  }
}

export class InMemoryEmailGateway implements IEmailGateway {
  sentEmails: PasswordResetEmailPayload[] = [];
  async sendPasswordResetEmail(payload: PasswordResetEmailPayload): Promise<void> {
    this.sentEmails.push({ ...payload });
  }
}

export function buildInMemoryInfrastructure(opts: { clock?: Clock; jwtSecret?: string } = {}) {
  const infra = {
    uow: new InMemoryUnitOfWork(),
    clock: opts.clock ?? new MutableClock(),
    users: new InMemoryUserRepository(),
    workspaces: new InMemoryWorkspaceRepository(),
    subscriptions: new InMemorySubscriptionRepository(),
    resources: new InMemoryBookableResourceRepository(),
    procedures: new InMemoryServiceProcedureRepository(),
    bookings: new InMemoryBookingRepository(),
    waitlist: new InMemoryWaitlistRepository(),
    webhookChannels: new InMemoryWebhookChannelRepository(),
    auditLogs: new InMemoryAuditLogRepository(),
    processedWebhooks: new InMemoryProcessedWebhookStore(),
    notifications: new RecordingNotificationGateway(),
    emails: new InMemoryEmailGateway(),
    hasher: new BcryptPasswordHasher(4),
    tokens: new JwtTokenService(opts.jwtSecret ?? 'test-secret'),
  };
  return infra satisfies Infrastructure;
}

export type InMemoryInfrastructure = ReturnType<typeof buildInMemoryInfrastructure>;
