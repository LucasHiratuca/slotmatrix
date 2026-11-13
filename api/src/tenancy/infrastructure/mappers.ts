import { Workspace, Member } from '../domain/aggregates/Workspace';
import { User } from '../domain/entities/User';
import { WorkspaceSlug } from '../domain/value-objects/WorkspaceSlug';
import { Role } from '../domain/events/tenancy-events';
import { TenantId, UniqueEntityId } from '../../shared/domain/UniqueEntityId';

export interface WorkspaceRow {
  id: string;
  name: string;
  slug: string;
  created_at: Date;
}
export interface MemberRow {
  workspace_id: string;
  user_id: string;
  role: Role;
  joined_at: Date;
}

export const WorkspaceMapper = {
  toDomain(r: WorkspaceRow, members: MemberRow[]): Workspace {
    const ms: Member[] = members.map((m) => ({ userId: m.user_id, role: m.role, joinedAt: m.joined_at }));
    return Workspace.reconstitute(
      { name: r.name, slug: WorkspaceSlug.create(r.slug), members: ms, createdAt: r.created_at },
      TenantId.from(r.id),
    );
  },
  toPersistence(w: Workspace): { row: WorkspaceRow; members: MemberRow[] } {
    return {
      row: { id: w.id.value, name: w.name, slug: w.slug.value, created_at: w.createdAt },
      members: w.members.map((m) => ({ workspace_id: w.id.value, user_id: m.userId, role: m.role, joined_at: m.joinedAt })),
    };
  },
};

export interface UserRow {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  reset_token_hash?: string | null;
  reset_token_expires_at?: Date | null;
  created_at: Date;
}

export const UserMapper = {
  toDomain(r: UserRow): User {
    return User.reconstitute(
      {
        email: r.email,
        name: r.name,
        passwordHash: r.password_hash,
        resetTokenHash: r.reset_token_hash ?? null,
        resetTokenExpiresAt: r.reset_token_expires_at ? new Date(r.reset_token_expires_at) : null,
        createdAt: r.created_at,
      },
      UniqueEntityId.from(r.id),
    );
  },
  toPersistence(u: User): UserRow {
    return {
      id: u.id.value,
      email: u.email,
      name: u.name,
      password_hash: u.passwordHash,
      reset_token_hash: u.resetTokenHash ?? null,
      reset_token_expires_at: u.resetTokenExpiresAt ?? null,
      created_at: u.createdAt,
    };
  },
};
