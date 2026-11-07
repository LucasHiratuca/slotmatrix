import { createHmac } from 'node:crypto';
import { WebhookChannel } from '../domain/entities/WebhookChannel';
import { INotificationGateway, SlotMatrixNotificationPayload } from '../application/ports';
import { assertPublicHostname } from '../../shared/infrastructure/ssrf';

export const SIGNATURE_HEADER = 'X-SlotMatrix-Signature';
export const TIMESTAMP_HEADER = 'X-SlotMatrix-Timestamp';

export function signWebhook(secret: string, timestamp: string, body: string): string {
  return 'sha256=' + createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

export class WebhookNotificationGateway implements INotificationGateway {
  constructor(private readonly opts: { allowPrivateTargets?: boolean; timeoutMs?: number } = {}) {}

  async send(channel: WebhookChannel, payload: SlotMatrixNotificationPayload): Promise<void> {
    const url = new URL(channel.url.value);
    if (!this.opts.allowPrivateTargets) await assertPublicHostname(url.hostname);
    const body = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.opts.timeoutMs ?? 5000);
    try {
      const res = await fetch(url, {
        method: 'POST',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'content-type': 'application/json',
          'user-agent': 'SlotMatrix-Webhooks/1.0',
          [TIMESTAMP_HEADER]: timestamp,
          [SIGNATURE_HEADER]: signWebhook(channel.secret, timestamp, body),
        },
        body,
      });
      await res.body?.cancel().catch(() => undefined);
      if (res.status >= 400) throw new Error(`Webhook responded ${res.status}`);
    } finally {
      clearTimeout(timer);
    }
  }
}
