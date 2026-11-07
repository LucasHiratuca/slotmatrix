import { WebhookChannel } from '../domain/entities/WebhookChannel';

export interface IWebhookChannelRepository {
  save(channel: WebhookChannel): Promise<void>;
  listByTenant(tenantId: string): Promise<WebhookChannel[]>;
}

export interface SlotMatrixNotificationPayload {
  type: 'waitlist.slot_offered' | 'booking.confirmed' | 'booking.cancelled';
  tenantId: string;
  referenceId: string;
  procedureId: string;
  clientName: string;
  clientEmail: string;
  slotStartAt: string;
  slotEndAt: string;
  offerExpiresAt?: string;
  claimUrl?: string;
  message: string;
  occurredAt: string;
}

export interface INotificationGateway {
  send(channel: WebhookChannel, payload: SlotMatrixNotificationPayload): Promise<void>;
}
