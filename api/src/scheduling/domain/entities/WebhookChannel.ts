import { Entity } from '../../../shared/domain/Entity';
import { TenantId, UniqueEntityId } from '../../../shared/domain/UniqueEntityId';
import { ValidationError } from '../../../shared/domain/errors';
import { SafeWebhookUrl } from '../../../shared/domain/SafeWebhookUrl';

export interface WebhookChannelProps {
  tenantId: TenantId;
  name: string;
  url: SafeWebhookUrl;
  secret: string;
  enabled: boolean;
  lastDeliveredAt: Date | null;
}

export class WebhookChannel extends Entity<WebhookChannelProps> {
  private constructor(props: WebhookChannelProps, id: UniqueEntityId) {
    super(props, id);
  }

  static create(
    input: { tenantId: TenantId; name: string; url: SafeWebhookUrl; secret: string },
    id = UniqueEntityId.generate(),
  ): WebhookChannel {
    if (!input.name || input.name.trim().length < 2) throw new ValidationError('WebhookChannel name is required');
    if (!input.secret || input.secret.length < 8) throw new ValidationError('WebhookChannel secret must have at least 8 chars');
    return new WebhookChannel(
      { tenantId: input.tenantId, name: input.name.trim(), url: input.url, secret: input.secret, enabled: true, lastDeliveredAt: null },
      id,
    );
  }

  static reconstitute(props: WebhookChannelProps, id: UniqueEntityId): WebhookChannel {
    return new WebhookChannel(props, id);
  }

  get tenantId(): TenantId { return this.props.tenantId; }
  get name(): string { return this.props.name; }
  get url(): SafeWebhookUrl { return this.props.url; }
  get secret(): string { return this.props.secret; }
  get enabled(): boolean { return this.props.enabled; }
  get lastDeliveredAt(): Date | null { return this.props.lastDeliveredAt; }

  markDelivered(now: Date): void {
    this.props.lastDeliveredAt = now;
  }
}
