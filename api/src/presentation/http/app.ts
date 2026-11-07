import cors from 'cors';
import express from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import swaggerUi from 'swagger-ui-express';
import { Container } from '../../composition-root';
import { domainExceptionFilter } from './exception-filter';
import { RouterKit } from './router-kit';
import { registerRoutes } from './routes';
import { getDocumentStream, uploadDocument } from '../../shared/infrastructure/s3-storage';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

export function createApp(c: Container) {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors());
  app.use(
    express.json({
      limit: '256kb',
      verify: (req: any, _res, buf) => {
        req.rawBody = buf.toString('utf8');
      },
    }),
  );

  // Upload de arquivos do domínio (laudos, fotos de equipamentos, comprovantes) para MinIO/Garage S3
  app.post('/api/upload', upload.single('file'), async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'BAD_REQUEST', message: 'Nenhum arquivo enviado.' });
      }
      const ext = req.file.originalname.split('.').pop()?.toLowerCase() || 'bin';
      const key = `workspace-docs/${randomUUID()}.${ext}`;
      await uploadDocument(key, req.file.buffer, req.file.mimetype);
      return res.status(201).json({
        key,
        originalName: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        url: `/api/documents/${key}`,
      });
    } catch (err) {
      next(err);
    }
  });

  // Streaming seguro de documentos do storage
  app.get('/api/documents/:key(*)', async (req, res) => {
    try {
      const key = req.params.key;
      const stream = await getDocumentStream(key);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      (stream as any).pipe(res);
    } catch (err: any) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Documento não encontrado no storage.' });
    }
  });

  const kit = new RouterKit(c);
  registerRoutes(kit, c);

  const spec = {
    openapi: '3.0.3',
    info: {
      title: 'SlotMatrix API',
      version: '1.0.0',
      description: 'Multi-Resource Scheduling, Anti-No-Show & Smart Waitlist B2B SaaS. Send `x-workspace-id` on tenant routes.',
    },
    servers: [{ url: '/' }],
    components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } } },
    paths: kit.openApiPaths(),
  };

  app.get('/api/openapi.json', (_req, res) => res.json(spec));
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(spec));
  app.use('/api', kit.router);
  app.use((_req, res) => res.status(404).json({ error: 'NOT_FOUND', message: 'Route not found' }));
  app.use(domainExceptionFilter);
  return app;
}
