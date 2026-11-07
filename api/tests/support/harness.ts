import { buildContainer, Container } from '../../src/composition-root';
import {
  buildInMemoryInfrastructure,
  InMemoryInfrastructure,
  MutableClock,
  RecordingNotificationGateway,
} from '../../src/infrastructure/in-memory';
import { signBillingPayload } from '../../src/billing/infrastructure/BillingWebhookAcl';

export const BILLING_SECRET = 'test-slotmatrix-billing-secret';

export interface Harness {
  infra: InMemoryInfrastructure;
  c: Container;
  clock: MutableClock;
  notifications: RecordingNotificationGateway;
}

export function makeHarness(): Harness {
  const clock = new MutableClock(new Date('2026-06-01T10:00:00Z'));
  const infra = buildInMemoryInfrastructure({ clock });
  const c = buildContainer(infra, { billingWebhookSecret: BILLING_SECRET });
  return { infra, c, clock, notifications: infra.notifications };
}

let seq = 0;
export async function registerTenant(h: Harness, name = `Clinic ${++seq}`) {
  const email = `owner${seq}-${Math.random().toString(36).slice(2, 6)}@slotmatrix.test`;
  const r = await h.c.tenancy.register.execute({ email, name: 'Clinic Owner', password: 'Passw0rd!', workspaceName: name });
  return { ...r, email };
}

export function billingEvent(id: string, type: string, tenantId: string, extra: { plan?: string } = {}) {
  const body = JSON.stringify({
    id,
    type,
    data: {
      object: {
        customer: 'cus_sm_123',
        metadata: { workspace_id: tenantId, ...(extra.plan ? { plan: extra.plan } : {}) },
      },
    },
  });
  return { body, signature: signBillingPayload(body, BILLING_SECRET) };
}

export async function upgradeTenant(h: Harness, tenantId: string, plan: 'PRO' | 'ENTERPRISE' = 'PRO') {
  const ev = billingEvent(`evt_${Math.random().toString(36).slice(2, 8)}`, 'checkout.session.completed', tenantId, { plan });
  const cmd = h.c.acl.translate(JSON.parse(ev.body))!;
  await h.c.billing.processWebhook.execute({ command: cmd, rawPayload: ev });
}
