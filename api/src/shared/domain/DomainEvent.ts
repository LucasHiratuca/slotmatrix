export interface DomainEvent {
  readonly name: string;
  readonly occurredAt: Date;
  readonly tenantId: string;
  readonly aggregateId: string;
}
