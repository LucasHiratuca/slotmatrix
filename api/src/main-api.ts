import { buildContainer } from './composition-root';
import { buildMySqlInfrastructure, loadEnv } from './infrastructure/mysql-infrastructure';
import { createApp } from './presentation/http/app';
import { runMigrations, waitForDatabase } from './shared/infrastructure/mysql';
import { ensureBucketExists } from './shared/infrastructure/s3-storage';
import { seedDemoData } from './seed';

async function bootstrap() {
  const env = loadEnv();
  const { db, infra } = buildMySqlInfrastructure(env);

  await waitForDatabase(db);
  await runMigrations(db);
  await ensureBucketExists();

  const container = buildContainer(infra, {
    billingWebhookSecret: env.billingWebhookSecret,
    selfBaseUrl: `http://127.0.0.1:${env.port}`,
    stripeSecretKey: env.stripeSecretKey,
    stripeWebhookSecret: env.stripeWebhookSecret,
    appPublicUrl: env.appPublicUrl,
  });

  if (process.env.AUTO_SEED !== 'false') {
    await seedDemoData(container);
  }

  const app = createApp(container);
  const server = app.listen(env.port, '0.0.0.0', () => {
    console.log(`[SlotMatrix API] Listening on http://0.0.0.0:${env.port} (Swagger at /api/docs)`);
  });

  const shutdown = async (signal: string) => {
    console.log(`[SlotMatrix API] Received ${signal}. Shutting down gracefully...`);
    server.close(async () => {
      await db.close();
      process.exit(0);
    });
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

bootstrap().catch((err) => {
  console.error('[SlotMatrix API] Fatal startup error:', err);
  process.exit(1);
});
