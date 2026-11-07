import { ServiceProcedure } from '../aggregates/ServiceProcedure';

export interface IServiceProcedureRepository {
  save(procedure: ServiceProcedure): Promise<void>;
  findById(tenantId: string, id: string): Promise<ServiceProcedure | null>;
  listByTenant(tenantId: string): Promise<ServiceProcedure[]>;
}
