import { Infrastructure } from '../composition-root';
import { systemClock } from '../shared/application/ports';
import { BcryptPasswordHasher, JwtTokenService } from '../shared/infrastructure/security';
import { Database, MySqlUnitOfWork } from '../shared/infrastructure/mysql';
import {
  MySqlAuditLogRepository,
  MySqlBookableResourceRepository,
  MySqlBookingRepository,
  MySqlProcessedWebhookStore,
  MySqlServiceProcedureRepository,
  MySqlSubscriptionRepository,
  MySqlUserRepository,
  MySqlWaitlistRepository,
  MySqlWebhookChannelRepository,
  MySqlWorkspaceRepository,
} from './mysql-repositories';
import { WebhookNotificationGateway } from '../scheduling/infrastructure/WebhookNotificationGateway';

export interface AppEnvironment {
  port: number;
  databaseUrl: string;
  redisUrl: string;
  jwtSecret: string;
  billingWebhookSecret: string;
  allowLocalWebhooks: boolean;
  stripeSecretKey?: string;
  stripeWebhookSecret?: string;
  appPublicUrl: string;
}

export function loadEnv(): AppEnvironment {
  return {
    port: Number(process.env.PORT ?? 18081),
    databaseUrl:
      process.env.DATABASE_URL ?? 'mysql://slotmatrix:slotmatrix@localhost:13308/slotmatrix',
    redisUrl: process.env.REDIS_URL ?? 'redis://localhost:16381',
    jwtSecret: process.env.JWT_SECRET ?? 'slotmatrix-production-grade-secret-key-2026',
    billingWebhookSecret:
      process.env.BILLING_WEBHOOK_SECRET ?? 'whsec_slotmatrix_billing_secret_2026',
    allowLocalWebhooks: process.env.ALLOW_LOCAL_WEBHOOKS === 'true',
    stripeSecretKey: process.env.STRIPE_SECRET_KEY,
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    appPublicUrl:
      process.env.APP_PUBLIC_URL ?? process.env.CATALOG_PUBLIC_URL ?? 'http://localhost:18174',
  };
}

export function buildMySqlInfrastructure(env: AppEnvironment): {
  db: Database;
  infra: Infrastructure;
} {
  const db = new Database(env.databaseUrl);
  const infra: Infrastructure = {
    uow: new MySqlUnitOfWork(db),
    clock: systemClock,
    users: new MySqlUserRepository(db),
    workspaces: new MySqlWorkspaceRepository(db),
    subscriptions: new MySqlSubscriptionRepository(db),
    resources: new MySqlBookableResourceRepository(db),
    procedures: new MySqlServiceProcedureRepository(db),
    bookings: new MySqlBookingRepository(db),
    waitlist: new MySqlWaitlistRepository(db),
    webhookChannels: new MySqlWebhookChannelRepository(db),
    auditLogs: new MySqlAuditLogRepository(db),
    processedWebhooks: new MySqlProcessedWebhookStore(db),
    notifications: new WebhookNotificationGateway({
      allowPrivateTargets: env.allowLocalWebhooks,
      timeoutMs: 5000,
    }),
    hasher: new BcryptPasswordHasher(10),
    tokens: new JwtTokenService(env.jwtSecret),
  };

  return { db, infra };
}
