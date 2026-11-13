import cors from 'cors';
import express from 'express';
import multer from 'multer';
import swaggerUi from 'swagger-ui-express';
import { Container } from '../../composition-root';
import { ForbiddenError } from '../../shared/domain/errors';
import { domainExceptionFilter } from './exception-filter';
import { createRateLimiter } from './rate-limit';
import { ROLE_RANK, RouterKit } from './router-kit';
import { registerRoutes } from './routes';
import { getDocumentStream, uploadDocument } from '../../shared/infrastructure/s3-storage';
import {
  assertTenantDocumentKey,
  contentTypeForDocumentKey,
  validateAndBuildTenantUploadKey,
} from '../../shared/infrastructure/upload-security';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

export function createApp(c: Container) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  // Security headers baseline on all API responses
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
  });

  const allowedOrigins = new Set(
    c.config.corsOrigins ?? [
      c.config.appPublicUrl ?? 'http://localhost:18174',
      'http://localhost:18174',
      'http://127.0.0.1:18174',
    ],
  );
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin) return callback(null, true);
        if (allowedOrigins.has(origin)) return callback(null, true);
        return callback(null, false);
      },
      credentials: true,
    }),
  );

  app.use(
    express.json({
      limit: '256kb',
      verify: (req: any, _res, buf) => {
        req.rawBody = buf.toString('utf8');
      },
    }),
  );

  const authRateLimiter = createRateLimiter({
    bucketName: 'auth',
    windowMs: 15 * 60 * 1000,
    max: 30,
  });
  const publicPortalRateLimiter = createRateLimiter({
    bucketName: 'public-portal',
    windowMs: 5 * 60 * 1000,
    max: 20,
    keyGenerator: (req) => `${req.ip || 'unknown'}:${req.params.slug || ''}`,
  });
  const uploadRateLimiter = createRateLimiter({
    bucketName: 'upload',
    windowMs: 10 * 60 * 1000,
    max: 30,
  });

  app.use('/api/auth/login', authRateLimiter);
  app.use('/api/auth/register', authRateLimiter);
  app.use('/api/public/book/:slug/schedule', publicPortalRateLimiter);
  app.use('/api/public/book/:slug/waitlist', publicPortalRateLimiter);

  const kit = new RouterKit(c);
  registerRoutes(kit, c);

  // Upload autenticado, restrito ao tenant e validado por MIME allowlist + magic bytes
  app.post('/api/upload', uploadRateLimiter, upload.single('file'), async (req, res, next) => {
    try {
      const userId = await kit.authenticate(req);
      const tenant = await kit.resolveTenant(req, userId);
      if (ROLE_RANK[tenant.role] < ROLE_RANK.COORDINATOR) {
        throw new ForbiddenError('Requires role COORDINATOR or higher');
      }
      if (!req.file) {
        return res.status(400).json({ error: 'BAD_REQUEST', message: 'Nenhum arquivo enviado.' });
      }
      const { key, safeMime } = validateAndBuildTenantUploadKey(
        tenant.tenantId,
        req.file.mimetype,
        req.file.buffer,
      );
      await uploadDocument(key, req.file.buffer, safeMime);
      return res.status(201).json({
        key,
        mimetype: safeMime,
        size: req.file.size,
        url: `/api/documents/${key}`,
      });
    } catch (err) {
      next(err);
    }
  });

  // Streaming autenticado e isolado por tenant (sem cache público e sem execução inline)
  app.get('/api/documents/:key(*)', async (req, res, next) => {
    try {
      const userId = await kit.authenticate(req);
      const tenant = await kit.resolveTenant(req, userId);
      const safeKey = assertTenantDocumentKey(tenant.tenantId, req.params.key);
      const stream = await getDocumentStream(safeKey);
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
      res.setHeader('Content-Disposition', 'attachment');
      res.setHeader('Content-Type', contentTypeForDocumentKey(safeKey));
      (stream as any).on('error', () => {
        if (!res.headersSent) {
          res.status(404).json({ error: 'NOT_FOUND', message: 'Documento não encontrado no storage.' });
        }
      });
      (stream as any).pipe(res);
    } catch (err: any) {
      if (err?.code === 'NoSuchKey' || err?.name === 'NoSuchKey') {
        return res.status(404).json({ error: 'NOT_FOUND', message: 'Documento não encontrado no storage.' });
      }
      next(err);
    }
  });

  const enableDocs = c.config.enableApiDocs ?? process.env.NODE_ENV !== 'production';
  if (enableDocs) {
    const spec = {
      openapi: '3.0.3',
      info: {
        title: 'SlotMatrix API',
        version: '1.0.0',
        description:
          'Multi-Resource Scheduling, Anti-No-Show & Smart Waitlist B2B SaaS. Send `x-workspace-id` on tenant routes.',
      },
      servers: [{ url: '/' }],
      components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } } },
      paths: kit.openApiPaths(),
    };
    app.get('/api/openapi.json', (_req, res) => res.json(spec));
    app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(spec));
  }

  app.use('/api', kit.router);
  app.use((_req, res) => res.status(404).json({ error: 'NOT_FOUND', message: 'Route not found' }));
  app.use(domainExceptionFilter);
  return app;
}
