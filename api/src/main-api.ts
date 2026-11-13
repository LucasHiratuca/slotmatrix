import { buildContainer, Container } from './composition-root';
import { buildMySqlInfrastructure, loadEnv } from './infrastructure/mysql-infrastructure';
import { buildInMemoryInfrastructure } from './infrastructure/in-memory';
import { createApp } from './presentation/http/app';
import { runMigrations, waitForDatabase, Database } from './shared/infrastructure/mysql';
import { ensureBucketExists } from './shared/infrastructure/s3-storage';
import { seedDemoData } from './seed';

async function bootstrap() {
  const env = loadEnv();
  let container: Container;
  let db: Database | null = null;

  const forceStandalone = process.env.STANDALONE === 'true';

  if (!forceStandalone) {
    try {
      const mysqlInfra = buildMySqlInfrastructure(env);
      db = mysqlInfra.db;
      // Probe database with short timeout in non-prod
      const probeTimeoutMs = env.isProduction ? 30000 : 3000;
      await Promise.race([
        waitForDatabase(db),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Database probe timeout')), probeTimeoutMs)),
      ]);
      await runMigrations(db);
      await ensureBucketExists().catch(() => undefined);

      container = buildContainer(mysqlInfra.infra, {
        billingWebhookSecret: env.billingWebhookSecret,
        selfBaseUrl: `http://127.0.0.1:${env.port}`,
        stripeSecretKey: env.stripeSecretKey,
        stripeWebhookSecret: env.stripeWebhookSecret,
        appPublicUrl: env.appPublicUrl,
        isProduction: env.isProduction,
        enableBillingSimulator: env.enableBillingSimulator,
        enableApiDocs: env.enableApiDocs,
        corsOrigins: env.corsOrigins,
      });

      if (!env.isProduction && process.env.AUTO_SEED === 'true') {
        await seedDemoData(container);
      } else if (env.isProduction && process.env.AUTO_SEED === 'true') {
        console.warn('[Security] AUTO_SEED=true ignorado em NODE_ENV=production.');
      }
    } catch (err: any) {
      if (env.isProduction) {
        throw err;
      }
      console.warn(`[SlotMatrix API] MySQL offline ou inacessível (${err?.message || err}).`);
      console.log('[SlotMatrix API] Inicializando em modo STANDALONE In-Memory (Zero dependência externa) com dados demo...');
      const inMemInfra = buildInMemoryInfrastructure({ jwtSecret: env.jwtSecret });
      container = buildContainer(inMemInfra, {
        billingWebhookSecret: env.billingWebhookSecret,
        selfBaseUrl: `http://127.0.0.1:${env.port}`,
        stripeSecretKey: env.stripeSecretKey,
        stripeWebhookSecret: env.stripeWebhookSecret,
        appPublicUrl: env.appPublicUrl,
        isProduction: false,
        enableBillingSimulator: true,
        enableApiDocs: true,
        corsOrigins: env.corsOrigins,
      });
      await seedDemoData(container);
    }
  } else {
    console.log('[SlotMatrix API] STANDALONE=true detectado. Inicializando em modo In-Memory com dados demo...');
    const inMemInfra = buildInMemoryInfrastructure({ jwtSecret: env.jwtSecret });
    container = buildContainer(inMemInfra, {
      billingWebhookSecret: env.billingWebhookSecret,
      selfBaseUrl: `http://127.0.0.1:${env.port}`,
      stripeSecretKey: env.stripeSecretKey,
      stripeWebhookSecret: env.stripeWebhookSecret,
      appPublicUrl: env.appPublicUrl,
      isProduction: false,
      enableBillingSimulator: true,
      enableApiDocs: true,
      corsOrigins: env.corsOrigins,
    });
    await seedDemoData(container);
  }

  const app = createApp(container);
  const server = app.listen(env.port, '0.0.0.0', () => {
    console.log(
      `[SlotMatrix API] Listening on http://0.0.0.0:${env.port}${env.enableApiDocs ? ' (Swagger at /api/docs)' : ''}`,
    );
  });

  const shutdown = async (signal: string) => {
    console.log(`[SlotMatrix API] Received ${signal}. Shutting down gracefully...`);
    server.close(async () => {
      if (db) {
        await db.close().catch(() => undefined);
      }
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
