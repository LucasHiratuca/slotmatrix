import { Clock } from './ports';
import { IWorkspaceRepository } from '../../tenancy/domain/repositories/IWorkspaceRepository';
import { IUserRepository } from '../../tenancy/application/ports';
import { ISubscriptionRepository } from '../../billing/domain/repositories/ISubscriptionRepository';
import { IBookableResourceRepository } from '../../catalog/domain/repositories/IBookableResourceRepository';
import { WorkspaceEntitlementPolicy } from '../../scheduling/domain/WorkspaceEntitlementPolicy';
import { NotFoundError } from '../domain/errors';

export class WorkspaceReadService {
  constructor(
    private readonly d: {
      workspaces: IWorkspaceRepository;
      users: IUserRepository;
      subscriptions: ISubscriptionRepository;
      resources: IBookableResourceRepository;
      entitlements: WorkspaceEntitlementPolicy;
      clock: Clock;
    },
  ) {}

  async listForUser(userId: string) {
    const list = await this.d.workspaces.listByMember(userId);
    return Promise.all(
      list.map(async (w) => {
        const sub = await this.d.subscriptions.findByTenant(w.id.value);
        return {
          id: w.id.value,
          name: w.name,
          slug: w.slug.value,
          role: w.roleOf(userId),
          plan: sub?.plan ?? 'STARTER',
          subscriptionStatus: sub?.status ?? null,
        };
      }),
    );
  }

  async overview(tenantId: string, userId: string) {
    const [ws, sub, ent, used] = await Promise.all([
      this.d.workspaces.findById(tenantId),
      this.d.subscriptions.findByTenant(tenantId),
      this.d.entitlements.forWorkspace(tenantId),
      this.d.resources.countActiveByTenant(tenantId),
    ]);
    if (!ws) throw new NotFoundError('Workspace not found');
    return {
      id: ws.id.value,
      name: ws.name,
      slug: ws.slug.value,
      role: ws.roleOf(userId),
      subscription: sub && {
        plan: sub.plan,
        status: sub.status,
        trialEndsAt: sub.trialEndsAt,
        currentPeriodEnd: sub.currentPeriodEnd,
      },
      entitlements: ent,
      quota: {
        resourcesUsed: used,
        resourcesMax: ent.maxActiveResources,
        usagePercent: ent.maxActiveResources ? Math.min(100, Math.round((used / ent.maxActiveResources) * 100)) : 0,
      },
    };
  }

  async members(tenantId: string) {
    const ws = await this.d.workspaces.findById(tenantId);
    if (!ws) throw new NotFoundError('Workspace not found');
    const users = await this.d.users.findByIds(ws.members.map((m) => m.userId));
    const byId = new Map(users.map((u) => [u.id.value, u]));
    return ws.members.map((m) => ({
      userId: m.userId,
      role: m.role,
      joinedAt: m.joinedAt,
      email: byId.get(m.userId)?.email ?? null,
      name: byId.get(m.userId)?.name ?? null,
    }));
  }
}
