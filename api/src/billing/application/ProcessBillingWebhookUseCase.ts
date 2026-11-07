import { Clock, DomainEventDispatcher, UnitOfWork } from '../../shared/application/ports';
import { NotFoundError } from '../../shared/domain/errors';
import { ISubscriptionRepository } from '../domain/repositories/ISubscriptionRepository';
import { BillingCommand, IProcessedWebhookStore } from './ports';

export class ProcessBillingWebhookUseCase {
  constructor(
    private readonly d: {
      uow: UnitOfWork;
      dispatcher: DomainEventDispatcher;
      clock: Clock;
      subscriptions: ISubscriptionRepository;
      processed: IProcessedWebhookStore;
    },
  ) {}

  async execute(input: { command: BillingCommand; rawPayload: unknown }): Promise<{ status: 'processed' | 'duplicate' }> {
    const { command } = input;
    const now = this.d.clock.now();
    const outcome = await this.d.uow.run(async () => {
      const isNew = await this.d.processed.registerIfNew(command.externalEventId, input.rawPayload, now);
      if (!isNew) return { duplicate: true as const, events: [] };
      let sub = command.tenantId ? await this.d.subscriptions.findByTenant(command.tenantId) : null;
      if (!sub && command.externalCustomerId) {
        sub = await this.d.subscriptions.findByExternalCustomerId(command.externalCustomerId);
      }
      if (!sub) throw new NotFoundError('Subscription not found for workspace');
      switch (command.type) {
        case 'ACTIVATE_PLAN':
          sub.activate(now, { plan: command.plan, externalCustomerId: command.externalCustomerId, currentPeriodEnd: command.periodEnd });
          break;
        case 'MARK_PAST_DUE':
          sub.markPastDue(now);
          break;
        case 'CANCEL_SUBSCRIPTION':
          sub.cancel(now);
          break;
      }
      await this.d.subscriptions.save(sub);
      return { duplicate: false as const, events: sub.pullDomainEvents() };
    });
    if (outcome.duplicate) return { status: 'duplicate' };
    await this.d.dispatcher.dispatch(outcome.events);
    return { status: 'processed' };
  }
}
