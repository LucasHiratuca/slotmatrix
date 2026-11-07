import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { isInternalHost } from '../domain/SafeWebhookUrl';

/** Defesa em profundidade contra SSRF/DNS-rebinding em destinos de webhook. */
export async function assertPublicHostname(hostname: string): Promise<void> {
  const host = hostname.replace(/^\[|\]$/g, '');
  if (isInternalHost(host)) throw new Error(`Blocked internal host: ${host}`);
  if (isIP(host)) return;
  const addrs = await lookup(host, { all: true });
  for (const a of addrs) {
    if (isInternalHost(a.address)) throw new Error(`Blocked: ${host} resolves to internal address ${a.address}`);
  }
}
