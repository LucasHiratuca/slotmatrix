import { AggregateRoot } from '../../../shared/domain/AggregateRoot';
import { TenantId, UniqueEntityId } from '../../../shared/domain/UniqueEntityId';
import { ValidationError } from '../../../shared/domain/errors';
import { ResourceCapabilitySet } from '../value-objects/ResourceCapabilitySet';
import { TimeSlot } from '../../../scheduling/domain/value-objects/TimeSlot';
import { DomainEvent } from '../../../shared/domain/DomainEvent';

export type ResourceCategory = 'SPECIALIST' | 'ROOM' | 'EQUIPMENT';
export const RESOURCE_CATEGORIES: ResourceCategory[] = ['SPECIALIST', 'ROOM', 'EQUIPMENT'];

export type ResourceStatus = 'ACTIVE' | 'IN_MAINTENANCE' | 'ARCHIVED';

/** Janela diária recorrente em minutos desde 00:00 UTC (ex: 08:00 = 480, 18:00 = 1080) para dayOfWeek (0=Dom..6=Sáb). */
export interface WeeklyWindow {
  readonly dayOfWeek: number; // 0..6 (UTC)
  readonly startMinuteOfDay: number; // 0..1439
  readonly endMinuteOfDay: number; // 1..1440
}

export interface MaintenanceBlock {
  readonly id: string;
  readonly slot: TimeSlot;
  readonly reason: string;
}

export interface BookableResourceProps {
  tenantId: TenantId;
  name: string;
  category: ResourceCategory;
  status: ResourceStatus;
  capabilities: ResourceCapabilitySet;
  weeklyWindows: WeeklyWindow[];
  maintenanceBlocks: MaintenanceBlock[];
  createdAt: Date;
}

export class BookableResourceCreatedDomainEvent implements DomainEvent {
  readonly name = 'BookableResourceCreated';
  constructor(
    readonly tenantId: string,
    readonly aggregateId: string,
    readonly resourceName: string,
    readonly category: ResourceCategory,
    readonly occurredAt: Date,
  ) {}
}

/** Grade padrão de clínica/estúdio: Todos os dias 07:00 às 21:00 UTC. */
export function defaultWeeklyWindows(): WeeklyWindow[] {
  return [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
    dayOfWeek,
    startMinuteOfDay: 7 * 60,
    endMinuteOfDay: 21 * 60,
  }));
}

function validateWindows(windows: WeeklyWindow[]) {
  if (!Array.isArray(windows) || windows.length === 0) {
    throw new ValidationError('At least one WeeklyWindow is required');
  }
  for (const w of windows) {
    if (!Number.isInteger(w.dayOfWeek) || w.dayOfWeek < 0 || w.dayOfWeek > 6) {
      throw new ValidationError('WeeklyWindow dayOfWeek must be 0..6');
    }
    if (
      !Number.isInteger(w.startMinuteOfDay) ||
      !Number.isInteger(w.endMinuteOfDay) ||
      w.startMinuteOfDay < 0 ||
      w.endMinuteOfDay > 1440 ||
      w.endMinuteOfDay <= w.startMinuteOfDay
    ) {
      throw new ValidationError('Invalid WeeklyWindow minute bounds');
    }
  }
}

export class BookableResource extends AggregateRoot<BookableResourceProps> {
  private constructor(props: BookableResourceProps, id: UniqueEntityId) {
    super(props, id);
  }

  static create(
    input: {
      tenantId: TenantId;
      name: string;
      category: ResourceCategory;
      capabilities?: string[];
      weeklyWindows?: WeeklyWindow[];
      now: Date;
    },
    id = UniqueEntityId.generate(),
  ): BookableResource {
    if (!input.name || input.name.trim().length < 2 || input.name.length > 120) {
      throw new ValidationError('BookableResource name must have 2-120 chars');
    }
    if (!RESOURCE_CATEGORIES.includes(input.category)) {
      throw new ValidationError(`Invalid resource category: ${input.category}`);
    }
    const windows = input.weeklyWindows ?? defaultWeeklyWindows();
    validateWindows(windows);
    const res = new BookableResource(
      {
        tenantId: input.tenantId,
        name: input.name.trim(),
        category: input.category,
        status: 'ACTIVE',
        capabilities: ResourceCapabilitySet.create(input.capabilities ?? []),
        weeklyWindows: windows.map((w) => Object.freeze({ ...w })),
        maintenanceBlocks: [],
        createdAt: input.now,
      },
      id,
    );
    res.addDomainEvent(new BookableResourceCreatedDomainEvent(input.tenantId.value, id.value, res.props.name, input.category, input.now));
    return res;
  }

  static reconstitute(props: BookableResourceProps, id: UniqueEntityId): BookableResource {
    return new BookableResource(props, id);
  }

  get tenantId(): TenantId { return this.props.tenantId; }
  get name(): string { return this.props.name; }
  get category(): ResourceCategory { return this.props.category; }
  get status(): ResourceStatus { return this.props.status; }
  get capabilities(): ResourceCapabilitySet { return this.props.capabilities; }
  get weeklyWindows(): ReadonlyArray<WeeklyWindow> { return [...this.props.weeklyWindows]; }
  get maintenanceBlocks(): ReadonlyArray<MaintenanceBlock> { return [...this.props.maintenanceBlocks]; }
  get createdAt(): Date { return this.props.createdAt; }
  get isActive(): boolean { return this.props.status === 'ACTIVE'; }

  addMaintenanceBlock(slot: TimeSlot, reason: string): void {
    if (!reason || reason.trim().length < 2) throw new ValidationError('Maintenance reason is required');
    this.props.maintenanceBlocks.push(
      Object.freeze({
        id: `${this.id.value}:maint:${this.props.maintenanceBlocks.length + 1}`,
        slot,
        reason: reason.trim(),
      }),
    );
  }

  setStatus(status: ResourceStatus): void {
    this.props.status = status;
  }

  /**
   * Verifica se o recurso está operacional durante TODO o `effectiveSlot` (incluindo buffers):
   * - precisa estar ACTIVE;
   * - precisa caber numa WeeklyWindow do dia UTC;
   * - não pode sobrepor nenhum MaintenanceBlock.
   */
  isOperationalDuring(effectiveSlot: TimeSlot): boolean {
    if (this.props.status !== 'ACTIVE') return false;
    const s = effectiveSlot.startAt;
    const e = effectiveSlot.endAt;
    // Verifica mesmo dia UTC (procedimentos intra-dia)
    if (
      s.getUTCFullYear() !== e.getUTCFullYear() ||
      s.getUTCMonth() !== e.getUTCMonth() ||
      s.getUTCDate() !== e.getUTCDate()
    ) {
      return false;
    }
    const dow = s.getUTCDay();
    const startMin = s.getUTCHours() * 60 + s.getUTCMinutes();
    const endMin = e.getUTCHours() * 60 + e.getUTCMinutes();
    const fitsWindow = this.props.weeklyWindows.some(
      (w) => w.dayOfWeek === dow && w.startMinuteOfDay <= startMin && endMin <= w.endMinuteOfDay,
    );
    if (!fitsWindow) return false;
    for (const block of this.props.maintenanceBlocks) {
      if (block.slot.overlapsWith(effectiveSlot)) return false;
    }
    return true;
  }
}
