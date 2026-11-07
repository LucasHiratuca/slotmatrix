import { BookableResource } from '../aggregates/BookableResource';
import { ResourceRequirement, ServiceProcedure } from '../aggregates/ServiceProcedure';

/**
 * Specification pura: verifica se um BookableResource satisfaz um ResourceRequirement
 * (mesma categoria, status ACTIVE e todas as capabilities técnicas exigidas)
 * e se um conjunto de recursos satisfaz 100% dos requisitos de um ServiceProcedure sem reutilizar o mesmo recurso duas vezes.
 */
export class ResourceQualificationSpecification {
  resourceSatisfiesRequirement(resource: BookableResource, requirement: ResourceRequirement): boolean {
    if (!resource.isActive) return false;
    if (resource.category !== requirement.category) return false;
    return resource.capabilities.satisfies(requirement.requiredCapabilities);
  }

  /**
   * Faz o casamento 1-para-1 entre `procedure.requirements` e `candidateResources` (mesma cardinalidade e recursos distintos).
   * Retorna os pares casados na ordem dos requisitos, ou `null` se não satisfizer 100%.
   */
  matchAllRequirements(
    procedure: ServiceProcedure,
    candidateResources: BookableResource[],
  ): { requirement: ResourceRequirement; resource: BookableResource }[] | null {
    const reqs = procedure.requirements;
    if (candidateResources.length !== reqs.length) return null;
    const uniqueIds = new Set(candidateResources.map((r) => r.id.value));
    if (uniqueIds.size !== candidateResources.length) return null;

    const used = new Set<string>();
    const matched: { requirement: ResourceRequirement; resource: BookableResource }[] = [];

    const backtrack = (reqIdx: number): boolean => {
      if (reqIdx === reqs.length) return true;
      const req = reqs[reqIdx];
      for (const res of candidateResources) {
        if (used.has(res.id.value)) continue;
        if (this.resourceSatisfiesRequirement(res, req)) {
          used.add(res.id.value);
          matched.push({ requirement: req, resource: res });
          if (backtrack(reqIdx + 1)) return true;
          matched.pop();
          used.delete(res.id.value);
        }
      }
      return false;
    };

    return backtrack(0) ? matched : null;
  }
}
