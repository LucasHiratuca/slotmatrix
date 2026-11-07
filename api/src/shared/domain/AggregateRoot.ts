import { DomainEvent } from './DomainEvent';
import { Entity } from './Entity';
import { UniqueEntityId } from './UniqueEntityId';

export abstract class AggregateRoot<TProps extends object, TId extends UniqueEntityId = UniqueEntityId> extends Entity<TProps, TId> {
  private _domainEvents: DomainEvent[] = [];

  protected addDomainEvent(event: DomainEvent): void {
    this._domainEvents.push(event);
  }

  pullDomainEvents(): DomainEvent[] {
    const events = this._domainEvents;
    this._domainEvents = [];
    return events;
  }
}
