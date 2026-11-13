import { User } from '../domain/entities/User';

export interface IUserRepository {
  save(user: User): Promise<void>;
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  findByIds(ids: string[]): Promise<User[]>;
  findByResetTokenHash(tokenHash: string): Promise<User | null>;
}

export interface PasswordResetEmailPayload {
  toEmail: string;
  userName: string;
  resetToken: string;
  resetUrl: string;
  expiresAt: Date;
}

export interface IEmailGateway {
  sendPasswordResetEmail(payload: PasswordResetEmailPayload): Promise<{ delivered: boolean; error?: string } | void>;
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

export interface PerfilData {
  usuarioId: string;
  bio: string;
  fotoKey: string | null;
  atualizadoEm?: Date;
}

export interface IPerfilRepository {
  findByUsuarioId(usuarioId: string): Promise<PerfilData | null>;
  save(data: { usuarioId: string; bio: string; fotoKey?: string | null }): Promise<void>;
}
