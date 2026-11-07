import { BookableResource } from '../../../catalog/domain/aggregates/BookableResource';
import { ResourceRequirement, ServiceProcedure } from '../../../catalog/domain/aggregates/ServiceProcedure';
import { ResourceQualificationSpecification } from '../../../catalog/domain/specifications/ResourceQualificationSpecification';
import { ResourceAllocation } from '../aggregates/Booking';
import { TimeSlot } from '../value-objects/TimeSlot';

export interface ExistingResourceHold {
  readonly resourceId: string;
  readonly effectiveOccupiedSlot: TimeSlot;
}

/**
 * Motor puro de disponibilidade multi-recurso com TurnaroundBuffer assimétrico.
 * Para cada requisito do procedimento, expande `serviceSlot` com `(prepMinutes, cleanupMinutes)` daquele requisito
 * e garante que o recurso:
 *  1) tem a categoria e todas as capabilities exigidas;
 *  2) está operacional durante todo o `effectiveOccupiedSlot` (grade semanal + sem manutenção);
 *  3) não colide com nenhum `ExistingResourceHold` (Bookings ativos ou SlotOffers vigentes).
 */
export class MultiResourceAvailabilityDomainService {
  private readonly qualification = new ResourceQualificationSpecification();

  isResourceFreeForRequirement(
    resource: BookableResource,
    requirement: ResourceRequirement,
    serviceSlot: TimeSlot,
    existingHolds: ExistingResourceHold[],
  ): { ok: true; allocation: ResourceAllocation } | { ok: false; reason: string } {
    if (!this.qualification.resourceSatisfiesRequirement(resource, requirement)) {
      return { ok: false, reason: `Resource ${resource.name} does not satisfy ${requirement.category} requirement/capabilities` };
    }
    const prepMinutes = requirement.turnaround.prepMinutes;
    const cleanupMinutes = requirement.turnaround.cleanupMinutes;
    const effectiveOccupiedSlot = serviceSlot.expandWithBuffers(prepMinutes, cleanupMinutes);

    if (!resource.isOperationalDuring(effectiveOccupiedSlot)) {
      return { ok: false, reason: `Resource ${resource.name} is outside operational hours or in maintenance during ${effectiveOccupiedSlot.startAt.toISOString()}..${effectiveOccupiedSlot.endAt.toISOString()}` };
    }

    for (const hold of existingHolds) {
      if (hold.resourceId === resource.id.value && hold.effectiveOccupiedSlot.overlapsWith(effectiveOccupiedSlot)) {
        return {
          ok: false,
          reason: `Resource ${resource.name} is occupied (including turnaround/sterilization buffer) during ${hold.effectiveOccupiedSlot.startAt.toISOString()}..${hold.effectiveOccupiedSlot.endAt.toISOString()}`,
        };
      }
    }

    return {
      ok: true,
      allocation: {
        resourceId: resource.id.value,
        resourceName: resource.name,
        category: resource.category,
        serviceSlot,
        prepMinutes,
        cleanupMinutes,
        effectiveOccupiedSlot,
      },
    };
  }

  /**
   * Encontra uma combinação válida de recursos distintos (1 para cada requisito do procedimento) para o `serviceSlot`.
   * Se `preferredResourceIds` for informado, restringe a busca a esses recursos.
   */
  allocateResourcesForSlot(input: {
    procedure: ServiceProcedure;
    serviceSlot: TimeSlot;
    candidateResources: BookableResource[];
    existingHolds: ExistingResourceHold[];
    preferredResourceIds?: string[];
  }): { ok: true; allocations: ResourceAllocation[] } | { ok: false; reason: string } {
    const pool = input.preferredResourceIds?.length
      ? input.candidateResources.filter((r) => input.preferredResourceIds!.includes(r.id.value))
      : input.candidateResources;

    if (input.preferredResourceIds?.length && pool.length !== input.preferredResourceIds.length) {
      return { ok: false, reason: 'One or more requested resources do not exist in this workspace' };
    }

    const reqs = input.procedure.requirements;
    const usedIds = new Set<string>();
    const chosen: ResourceAllocation[] = [];
    let lastFailureReason = 'No qualified resource combination available for this slot';

    const search = (reqIdx: number): boolean => {
      if (reqIdx === reqs.length) return true;
      const req = reqs[reqIdx];
      for (const res of pool) {
        if (usedIds.has(res.id.value)) continue;
        const check = this.isResourceFreeForRequirement(res, req, input.serviceSlot, input.existingHolds);
        if (!check.ok) {
          lastFailureReason = check.reason;
          continue;
        }
        usedIds.add(res.id.value);
        chosen.push(check.allocation);
        if (search(reqIdx + 1)) return true;
        chosen.pop();
        usedIds.delete(res.id.value);
      }
      return false;
    };

    if (!search(0)) {
      return { ok: false, reason: lastFailureReason };
    }
    return { ok: true, allocations: chosen };
  }

  /**
   * Varre uma janela de busca em passos de `stepMinutes` (ex: 15 min) e retorna todos os `TimeSlot`s viáveis
   * junto com a combinação de `ResourceAllocation`s sugerida para cada horário.
   */
  findAvailableSlots(input: {
    procedure: ServiceProcedure;
    searchWindow: TimeSlot;
    stepMinutes?: number;
    candidateResources: BookableResource[];
    existingHolds: ExistingResourceHold[];
    maxResults?: number;
  }): { serviceSlot: TimeSlot; allocations: ResourceAllocation[] }[] {
    const stepMs = (input.stepMinutes ?? 15) * 60_000;
    const durMs = input.procedure.durationMinutes * 60_000;
    const max = input.maxResults ?? 60;
    const results: { serviceSlot: TimeSlot; allocations: ResourceAllocation[] }[] = [];

    for (
      let t = input.searchWindow.startAt.getTime();
      t + durMs <= input.searchWindow.endAt.getTime() && results.length < max;
      t += stepMs
    ) {
      const slot = TimeSlot.create(new Date(t), new Date(t + durMs));
      const attempt = this.allocateResourcesForSlot({
        procedure: input.procedure,
        serviceSlot: slot,
        candidateResources: input.candidateResources,
        existingHolds: input.existingHolds,
      });
      if (attempt.ok) {
        results.push({ serviceSlot: slot, allocations: attempt.allocations });
      }
    }
    return results;
  }
}
