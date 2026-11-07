import { buildContainer } from './composition-root';
import { buildMySqlInfrastructure, loadEnv } from './infrastructure/mysql-infrastructure';
import { ExpirationWorker } from './scheduling/infrastructure/ExpirationWorker';
import { runMigrations, waitForDatabase } from './shared/infrastructure/mysql';

async function bootstrapWorker() {
  const env = loadEnv();
  const { db, infra } = buildMySqlInfrastructure(env);

  await waitForDatabase(db);
  await runMigrations(db);

  const container = buildContainer(infra, { billingWebhookSecret: env.billingWebhookSecret });
  const worker = new ExpirationWorker(env.redisUrl, container, 15_000);
  await worker.start();
  console.log('[SlotMatrix Worker] ExpirationWorker started and sweeping BullMQ queue.');

  const shutdown = async (signal: string) => {
    console.log(`[SlotMatrix Worker] Received ${signal}. Closing worker & DB...`);
    await worker.stop();
    await db.close();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

bootstrapWorker().catch((err) => {
  console.error('[SlotMatrix Worker] Fatal startup error:', err);
  process.exit(1);
});
