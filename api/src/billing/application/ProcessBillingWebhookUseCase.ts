import { Clock, DomainEventDispatcher, UnitOfWork } from '../../shared/application/ports';
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

  async execute(input: {
    command: BillingCommand;
    rawPayload: unknown;
  }): Promise<{ status: 'processed' | 'duplicate' | 'ignored'; reason?: string }> {
    const { command } = input;
    const now = this.d.clock.now();

    const outcome = await this.d.uow.run(async () => {
      // 1. Idempotência por externalEventId
      const isNew = await this.d.processed.registerIfNew(command.externalEventId, input.rawPayload, now);
      if (!isNew) {
        console.log(`[Billing Webhook] Evento duplicado ignorado: ${command.externalEventId}`);
        return { duplicate: true as const, events: [] };
      }

      // 2. Busca subscription da clínica (por tenantId ou por externalCustomerId)
      let sub = command.tenantId ? await this.d.subscriptions.findByTenant(command.tenantId) : null;
      if (!sub && command.externalCustomerId) {
        sub = await this.d.subscriptions.findByExternalCustomerId(command.externalCustomerId);
      }

      // Se a clínica não for encontrada (ex: stripe trigger ou customer inexistente), ignora com log e 2xx
      if (!sub) {
        console.warn(
          `[Billing Webhook] Clínica não encontrada para evento ${command.externalEventId} (tenantId: '${command.tenantId}', customer: '${command.externalCustomerId}'). Ignorado com sucesso.`,
        );
        return { ignored: true as const, events: [] };
      }

      // 3. Ordem e repetição: se o evento traz timestamp anterior ao último update, verifica para não regredir
      if (command.eventCreatedAt && sub.updatedAt && command.eventCreatedAt < sub.updatedAt) {
        console.warn(
          `[Billing Webhook] Evento fora de ordem detectado (${command.externalEventId}, criado em ${command.eventCreatedAt.toISOString()} < atualizado em ${sub.updatedAt.toISOString()}). Ignorando regressão.`,
        );
        return { ignored: true as const, events: [] };
      }

      // 4. Aplica a transição de estado da assinatura
      switch (command.type) {
        case 'ACTIVATE_PLAN':
          sub.activate(now, {
            plan: command.plan,
            externalCustomerId: command.externalCustomerId,
            currentPeriodEnd: command.periodEnd,
          });
          break;

        case 'MARK_PAST_DUE':
          sub.markPastDue(now);
          break;

        case 'CLEAR_PAST_DUE':
          if (sub.status === 'PAST_DUE') {
            sub.activate(now, {
              externalCustomerId: command.externalCustomerId,
            });
          }
          break;

        case 'CANCEL_SUBSCRIPTION':
          sub.cancel(now);
          break;
      }

      await this.d.subscriptions.save(sub);
      return { duplicate: false as const, ignored: false as const, events: sub.pullDomainEvents() };
    });

    if (outcome.duplicate) return { status: 'duplicate' };
    if ('ignored' in outcome && outcome.ignored) return { status: 'ignored' };

    await this.d.dispatcher.dispatch(outcome.events);
    return { status: 'processed' };
  }
}
