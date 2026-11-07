import { BookableResource } from '../aggregates/BookableResource';

/** Todo método exige TenantId explícito para impedir Cross-Tenant Leak. */
export interface IBookableResourceRepository {
  save(resource: BookableResource): Promise<void>;
  findById(tenantId: string, id: string): Promise<BookableResource | null>;
  listByTenant(tenantId: string, opts?: { onlyActive?: boolean }): Promise<BookableResource[]>;
  countActiveByTenant(tenantId: string): Promise<number>;
}
