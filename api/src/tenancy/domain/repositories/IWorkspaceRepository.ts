import { Workspace } from '../aggregates/Workspace';

export interface IWorkspaceRepository {
  save(workspace: Workspace): Promise<void>;
  findById(tenantId: string): Promise<Workspace | null>;
  findBySlug(slug: string): Promise<Workspace | null>;
  listByMember(userId: string): Promise<Workspace[]>;
  slugExists(slug: string): Promise<boolean>;
}
