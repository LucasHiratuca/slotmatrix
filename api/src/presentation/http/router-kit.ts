import { NextFunction, Request, Response, Router } from 'express';
import { z, ZodTypeAny } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { Container } from '../../composition-root';
import { TenantContext } from '../../shared/application/ports';
import { ForbiddenError, TenantAccessDeniedError, UnauthorizedError } from '../../shared/domain/errors';
import { Role } from '../../tenancy/domain/events/tenancy-events';

type Access = 'public' | 'user' | 'tenant';
const RANK: Record<Role, number> = { SPECIALIST: 1, COORDINATOR: 2, ADMIN: 3, OWNER: 4 };

export interface HandlerArgs {
  req: Request;
  userId: string;
  tenant: TenantContext;
  body: any;
  query: any;
  params: Record<string, string>;
  rawBody?: string;
}

export interface RouteDef {
  method: 'get' | 'post' | 'put' | 'patch' | 'delete';
  path: string;
  summary: string;
  tag: string;
  access: Access;
  minRole?: Role;
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  successStatus?: number;
  handler: (a: HandlerArgs) => Promise<unknown>;
}

declare module 'express-serve-static-core' {
  interface Request {
    rawBody?: string;
  }
}

export class RouterKit {
  readonly router = Router();
  readonly defs: RouteDef[] = [];
  constructor(private readonly c: Container) {}

  add(def: RouteDef) {
    this.defs.push(def);
    this.router[def.method](def.path, async (req: Request, res: Response, next: NextFunction) => {
      try {
        let userId = '';
        let tenant = undefined as unknown as TenantContext;
        if (def.access !== 'public') {
          userId = this.authenticate(req);
          if (def.access === 'tenant') {
            tenant = await this.resolveTenant(req, userId);
            if (def.minRole && RANK[tenant.role] < RANK[def.minRole]) {
              throw new ForbiddenError(`Requires role ${def.minRole} or higher`);
            }
          }
        }
        const body = def.body ? def.body.parse(req.body ?? {}) : req.body;
        const query = def.query ? def.query.parse(req.query) : req.query;
        const out = await def.handler({ req, userId, tenant, body, query, params: req.params, rawBody: req.rawBody });
        res.status(def.successStatus ?? 200);
        if (out === undefined) res.end();
        else res.json(out);
      } catch (e) {
        next(e);
      }
    });
  }

  private authenticate(req: Request): string {
    const h = req.header('authorization');
    const token = h?.startsWith('Bearer ') ? h.slice(7) : undefined;
    const p = token ? this.c.infra.tokens.verify(token) : null;
    if (!p) throw new UnauthorizedError('Missing or invalid bearer token');
    return p.userId;
  }

  private async resolveTenant(req: Request, userId: string): Promise<TenantContext> {
    const tenantId = req.header('x-workspace-id');
    if (!tenantId) throw new TenantAccessDeniedError('x-workspace-id header is required');
    const ws = await this.c.infra.workspaces.findById(tenantId);
    const role = ws?.roleOf(userId);
    if (!ws || !role) throw new TenantAccessDeniedError('You do not have access to this workspace');
    return { userId, tenantId, role };
  }

  openApiPaths() {
    const paths: Record<string, any> = {};
    for (const d of this.defs) {
      const oaPath = '/api' + d.path.replace(/:([A-Za-z]+)/g, '{$1}');
      const params: any[] = [
        ...(d.path.match(/:([A-Za-z]+)/g) ?? []).map((p) => ({ name: p.slice(1), in: 'path', required: true, schema: { type: 'string' } })),
      ];
      if (d.access === 'tenant') {
        params.push({
          name: 'x-workspace-id',
          in: 'header',
          required: true,
          schema: { type: 'string', format: 'uuid' },
          description: 'Workspace (tenant) context; membership is validated.',
        });
      }
      if (d.query) {
        const s: any = zodToJsonSchema(d.query, { target: 'openApi3' });
        for (const [name, schema] of Object.entries<any>(s.properties ?? {})) {
          params.push({ name, in: 'query', required: (s.required ?? []).includes(name), schema });
        }
      }
      const op: any = {
        tags: [d.tag],
        summary: d.summary + (d.minRole ? ` (requires ${d.minRole}+)` : ''),
        parameters: params,
        responses: {
          [String(d.successStatus ?? 200)]: { description: 'Success' },
          ...(d.access !== 'public' ? { '401': { description: 'Unauthenticated' } } : {}),
          ...(d.access === 'tenant' ? { '403': { description: 'Not a member of the workspace / insufficient role' } } : {}),
          '404': { description: 'Resource not found (also returned for resources of other tenants)' },
          '409': { description: 'ResourceAllocationConflict / InvalidStateTransition / Conflict' },
          '422': { description: 'Domain validation (e.g. UnsafeWebhookUrl)' },
          '402': { description: 'QuotaExceeded / FeatureNotEntitled' },
        },
      };
      if (d.access !== 'public') op.security = [{ bearerAuth: [] }];
      if (d.body) {
        op.requestBody = {
          required: true,
          content: { 'application/json': { schema: zodToJsonSchema(d.body, { target: 'openApi3' }) } },
        };
      }
      (paths[oaPath] ??= {})[d.method] = op;
    }
    return paths;
  }
}

export { z };
