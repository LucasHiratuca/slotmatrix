import { DomainEvent } from '../domain/DomainEvent';
import { DomainEventDispatcher, EventHandler } from './ports';

export class InProcessEventDispatcher implements DomainEventDispatcher {
  private handlers = new Map<string, EventHandler<any>[]>();

  constructor(private readonly onError: (err: unknown, event: DomainEvent) => void = (e, ev) => console.error(`[event:${ev.name}] handler failed`, e)) {}

  register(eventName: string, handler: EventHandler<any>): void {
    const list = this.handlers.get(eventName) ?? [];
    list.push(handler);
    this.handlers.set(eventName, list);
  }

  async dispatch(events: DomainEvent[]): Promise<void> {
    const queue = [...events];
    while (queue.length) {
      const ev = queue.shift()!;
      for (const h of this.handlers.get(ev.name) ?? []) {
        try {
          await h.handle(ev);
        } catch (err) {
          this.onError(err, ev);
        }
      }
    }
  }
}
