import { ValueObject } from './ValueObject';
import { UnsafeWebhookUrlError, ValidationError } from './errors';

const BLOCKED_HOSTNAMES = new Set(['localhost', 'metadata.google.internal', 'metadata', 'instance-data']);
const BLOCKED_SUFFIXES = ['.localhost', '.local', '.internal', '.localdomain', '.home.arpa'];

function ipv4ToParts(host: string): number[] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  return parts.every((p) => p >= 0 && p <= 255) ? parts : null;
}

export function isPrivateIPv4(parts: number[]): boolean {
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 192 && b === 0 && parts[2] === 0) ||
    a >= 224
  );
}

export function isPrivateIPv6(host: string): boolean {
  const h = host.toLowerCase();
  if (h === '::' || h === '::1') return true;
  if (h.startsWith('fc') || h.startsWith('fd')) return true;
  if (/^fe[89ab]/.test(h)) return true;
  const mapped = /^::ffff:(.+)$/.exec(h);
  if (mapped) {
    const v4 = ipv4ToParts(mapped[1]);
    if (v4) return isPrivateIPv4(v4);
    return true;
  }
  return false;
}

export function isInternalHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (BLOCKED_HOSTNAMES.has(host)) return true;
  if (BLOCKED_SUFFIXES.some((s) => host.endsWith(s))) return true;
  const v4 = ipv4ToParts(host);
  if (v4) return isPrivateIPv4(v4);
  if (host.includes(':')) return isPrivateIPv6(host);
  return false;
}

/** Value Object anti-SSRF para destinos de Webhook de notificações do SlotMatrix. */
export class SafeWebhookUrl extends ValueObject<{ value: string }> {
  private constructor(value: string) {
    super({ value });
  }

  static create(raw: string): SafeWebhookUrl {
    if (typeof raw !== 'string' || raw.trim() === '') throw new ValidationError('Webhook URL is required');
    let url: URL;
    try {
      url = new URL(raw.trim());
    } catch {
      throw new ValidationError(`Invalid Webhook URL: ${raw}`);
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new UnsafeWebhookUrlError('Webhook URL must use http or https protocol');
    }
    if (url.username || url.password) {
      throw new UnsafeWebhookUrlError('Webhook URL must not embed credentials');
    }
    if (isInternalHost(url.hostname)) {
      throw new UnsafeWebhookUrlError(`Webhook URL points to a blocked internal address: ${url.hostname}`);
    }
    return new SafeWebhookUrl(url.toString());
  }

  static reconstitute(raw: string): SafeWebhookUrl {
    return new SafeWebhookUrl(raw);
  }

  get value(): string {
    return this.props.value;
  }
  get hostname(): string {
    return new URL(this.props.value).hostname;
  }
  toString(): string {
    return this.props.value;
  }
}
