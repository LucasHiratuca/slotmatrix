import { AggregateRoot } from '../../../shared/domain/AggregateRoot';
import { TenantId } from '../../../shared/domain/UniqueEntityId';
import { ConflictError, LastOwnerRemovalError, NotFoundError, ValidationError } from '../../../shared/domain/errors';
import { WorkspaceSlug } from '../value-objects/WorkspaceSlug';
import {
  MemberInvitedDomainEvent,
  MemberRemovedDomainEvent,
  MemberRoleChangedDomainEvent,
  Role,
  WorkspaceCreatedDomainEvent,
} from '../events/tenancy-events';

export const ROLES: Role[] = ['OWNER', 'ADMIN', 'COORDINATOR', 'SPECIALIST'];

export interface Member {
  readonly userId: string;
  readonly role: Role;
  readonly joinedAt: Date;
}

export interface WorkspaceProps {
  name: string;
  slug: WorkspaceSlug;
  members: Member[];
  createdAt: Date;
}

export class Workspace extends AggregateRoot<WorkspaceProps, TenantId> {
  private constructor(props: WorkspaceProps, id: TenantId) {
    super(props, id);
  }

  static create(input: { name: string; slug?: WorkspaceSlug; ownerId: string; now: Date }, id = TenantId.generate()): Workspace {
    if (!input.name || input.name.trim().length < 2 || input.name.length > 80) {
      throw new ValidationError('Workspace name must have 2-80 chars');
    }
    const ws = new Workspace(
      {
        name: input.name.trim(),
        slug: input.slug ?? WorkspaceSlug.fromName(input.name),
        members: [{ userId: input.ownerId, role: 'OWNER', joinedAt: input.now }],
        createdAt: input.now,
      },
      id,
    );
    ws.addDomainEvent(new WorkspaceCreatedDomainEvent(id.value, id.value, ws.props.name, input.ownerId, input.now));
    return ws;
  }

  static reconstitute(props: WorkspaceProps, id: TenantId): Workspace {
    return new Workspace(props, id);
  }

  get name(): string { return this.props.name; }
  get slug(): WorkspaceSlug { return this.props.slug; }
  get createdAt(): Date { return this.props.createdAt; }
  get members(): ReadonlyArray<Member> { return [...this.props.members]; }

  roleOf(userId: string): Role | null {
    return this.props.members.find((m) => m.userId === userId)?.role ?? null;
  }

  addMember(actorId: string, userId: string, role: Role, now: Date): void {
    this.assertRole(role);
    if (this.roleOf(userId)) throw new ConflictError('User is already a member of this workspace');
    this.props.members.push({ userId, role, joinedAt: now });
    this.addDomainEvent(new MemberInvitedDomainEvent(this.id.value, this.id.value, actorId, userId, role, now));
  }

  changeMemberRole(actorId: string, userId: string, newRole: Role, now: Date): void {
    this.assertRole(newRole);
    const idx = this.props.members.findIndex((m) => m.userId === userId);
    if (idx < 0) throw new NotFoundError('Member not found in this workspace');
    const current = this.props.members[idx];
    if (current.role === newRole) return;
    if (current.role === 'OWNER' && newRole !== 'OWNER' && this.ownerCount() <= 1) {
      throw new LastOwnerRemovalError('A workspace must keep at least one OWNER');
    }
    this.props.members[idx] = { ...current, role: newRole };
    this.addDomainEvent(new MemberRoleChangedDomainEvent(this.id.value, this.id.value, actorId, userId, current.role, newRole, now));
  }

  removeMember(actorId: string, userId: string, now: Date): void {
    const current = this.props.members.find((m) => m.userId === userId);
    if (!current) throw new NotFoundError('Member not found in this workspace');
    if (current.role === 'OWNER' && this.ownerCount() <= 1) {
      throw new LastOwnerRemovalError('The last OWNER cannot be removed from the workspace');
    }
    this.props.members = this.props.members.filter((m) => m.userId !== userId);
    this.addDomainEvent(new MemberRemovedDomainEvent(this.id.value, this.id.value, actorId, userId, now));
  }

  private ownerCount(): number {
    return this.props.members.filter((m) => m.role === 'OWNER').length;
  }
  private assertRole(role: Role) {
    if (!ROLES.includes(role)) throw new ValidationError(`Invalid role: ${role}`);
  }
}
