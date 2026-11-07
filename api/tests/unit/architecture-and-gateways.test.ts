import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as http from 'node:http';
import * as crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { WebhookNotificationGateway } from '../../src/scheduling/infrastructure/WebhookNotificationGateway';
import { WebhookChannel } from '../../src/scheduling/domain/entities/WebhookChannel';
import { SafeWebhookUrl } from '../../src/shared/domain/SafeWebhookUrl';
import { TenantId } from '../../src/shared/domain/UniqueEntityId';

async function collectTsFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectTsFiles(fullPath)));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

describe('Clean Architecture, Context Mapping & Zero PulseGuard Residue Fitness Functions', () => {
  const srcRoot = path.resolve(__dirname, '../../src');

  it('ensures no **/domain/** file imports application, infrastructure, presentation, frameworks, or process.env', async () => {
    const allFiles = await collectTsFiles(srcRoot);
    const domainFiles = allFiles.filter((f) => f.split(path.sep).includes('domain'));
    expect(domainFiles.length).toBeGreaterThan(20);

    const forbiddenPatterns = [
      /from\s+['"][^'"]*\/(application|infrastructure|presentation)\//,
      /from\s+['"](express|mysql2|bullmq|ioredis|zod|bcryptjs|jsonwebtoken)['"]/,
      /process\.env/,
    ];

    for (const file of domainFiles) {
      const content = await fs.readFile(file, 'utf8');
      for (const pattern of forbiddenPatterns) {
        expect(
          pattern.test(content),
          `Domain purity violation in ${path.relative(srcRoot, file)} matching ${pattern}`,
        ).toBe(false);
      }
    }
  });

  it('ensures catalog and scheduling bounded contexts never import from billing', async () => {
    const catalogFiles = await collectTsFiles(path.join(srcRoot, 'catalog'));
    const schedulingFiles = await collectTsFiles(path.join(srcRoot, 'scheduling'));

    for (const file of [...catalogFiles, ...schedulingFiles]) {
      const content = await fs.readFile(file, 'utf8');
      expect(
        /\/billing\//.test(content),
        `Context map violation: ${path.relative(srcRoot, file)} imports billing directly`,
      ).toBe(false);
    }
  });

  it('ensures zero residue of PulseGuard / observability domain terms in SlotMatrix src/', async () => {
    const allFiles = await collectTsFiles(srcRoot);
    const forbiddenPulseGuardTerms = [
      'MonitorWentDown',
      'ProbeResult',
      'TargetUrl',
      'SlaReport',
      'SlaCalculation',
      'X-PulseGuard-Signature',
      'PulseGuard',
    ];

    for (const file of allFiles) {
      const content = await fs.readFile(file, 'utf8');
      for (const term of forbiddenPulseGuardTerms) {
        expect(
          content.includes(term),
          `PulseGuard residue "${term}" found in ${path.relative(srcRoot, file)}`,
        ).toBe(false);
      }
    }
  });
});

describe('WebhookNotificationGateway HMAC-SHA256 Signing & Delivery', () => {
  it('signs outgoing webhook notifications with X-SlotMatrix-Signature and X-SlotMatrix-Timestamp', async () => {
    let receivedHeaders: http.IncomingHttpHeaders = {};
    let receivedBody = '';

    const server = http.createServer((req, res) => {
      receivedHeaders = req.headers;
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        receivedBody = Buffer.concat(chunks).toString('utf8');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      });
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Unexpected server address');
    }

    try {
      const gateway = new WebhookNotificationGateway({ allowPrivateTargets: true, timeoutMs: 3000 });
      const secret = 'slotmatrix_test_signing_secret_123456';
      const channel = WebhookChannel.create({
        tenantId: TenantId.from('ws-test-1'),
        name: 'Local Webhook Sink',
        url: SafeWebhookUrl.reconstitute(`http://127.0.0.1:${address.port}/hooks/slotmatrix`),
        secret,
      });

      await gateway.send(channel, {
        type: 'waitlist.slot_offered',
        tenantId: 'ws-test-1',
        referenceId: 'wl-1',
        procedureId: 'proc-1',
        clientName: 'Beatriz Monteiro',
        clientEmail: 'beatriz@test.com',
        slotStartAt: '2026-11-05T09:00:00.000Z',
        slotEndAt: '2026-11-05T09:40:00.000Z',
        offerExpiresAt: '2026-11-04T15:30:00.000Z',
        message: 'Vaga disponível via Smart Waitlist',
        occurredAt: '2026-11-04T15:00:00.000Z',
      });

      expect(receivedHeaders['user-agent']).toBe('SlotMatrix-Webhooks/1.0');
      const timestamp = String(receivedHeaders['x-slotmatrix-timestamp']);
      const signature = String(receivedHeaders['x-slotmatrix-signature']);

      const expectedHmac = crypto
        .createHmac('sha256', secret)
        .update(`${timestamp}.${receivedBody}`)
        .digest('hex');

      expect(signature).toBe(`sha256=${expectedHmac}`);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
