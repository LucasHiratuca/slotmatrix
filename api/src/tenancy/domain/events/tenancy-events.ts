import { DomainEvent } from '../../../shared/domain/DomainEvent';

export type Role = 'OWNER' | 'ADMIN' | 'COORDINATOR' | 'SPECIALIST';

export class WorkspaceCreatedDomainEvent implements DomainEvent {
  readonly name = 'WorkspaceCreated';
  constructor(
    readonly tenantId: string,
    readonly aggregateId: string,
    readonly workspaceName: string,
    readonly ownerId: string,
    readonly occurredAt: Date,
  ) {}
}

export class MemberInvitedDomainEvent implements DomainEvent {
  readonly name = 'MemberInvited';
  constructor(
    readonly tenantId: string,
    readonly aggregateId: string,
    readonly actorId: string,
    readonly userId: string,
    readonly role: Role,
    readonly occurredAt: Date,
  ) {}
}

export class MemberRoleChangedDomainEvent implements DomainEvent {
  readonly name = 'MemberRoleChanged';
  constructor(
    readonly tenantId: string,
    readonly aggregateId: string,
    readonly actorId: string,
    readonly userId: string,
    readonly from: Role,
    readonly to: Role,
    readonly occurredAt: Date,
  ) {}
}

export class MemberRemovedDomainEvent implements DomainEvent {
  readonly name = 'MemberRemoved';
  constructor(
    readonly tenantId: string,
    readonly aggregateId: string,
    readonly actorId: string,
    readonly userId: string,
    readonly occurredAt: Date,
  ) {}
}
