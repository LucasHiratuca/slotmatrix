import { User } from '../domain/entities/User';

export interface IUserRepository {
  save(user: User): Promise<void>;
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  findByIds(ids: string[]): Promise<User[]>;
}

export interface AuditLogEntry {
  readonly id: string;
  readonly tenantId: string;
  readonly actorId: string | null;
  readonly action: string;
  readonly resourceId: string | null;
  readonly metadata: Record<string, unknown>;
  readonly occurredAt: Date;
}

export interface IAuditLogRepository {
  append(entry: AuditLogEntry): Promise<void>;
  listByTenant(tenantId: string, limit: number): Promise<AuditLogEntry[]>;
}
