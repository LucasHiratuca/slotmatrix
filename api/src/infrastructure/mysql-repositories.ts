import { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { Database } from '../shared/infrastructure/mysql';
import { WorkspaceMapper, WorkspaceRow, MemberRow, UserMapper, UserRow } from '../tenancy/infrastructure/mappers';
import { SubscriptionMapper, SubscriptionRow } from '../billing/infrastructure/mappers';
import {
  BookableResourceMapper,
  BookableResourceRow,
  ServiceProcedureMapper,
  ServiceProcedureRow,
} from '../catalog/infrastructure/mappers';
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
import { AuditLogEntry, IAuditLogRepository, IPerfilRepository, IUserRepository, PerfilData } from '../tenancy/application/ports';
import { ISubscriptionRepository } from '../billing/domain/repositories/ISubscriptionRepository';
import { IProcessedWebhookStore } from '../billing/application/ports';
import { IBookableResourceRepository } from '../catalog/domain/repositories/IBookableResourceRepository';
import { IServiceProcedureRepository } from '../catalog/domain/repositories/IServiceProcedureRepository';
import { IBookingRepository } from '../scheduling/domain/repositories/IBookingRepository';
import { IWaitlistRepository } from '../scheduling/domain/repositories/IWaitlistRepository';
import { IWebhookChannelRepository } from '../scheduling/application/ports';
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

export class MySqlUserRepository implements IUserRepository {
  constructor(private readonly db: Database) {}

  async save(u: User): Promise<void> {
    const r = UserMapper.toPersistence(u);
    await this.db.conn().execute(
      `INSERT INTO users (id, email, name, password_hash, reset_token_hash, reset_token_expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         name = VALUES(name),
         password_hash = VALUES(password_hash),
         reset_token_hash = VALUES(reset_token_hash),
         reset_token_expires_at = VALUES(reset_token_expires_at)`,
      [r.id, r.email, r.name, r.password_hash, r.reset_token_hash ?? null, r.reset_token_expires_at ?? null, r.created_at],
    );
  }

  async findById(id: string): Promise<User | null> {
    const [rows] = await this.db.conn().query<(UserRow & RowDataPacket)[]>('SELECT * FROM users WHERE id = ? LIMIT 1', [id]);
    return rows[0] ? UserMapper.toDomain(rows[0]) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const [rows] = await this.db
      .conn()
      .query<(UserRow & RowDataPacket)[]>('SELECT * FROM users WHERE email = ? LIMIT 1', [email]);
    return rows[0] ? UserMapper.toDomain(rows[0]) : null;
  }

  async findByIds(ids: string[]): Promise<User[]> {
    if (ids.length === 0) return [];
    const ph = ids.map(() => '?').join(', ');
    const [rows] = await this.db
      .conn()
      .query<(UserRow & RowDataPacket)[]>(`SELECT * FROM users WHERE id IN (${ph})`, ids);
    return rows.map(UserMapper.toDomain);
  }

  async findByResetTokenHash(tokenHash: string): Promise<User | null> {
    const [rows] = await this.db
      .conn()
      .query<(UserRow & RowDataPacket)[]>('SELECT * FROM users WHERE reset_token_hash = ? LIMIT 1', [tokenHash]);
    return rows[0] ? UserMapper.toDomain(rows[0]) : null;
  }
}

export class MySqlPerfilRepository implements IPerfilRepository {
  constructor(private readonly db: Database) {}

  async findByUsuarioId(usuarioId: string): Promise<PerfilData | null> {
    const [rows] = await this.db.conn().query<(RowDataPacket & { bio: string | null; foto_key: string | null; atualizado_em?: Date })[]>(
      'SELECT bio, foto_key, atualizado_em FROM perfis WHERE usuario_id = ? LIMIT 1',
      [usuarioId],
    );
    if (!rows[0]) return null;
    return {
      usuarioId,
      bio: rows[0].bio || '',
      fotoKey: rows[0].foto_key || null,
      atualizadoEm: rows[0].atualizado_em,
    };
  }

  async save(data: { usuarioId: string; bio: string; fotoKey?: string | null }): Promise<void> {
    if (data.fotoKey !== undefined) {
      await this.db.conn().execute(
        `INSERT INTO perfis (usuario_id, bio, foto_key)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE bio = VALUES(bio), foto_key = VALUES(foto_key)`,
        [data.usuarioId, data.bio, data.fotoKey],
      );
    } else {
      await this.db.conn().execute(
        `INSERT INTO perfis (usuario_id, bio, foto_key)
         VALUES (?, ?, NULL)
         ON DUPLICATE KEY UPDATE bio = VALUES(bio)`,
        [data.usuarioId, data.bio],
      );
    }
  }
}

export class MySqlWorkspaceRepository implements IWorkspaceRepository {
  constructor(private readonly db: Database) {}

  private async loadMembers(workspaceId: string): Promise<MemberRow[]> {
    const [rows] = await this.db
      .conn()
      .query<(MemberRow & RowDataPacket)[]>(
        'SELECT * FROM workspace_members WHERE workspace_id = ? ORDER BY joined_at ASC',
        [workspaceId],
      );
    return rows;
  }

  async save(w: Workspace): Promise<void> {
    const { row, members } = WorkspaceMapper.toPersistence(w);
    const c = this.db.conn();
    await c.execute(
      `INSERT INTO workspaces (id, name, slug, created_at)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name), slug = VALUES(slug)`,
      [row.id, row.name, row.slug, row.created_at],
    );
    await c.execute('DELETE FROM workspace_members WHERE workspace_id = ?', [row.id]);
    for (const m of members) {
      await c.execute(
        `INSERT INTO workspace_members (workspace_id, user_id, role, joined_at)
         VALUES (?, ?, ?, ?)`,
        [m.workspace_id, m.user_id, m.role, m.joined_at],
      );
    }
  }

  async findById(id: string): Promise<Workspace | null> {
    const [rows] = await this.db
      .conn()
      .query<(WorkspaceRow & RowDataPacket)[]>('SELECT * FROM workspaces WHERE id = ? LIMIT 1', [id]);
    const r = rows[0];
    if (!r) return null;
    return WorkspaceMapper.toDomain(r, await this.loadMembers(r.id));
  }

  async findBySlug(slug: string): Promise<Workspace | null> {
    const [rows] = await this.db
      .conn()
      .query<(WorkspaceRow & RowDataPacket)[]>('SELECT * FROM workspaces WHERE slug = ? LIMIT 1', [slug]);
    const r = rows[0];
    if (!r) return null;
    return WorkspaceMapper.toDomain(r, await this.loadMembers(r.id));
  }

  async listByMember(userId: string): Promise<Workspace[]> {
    const [rows] = await this.db.conn().query<(WorkspaceRow & RowDataPacket)[]>(
      `SELECT w.* FROM workspaces w
       INNER JOIN workspace_members m ON m.workspace_id = w.id
       WHERE m.user_id = ?
       ORDER BY w.created_at ASC`,
      [userId],
    );
    const out: Workspace[] = [];
    for (const r of rows) {
      out.push(WorkspaceMapper.toDomain(r, await this.loadMembers(r.id)));
    }
    return out;
  }

  async slugExists(slug: string): Promise<boolean> {
    const [rows] = await this.db
      .conn()
      .query<RowDataPacket[]>('SELECT id FROM workspaces WHERE slug = ? LIMIT 1', [slug]);
    return rows.length > 0;
  }
}

export class MySqlSubscriptionRepository implements ISubscriptionRepository {
  constructor(private readonly db: Database) {}

  async save(s: Subscription): Promise<void> {
    const r = SubscriptionMapper.toPersistence(s);
    await this.db.conn().execute(
      `INSERT INTO subscriptions (
        id, workspace_id, plan, status, trial_ends_at, current_period_end, external_customer_id, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        plan = VALUES(plan),
        status = VALUES(status),
        trial_ends_at = VALUES(trial_ends_at),
        current_period_end = VALUES(current_period_end),
        external_customer_id = VALUES(external_customer_id),
        updated_at = VALUES(updated_at)`,
      [
        r.id,
        r.workspace_id,
        r.plan,
        r.status,
        r.trial_ends_at,
        r.current_period_end,
        r.external_customer_id,
        r.updated_at,
      ],
    );
  }

  async findByTenant(tenantId: string): Promise<Subscription | null> {
    const [rows] = await this.db
      .conn()
      .query<(SubscriptionRow & RowDataPacket)[]>(
        'SELECT * FROM subscriptions WHERE workspace_id = ? LIMIT 1',
        [tenantId],
      );
    return rows[0] ? SubscriptionMapper.toDomain(rows[0]) : null;
  }

  async lockByTenant(tenantId: string): Promise<void> {
    await this.db
      .conn()
      .query<RowDataPacket[]>(
        'SELECT id FROM subscriptions WHERE workspace_id = ? LIMIT 1 FOR UPDATE',
        [tenantId],
      );
  }

  async findByExternalCustomerId(customerId: string): Promise<Subscription | null> {
    const [rows] = await this.db
      .conn()
      .query<(SubscriptionRow & RowDataPacket)[]>(
        'SELECT * FROM subscriptions WHERE external_customer_id = ? LIMIT 1',
        [customerId],
      );
    return rows[0] ? SubscriptionMapper.toDomain(rows[0]) : null;
  }

  async countByPlanAndStatus(): Promise<{ plan: string; status: string; count: number }[]> {
    const [rows] = await this.db
      .conn()
      .query<(RowDataPacket & { plan: string; status: string; count: number })[]>(
        'SELECT plan, status, COUNT(*) AS count FROM subscriptions GROUP BY plan, status',
      );
    return rows.map((r: any) => ({
      plan: r.plan,
      status: r.status,
      count: Number(r.count),
    }));
  }
}

export class MySqlBookableResourceRepository implements IBookableResourceRepository {
  constructor(private readonly db: Database) {}

  async save(resource: BookableResource): Promise<void> {
    const r = BookableResourceMapper.toPersistence(resource);
    await this.db.conn().execute(
      `INSERT INTO bookable_resources (
        id, workspace_id, name, category, status,
        capabilities_json, weekly_windows_json, maintenance_blocks_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        name = VALUES(name),
        category = VALUES(category),
        status = VALUES(status),
        capabilities_json = VALUES(capabilities_json),
        weekly_windows_json = VALUES(weekly_windows_json),
        maintenance_blocks_json = VALUES(maintenance_blocks_json)`,
      [
        r.id,
        r.workspace_id,
        r.name,
        r.category,
        r.status,
        r.capabilities_json,
        r.weekly_windows_json,
        r.maintenance_blocks_json,
        r.created_at,
      ],
    );
  }

  async findById(tenantId: string, id: string): Promise<BookableResource | null> {
    const [rows] = await this.db
      .conn()
      .query<(BookableResourceRow & RowDataPacket)[]>(
        'SELECT * FROM bookable_resources WHERE id = ? AND workspace_id = ? LIMIT 1',
        [id, tenantId],
      );
    return rows[0] ? BookableResourceMapper.toDomain(rows[0]) : null;
  }

  async listByTenant(tenantId: string, opts?: { onlyActive?: boolean; forUpdate?: boolean }): Promise<BookableResource[]> {
    const lock = opts?.forUpdate ? ' FOR UPDATE' : '';
    const sql = opts?.onlyActive
      ? `SELECT * FROM bookable_resources WHERE workspace_id = ? AND status = 'ACTIVE' ORDER BY id ASC${lock}`
      : `SELECT * FROM bookable_resources WHERE workspace_id = ? ORDER BY id ASC${lock}`;
    const [rows] = await this.db.conn().query<(BookableResourceRow & RowDataPacket)[]>(sql, [tenantId]);
    return rows.map(BookableResourceMapper.toDomain);
  }

  async countActiveByTenant(tenantId: string): Promise<number> {
    const [rows] = await this.db
      .conn()
      .query<({ cnt: number } & RowDataPacket)[]>(
        "SELECT COUNT(*) AS cnt FROM bookable_resources WHERE workspace_id = ? AND status = 'ACTIVE'",
        [tenantId],
      );
    return Number(rows[0]?.cnt ?? 0);
  }
}

export class MySqlServiceProcedureRepository implements IServiceProcedureRepository {
  constructor(private readonly db: Database) {}

  async save(p: ServiceProcedure): Promise<void> {
    const r = ServiceProcedureMapper.toPersistence(p);
    await this.db.conn().execute(
      `INSERT INTO service_procedures (
        id, workspace_id, name, duration_minutes,
        price_cents, deposit_cents, currency,
        cancellation_policy_json, requirements_json, active, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        name = VALUES(name),
        duration_minutes = VALUES(duration_minutes),
        price_cents = VALUES(price_cents),
        deposit_cents = VALUES(deposit_cents),
        cancellation_policy_json = VALUES(cancellation_policy_json),
        requirements_json = VALUES(requirements_json),
        active = VALUES(active)`,
      [
        r.id,
        r.workspace_id,
        r.name,
        r.duration_minutes,
        r.price_cents,
        r.deposit_cents,
        r.currency,
        r.cancellation_policy_json,
        r.requirements_json,
        r.active ? 1 : 0,
        r.created_at,
      ],
    );
  }

  async findById(tenantId: string, id: string): Promise<ServiceProcedure | null> {
    const [rows] = await this.db
      .conn()
      .query<(ServiceProcedureRow & RowDataPacket)[]>(
        'SELECT * FROM service_procedures WHERE id = ? AND workspace_id = ? LIMIT 1',
        [id, tenantId],
      );
    return rows[0] ? ServiceProcedureMapper.toDomain(rows[0]) : null;
  }

  async listByTenant(tenantId: string): Promise<ServiceProcedure[]> {
    const [rows] = await this.db
      .conn()
      .query<(ServiceProcedureRow & RowDataPacket)[]>(
        'SELECT * FROM service_procedures WHERE workspace_id = ? ORDER BY created_at ASC',
        [tenantId],
      );
    return rows.map(ServiceProcedureMapper.toDomain);
  }
}

export class MySqlBookingRepository implements IBookingRepository {
  constructor(private readonly db: Database) {}

  private async loadAllocations(bookingIds: string[]): Promise<Map<string, BookingAllocationRow[]>> {
    const map = new Map<string, BookingAllocationRow[]>();
    if (bookingIds.length === 0) return map;
    const ph = bookingIds.map(() => '?').join(', ');
    const [rows] = await this.db
      .conn()
      .query<(BookingAllocationRow & RowDataPacket)[]>(
        `SELECT * FROM booking_resource_allocations WHERE booking_id IN (${ph}) ORDER BY id ASC`,
        bookingIds,
      );
    for (const r of rows) {
      const list = map.get(r.booking_id) ?? [];
      list.push(r);
      map.set(r.booking_id, list);
    }
    return map;
  }

  async save(b: Booking): Promise<void> {
    const { row, allocations } = BookingMapper.toPersistence(b);
    const c = this.db.conn();
    await c.execute(
      `INSERT INTO bookings (
        id, workspace_id, procedure_id, procedure_name,
        client_name, client_email, service_start_at, service_end_at, status,
        price_cents, currency, deposit_cents, deposit_status, deposit_expires_at,
        cancellation_policy_json, retained_cents, refunded_cents, cancellation_reason,
        origin_waitlist_entry_id, version, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        service_start_at = VALUES(service_start_at),
        service_end_at = VALUES(service_end_at),
        status = VALUES(status),
        deposit_status = VALUES(deposit_status),
        deposit_expires_at = VALUES(deposit_expires_at),
        retained_cents = VALUES(retained_cents),
        refunded_cents = VALUES(refunded_cents),
        cancellation_reason = VALUES(cancellation_reason),
        version = VALUES(version),
        updated_at = VALUES(updated_at)`,
      [
        row.id,
        row.workspace_id,
        row.procedure_id,
        row.procedure_name,
        row.client_name,
        row.client_email,
        row.service_start_at,
        row.service_end_at,
        row.status,
        row.price_cents,
        row.currency,
        row.deposit_cents,
        row.deposit_status,
        row.deposit_expires_at,
        row.cancellation_policy_json,
        row.retained_cents,
        row.refunded_cents,
        row.cancellation_reason,
        row.origin_waitlist_entry_id,
        row.version,
        row.created_at,
        row.updated_at,
      ],
    );
    await c.execute('DELETE FROM booking_resource_allocations WHERE booking_id = ?', [row.id]);
    for (const a of allocations) {
      await c.execute(
        `INSERT INTO booking_resource_allocations (
          id, booking_id, workspace_id, resource_id, resource_name, category,
          service_start_at, service_end_at, prep_minutes, cleanup_minutes,
          effective_start_at, effective_end_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          a.id,
          a.booking_id,
          a.workspace_id,
          a.resource_id,
          a.resource_name,
          a.category,
          a.service_start_at,
          a.service_end_at,
          a.prep_minutes,
          a.cleanup_minutes,
          a.effective_start_at,
          a.effective_end_at,
        ],
      );
    }
  }

  async findById(tenantId: string, id: string): Promise<Booking | null> {
    const [rows] = await this.db
      .conn()
      .query<(BookingRow & RowDataPacket)[]>(
        'SELECT * FROM bookings WHERE id = ? AND workspace_id = ? LIMIT 1',
        [id, tenantId],
      );
    const r = rows[0];
    if (!r) return null;
    const allocs = await this.loadAllocations([r.id]);
    return BookingMapper.toDomain(r, allocs.get(r.id) ?? []);
  }

  async listByTenant(tenantId: string, opts?: { status?: string; limit?: number }): Promise<Booking[]> {
    const limit = Math.max(1, Math.min(500, opts?.limit ?? 200));
    const params: unknown[] = [tenantId];
    let sql = 'SELECT * FROM bookings WHERE workspace_id = ?';
    if (opts?.status) {
      sql += ' AND status = ?';
      params.push(opts.status);
    }
    sql += ` ORDER BY service_start_at ASC LIMIT ${limit}`;
    const [rows] = await this.db.conn().query<(BookingRow & RowDataPacket)[]>(sql, params);
    const allocs = await this.loadAllocations(rows.map((r) => r.id));
    return rows.map((r) => BookingMapper.toDomain(r, allocs.get(r.id) ?? []));
  }

  async countByTenantInMonth(tenantId: string, year: number, month1To12: number): Promise<number> {
    const start = new Date(Date.UTC(year, month1To12 - 1, 1, 0, 0, 0));
    const end = new Date(Date.UTC(year, month1To12, 1, 0, 0, 0));
    const [rows] = await this.db.conn().query<({ cnt: number } & RowDataPacket)[]>(
      `SELECT COUNT(*) AS cnt FROM bookings
       WHERE workspace_id = ?
         AND status NOT IN ('CANCELLED', 'EXPIRED')
         AND service_start_at >= ?
         AND service_start_at < ?`,
      [tenantId, start, end],
    );
    return Number(rows[0]?.cnt ?? 0);
  }

  async findActiveResourceHoldsInWindow(
    tenantId: string,
    window: TimeSlot,
    now: Date,
    opts?: { forUpdate?: boolean; excludeBookingId?: string },
  ): Promise<ExistingResourceHold[]> {
    const lock = opts?.forUpdate ? ' FOR UPDATE' : '';
    const params: unknown[] = [tenantId, window.endAt, window.startAt];
    let excludeClause = '';
    if (opts?.excludeBookingId) {
      excludeClause = ' AND b.id <> ?';
      params.push(opts.excludeBookingId);
    }

    const [rows] = await this.db.conn().query<
      (BookingAllocationRow & {
        booking_status: string;
        deposit_expires_at: Date | null;
      } & RowDataPacket)[]
    >(
      `SELECT a.*, b.status AS booking_status, b.deposit_expires_at
       FROM booking_resource_allocations a
       INNER JOIN bookings b ON b.id = a.booking_id
       WHERE a.workspace_id = ?
         AND a.effective_start_at < ?
         AND a.effective_end_at > ?
         AND b.status IN ('PENDING_DEPOSIT', 'CONFIRMED', 'CHECKED_IN')${excludeClause}${lock}`,
      params,
    );

    const holds: ExistingResourceHold[] = [];
    for (const r of rows) {
      if (
        r.booking_status === 'PENDING_DEPOSIT' &&
        r.deposit_expires_at !== null &&
        new Date(r.deposit_expires_at).getTime() <= now.getTime()
      ) {
        continue;
      }
      holds.push({
        resourceId: r.resource_id,
        effectiveOccupiedSlot: TimeSlot.create(new Date(r.effective_start_at), new Date(r.effective_end_at)),
      });
    }
    return holds;
  }

  async findExpiredPendingDepositsSystemWide(now: Date, limit: number): Promise<Booking[]> {
    const safeLimit = Math.max(1, Math.min(200, Math.floor(limit)));
    const [rows] = await this.db.conn().query<(BookingRow & RowDataPacket)[]>(
      `SELECT * FROM bookings
       WHERE status = 'PENDING_DEPOSIT'
         AND deposit_expires_at IS NOT NULL
         AND deposit_expires_at <= ?
       LIMIT ${safeLimit}`,
      [now],
    );
    const allocs = await this.loadAllocations(rows.map((r) => r.id));
    return rows.map((r) => BookingMapper.toDomain(r, allocs.get(r.id) ?? []));
  }
}

export class MySqlWaitlistRepository implements IWaitlistRepository {
  constructor(private readonly db: Database) {}

  async save(e: WaitlistEntry): Promise<void> {
    const r = WaitlistEntryMapper.toPersistence(e);
    await this.db.conn().execute(
      `INSERT INTO waitlist_entries (
        id, workspace_id, procedure_id, client_name, client_email,
        desired_start_at, desired_end_at, priority, status,
        offered_start_at, offered_end_at, reserved_resource_ids_json,
        offered_at, offer_expires_at, claimed_booking_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        priority = VALUES(priority),
        status = VALUES(status),
        offered_start_at = VALUES(offered_start_at),
        offered_end_at = VALUES(offered_end_at),
        reserved_resource_ids_json = VALUES(reserved_resource_ids_json),
        offered_at = VALUES(offered_at),
        offer_expires_at = VALUES(offer_expires_at),
        claimed_booking_id = VALUES(claimed_booking_id),
        updated_at = VALUES(updated_at)`,
      [
        r.id,
        r.workspace_id,
        r.procedure_id,
        r.client_name,
        r.client_email,
        r.desired_start_at,
        r.desired_end_at,
        r.priority,
        r.status,
        r.offered_start_at,
        r.offered_end_at,
        r.reserved_resource_ids_json,
        r.offered_at,
        r.offer_expires_at,
        r.claimed_booking_id,
        r.created_at,
        r.updated_at,
      ],
    );
  }

  async findById(tenantId: string, id: string, opts?: { forUpdate?: boolean }): Promise<WaitlistEntry | null> {
    const lock = opts?.forUpdate ? ' FOR UPDATE' : '';
    const [rows] = await this.db
      .conn()
      .query<(WaitlistEntryRow & RowDataPacket)[]>(
        `SELECT * FROM waitlist_entries WHERE id = ? AND workspace_id = ? LIMIT 1${lock}`,
        [id, tenantId],
      );
    return rows[0] ? WaitlistEntryMapper.toDomain(rows[0]) : null;
  }

  async listByTenant(tenantId: string): Promise<WaitlistEntry[]> {
    const [rows] = await this.db
      .conn()
      .query<(WaitlistEntryRow & RowDataPacket)[]>(
        'SELECT * FROM waitlist_entries WHERE workspace_id = ? ORDER BY created_at ASC',
        [tenantId],
      );
    return rows.map(WaitlistEntryMapper.toDomain);
  }

  async listWaitingByProcedureOrdered(tenantId: string, procedureId: string): Promise<WaitlistEntry[]> {
    const [rows] = await this.db.conn().query<(WaitlistEntryRow & RowDataPacket)[]>(
      `SELECT * FROM waitlist_entries
       WHERE workspace_id = ? AND procedure_id = ? AND status = 'WAITING'
       ORDER BY CASE WHEN priority = 'VIP' THEN 0 ELSE 1 END ASC, created_at ASC`,
      [tenantId, procedureId],
    );
    return rows.map(WaitlistEntryMapper.toDomain);
  }

  async listActiveOffersByTenant(tenantId: string, now: Date, opts?: { forUpdate?: boolean }): Promise<WaitlistEntry[]> {
    const lock = opts?.forUpdate ? ' FOR UPDATE' : '';
    const [rows] = await this.db.conn().query<(WaitlistEntryRow & RowDataPacket)[]>(
      `SELECT * FROM waitlist_entries
       WHERE workspace_id = ? AND status = 'OFFERED' AND offer_expires_at IS NOT NULL AND offer_expires_at > ?${lock}`,
      [tenantId, now],
    );
    return rows.map(WaitlistEntryMapper.toDomain);
  }

  async findExpiredOffersSystemWide(now: Date, limit: number): Promise<WaitlistEntry[]> {
    const safeLimit = Math.max(1, Math.min(200, Math.floor(limit)));
    const [rows] = await this.db.conn().query<(WaitlistEntryRow & RowDataPacket)[]>(
      `SELECT * FROM waitlist_entries
       WHERE status = 'OFFERED' AND offer_expires_at IS NOT NULL AND offer_expires_at <= ?
       LIMIT ${safeLimit}`,
      [now],
    );
    return rows.map(WaitlistEntryMapper.toDomain);
  }
}

export class MySqlWebhookChannelRepository implements IWebhookChannelRepository {
  constructor(private readonly db: Database) {}

  async save(c: WebhookChannel): Promise<void> {
    const r = WebhookChannelMapper.toPersistence(c);
    await this.db.conn().execute(
      `INSERT INTO webhook_channels (id, workspace_id, name, url, secret, enabled, last_delivered_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         name = VALUES(name),
         url = VALUES(url),
         secret = VALUES(secret),
         enabled = VALUES(enabled),
         last_delivered_at = VALUES(last_delivered_at)`,
      [r.id, r.workspace_id, r.name, r.url, r.secret, r.enabled ? 1 : 0, r.last_delivered_at],
    );
  }

  async listByTenant(tenantId: string): Promise<WebhookChannel[]> {
    const [rows] = await this.db
      .conn()
      .query<(WebhookChannelRow & RowDataPacket)[]>(
        'SELECT * FROM webhook_channels WHERE workspace_id = ?',
        [tenantId],
      );
    return rows.map(WebhookChannelMapper.toDomain);
  }
}

export class MySqlAuditLogRepository implements IAuditLogRepository {
  constructor(private readonly db: Database) {}

  async append(e: AuditLogEntry): Promise<void> {
    await this.db.conn().execute(
      `INSERT INTO audit_logs (id, workspace_id, actor_id, action, resource_id, metadata_json, occurred_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [e.id, e.tenantId, e.actorId, e.action, e.resourceId, JSON.stringify(e.metadata), e.occurredAt],
    );
  }

  async listByTenant(tenantId: string, limit: number): Promise<AuditLogEntry[]> {
    const safeLimit = Math.max(1, Math.min(5000, Math.floor(limit)));
    const [rows] = await this.db.conn().query<
      ({
        id: string;
        workspace_id: string;
        actor_id: string | null;
        action: string;
        resource_id: string | null;
        metadata_json: string | Record<string, unknown>;
        occurred_at: Date;
      } & RowDataPacket)[]
    >(
      `SELECT * FROM audit_logs WHERE workspace_id = ? ORDER BY occurred_at DESC LIMIT ${safeLimit}`,
      [tenantId],
    );
    return rows.map((r) => ({
      id: r.id,
      tenantId: r.workspace_id,
      actorId: r.actor_id,
      action: r.action,
      resourceId: r.resource_id,
      metadata: typeof r.metadata_json === 'string' ? JSON.parse(r.metadata_json) : r.metadata_json,
      occurredAt: new Date(r.occurred_at),
    }));
  }
}

export class MySqlProcessedWebhookStore implements IProcessedWebhookStore {
  constructor(private readonly db: Database) {}

  async registerIfNew(externalEventId: string, rawPayload?: unknown): Promise<boolean> {
    const [res] = await this.db.conn().execute<ResultSetHeader>(
      `INSERT IGNORE INTO billing_webhook_events (external_event_id, payload_json, processed_at)
       VALUES (?, ?, ?)`,
      [externalEventId, rawPayload ? JSON.stringify(rawPayload) : null, new Date()],
    );
    return res.affectedRows > 0;
  }
}
