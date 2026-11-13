import IORedis from 'ioredis';
import nodemailer, { type Transporter } from 'nodemailer';
import { Infrastructure } from '../composition-root';
import { systemClock } from '../shared/application/ports';
import {
  BcryptPasswordHasher,
  InMemoryTokenRevocationStore,
  JwtTokenService,
  TokenRevocationStore,
} from '../shared/infrastructure/security';
import { Database, MySqlUnitOfWork } from '../shared/infrastructure/mysql';
import {
  MySqlAuditLogRepository,
  MySqlBookableResourceRepository,
  MySqlBookingRepository,
  MySqlPerfilRepository,
  MySqlProcessedWebhookStore,
  MySqlServiceProcedureRepository,
  MySqlSubscriptionRepository,
  MySqlUserRepository,
  MySqlWaitlistRepository,
  MySqlWebhookChannelRepository,
  MySqlWorkspaceRepository,
} from './mysql-repositories';
import { WebhookNotificationGateway } from '../scheduling/infrastructure/WebhookNotificationGateway';
import { IEmailGateway, PasswordResetEmailPayload } from '../tenancy/application/ports';

const KNOWN_INSECURE_SECRETS = new Set([
  'slotmatrix-production-grade-secret-key-2026',
  'whsec_slotmatrix_billing_secret_2026',
  'changeme',
  'secret',
]);

export interface AppEnvironment {
  port: number;
  isProduction: boolean;
  databaseUrl: string;
  redisUrl: string;
  jwtSecret: string;
  billingWebhookSecret: string;
  allowLocalWebhooks: boolean;
  enableBillingSimulator: boolean;
  enableApiDocs: boolean;
  stripeSecretKey?: string;
  stripeWebhookSecret?: string;
  appPublicUrl: string;
  corsOrigins: string[];
}

function resolveSecret(name: string, devFallback: string, isProduction: boolean): string {
  const val = process.env[name]?.trim();
  if (isProduction) {
    if (!val || val.length < 24 || KNOWN_INSECURE_SECRETS.has(val)) {
      throw new Error(
        `[Security] ${name} inválido ou ausente em NODE_ENV=production. Defina um segredo forte (>= 24 caracteres).`,
      );
    }
    return val;
  }
  if (!val || KNOWN_INSECURE_SECRETS.has(val)) {
    console.warn(`[Security] Aviso: ${name} usando segredo padrão de desenvolvimento (proibido em produção).`);
  }
  return val || devFallback;
}

class RedisBackedRevocationStore implements TokenRevocationStore {
  private readonly fallback = new InMemoryTokenRevocationStore();
  private readonly redis: IORedis | null = null;

  constructor(redisUrl: string) {
    try {
      this.redis = new IORedis(redisUrl, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
      });
      this.redis.on('error', () => {
        // Degrada graciosamente para memória local se Redis estiver indisponível
      });
    } catch {
      this.redis = null;
    }
  }

  async revoke(jti: string, expiresAtMs: number): Promise<void> {
    this.fallback.revoke(jti, expiresAtMs);
    if (!this.redis) return;
    const ttlSec = Math.max(1, Math.ceil((expiresAtMs - Date.now()) / 1000));
    try {
      if (this.redis.status === 'wait') await this.redis.connect();
      await this.redis.set(`slotmatrix:revoked:${jti}`, '1', 'EX', ttlSec);
    } catch {
      // fallback em memória já registrado
    }
  }

  async isRevoked(jti: string): Promise<boolean> {
    if (this.fallback.isRevoked(jti)) return true;
    if (!this.redis) return false;
    try {
      if (this.redis.status === 'wait') await this.redis.connect();
      const hit = await this.redis.get(`slotmatrix:revoked:${jti}`);
      return hit === '1';
    } catch {
      return false;
    }
  }
}

export class ConsoleEmailGateway implements IEmailGateway {
  private transporter: Transporter | null = null;

  constructor() {
    const host = process.env.SMTP_HOST;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const port = Number(process.env.SMTP_PORT ?? 587);

    if (host && user && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
      });
      console.log(`[EmailGateway] SMTP configurado com sucesso para ${host}:${port} (${user})`);
    }
  }

  async sendPasswordResetEmail(payload: PasswordResetEmailPayload): Promise<void> {
    console.log('\n================================================================');
    console.log('📧 [SLOTMATRIX EMAIL SERVICE] E-MAIL DE REDEFINIÇÃO DE SENHA');
    console.log(`Para: ${payload.toEmail} (${payload.userName})`);
    console.log(`Assunto: SlotMatrix · Redefinição de Senha`);
    console.log(`Link direto de redefinição: ${payload.resetUrl}`);
    console.log(`Token: ${payload.resetToken}`);
    console.log(`Expira em: ${payload.expiresAt.toISOString()}`);
    console.log('================================================================\n');

    if (this.transporter) {
      try {
        const from = process.env.SMTP_FROM ?? process.env.SMTP_USER ?? 'suporte@slotmatrix.com';
        await this.transporter.sendMail({
          from: `"SlotMatrix" <${from}>`,
          to: payload.toEmail,
          subject: 'SlotMatrix · Redefinição de Senha',
          text: `Olá ${payload.userName},\n\nRecebemos uma solicitação para redefinir a sua senha no SlotMatrix.\n\nClique no link abaixo para criar uma nova senha:\n${payload.resetUrl}\n\nEste link expira em 1 hora.\n\nSe você não solicitou esta alteração, ignore este e-mail.`,
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b; background-color: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0;">
              <h2 style="color: #0f172a; margin-top: 0;">Redefinição de Senha · SlotMatrix</h2>
              <p>Olá <strong>${payload.userName}</strong>,</p>
              <p>Recebemos uma solicitação para redefinir a senha de acesso da sua conta.</p>
              <div style="margin: 28px 0;">
                <a href="${payload.resetUrl}" style="background-color: #0284c7; color: #ffffff; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">
                  Redefinir Minha Senha
                </a>
              </div>
              <p style="font-size: 13px; color: #64748b; margin-bottom: 4px;">Ou copie e cole o link abaixo no seu navegador:</p>
              <p style="font-size: 13px; color: #0284c7; word-break: break-all;">${payload.resetUrl}</p>
              <hr style="border: none; border-top: 1px solid #cbd5e1; margin: 24px 0;" />
              <p style="font-size: 12px; color: #94a3b8; margin-bottom: 0;">Este link é válido por 1 hora. Se você não solicitou a alteração, nenhuma ação é necessária.</p>
            </div>
          `,
        });
        console.log(`[EmailGateway] ✅ E-mail enviado com sucesso via SMTP para ${payload.toEmail}`);
      } catch (err: any) {
        console.error(`[EmailGateway] ❌ Erro ao enviar e-mail via SMTP para ${payload.toEmail}:`, err?.message ?? err);
      }
    }
  }
}

export function loadEnv(): AppEnvironment {
  const isProduction = process.env.NODE_ENV === 'production';
  const appPublicUrl =
    process.env.APP_PUBLIC_URL ?? process.env.CATALOG_PUBLIC_URL ?? 'http://localhost:18174';

  const extraOrigins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const corsOrigins = Array.from(
    new Set([
      appPublicUrl,
      ...extraOrigins,
      ...(!isProduction ? ['http://localhost:18174', 'http://127.0.0.1:18174'] : []),
    ]),
  );

  return {
    port: Number(process.env.PORT ?? 18081),
    isProduction,
    databaseUrl:
      process.env.DATABASE_URL ?? 'mysql://slotmatrix:slotmatrix@localhost:13308/slotmatrix',
    redisUrl: process.env.REDIS_URL ?? 'redis://localhost:16381',
    jwtSecret: resolveSecret('JWT_SECRET', 'slotmatrix-production-grade-secret-key-2026', isProduction),
    billingWebhookSecret: resolveSecret(
      'BILLING_WEBHOOK_SECRET',
      'whsec_slotmatrix_billing_secret_2026',
      isProduction,
    ),
    allowLocalWebhooks: !isProduction && process.env.ALLOW_LOCAL_WEBHOOKS === 'true',
    enableBillingSimulator: !isProduction && process.env.ENABLE_BILLING_SIMULATOR === 'true',
    enableApiDocs: isProduction ? process.env.ENABLE_API_DOCS === 'true' : process.env.ENABLE_API_DOCS !== 'false',
    stripeSecretKey: process.env.STRIPE_SECRET_KEY,
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    appPublicUrl,
    corsOrigins,
  };
}

export function buildMySqlInfrastructure(env: AppEnvironment): {
  db: Database;
  infra: Infrastructure;
} {
  const db = new Database(env.databaseUrl);
  const revocationStore = new RedisBackedRevocationStore(env.redisUrl);
  const infra: Infrastructure = {
    uow: new MySqlUnitOfWork(db),
    clock: systemClock,
    users: new MySqlUserRepository(db),
    perfis: new MySqlPerfilRepository(db),
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
    tokens: new JwtTokenService(env.jwtSecret, '8h', revocationStore),
    emails: new ConsoleEmailGateway(),
  };

  return { db, infra };
}
