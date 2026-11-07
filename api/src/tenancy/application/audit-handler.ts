import { randomUUID } from 'node:crypto';
import { DomainEvent } from '../../shared/domain/DomainEvent';
import { EventHandler } from '../../shared/application/ports';
import { IAuditLogRepository } from './ports';

export class OnDomainEventAuditHandler implements EventHandler<DomainEvent> {
  constructor(private readonly d: { audit: IAuditLogRepository }) {}

  async handle(e: DomainEvent): Promise<void> {
    const { name, tenantId, aggregateId, occurredAt, actorId, ...rest } = e as unknown as Record<string, unknown>;
    await this.d.audit.append({
      id: randomUUID(),
      tenantId: tenantId as string,
      actorId: typeof actorId === 'string' ? actorId : null,
      action: name as string,
      resourceId: aggregateId as string,
      metadata: JSON.parse(JSON.stringify(rest)),
      occurredAt: occurredAt as Date,
    });
  }
}

export const AUDITED_EVENTS = [
  'WorkspaceCreated',
  'MemberInvited',
  'MemberRoleChanged',
  'MemberRemoved',
  'SubscriptionPlanChanged',
  'SubscriptionStatusChanged',
  'BookableResourceCreated',
  'BookingScheduled',
  'BookingDepositConfirmed',
  'BookingCancelled',
  'NoShowRecorded',
  'WaitlistSlotOffered',
  'WaitlistOfferClaimed',
  'WaitlistOfferExpired',
];
