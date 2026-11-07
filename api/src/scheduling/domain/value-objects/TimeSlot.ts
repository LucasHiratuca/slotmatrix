import { ValueObject } from '../../../shared/domain/ValueObject';
import { ValidationError } from '../../../shared/domain/errors';

interface TimeSlotProps {
  startAtMs: number;
  endAtMs: number;
}

/**
 * Intervalo semi-aberto [startAt, endAt) em UTC.
 * Implementa álgebra pura de sobreposição e expansão com buffers de preparo/esterilização.
 */
export class TimeSlot extends ValueObject<TimeSlotProps> {
  private constructor(props: TimeSlotProps) {
    super(props);
  }

  static create(startAt: Date, endAt: Date): TimeSlot {
    if (!(startAt instanceof Date) || !(endAt instanceof Date) || Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
      throw new ValidationError('TimeSlot requires valid Date instances');
    }
    if (endAt.getTime() <= startAt.getTime()) {
      throw new ValidationError('TimeSlot endAt must be strictly after startAt');
    }
    return new TimeSlot({ startAtMs: startAt.getTime(), endAtMs: endAt.getTime() });
  }

  static fromDuration(startAt: Date, durationMinutes: number): TimeSlot {
    if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) {
      throw new ValidationError('durationMinutes must be a positive integer');
    }
    return TimeSlot.create(startAt, new Date(startAt.getTime() + durationMinutes * 60_000));
  }

  get startAt(): Date {
    return new Date(this.props.startAtMs);
  }
  get endAt(): Date {
    return new Date(this.props.endAtMs);
  }

  durationMinutes(): number {
    return Math.round((this.props.endAtMs - this.props.startAtMs) / 60_000);
  }

  /** Intervalos semi-abertos [A, B) e [C, D) se sobrepõem se e somente se A < D e C < B. Bordas exatas B === C NÃO colidem. */
  overlapsWith(other: TimeSlot): boolean {
    return this.props.startAtMs < other.props.endAtMs && other.props.startAtMs < this.props.endAtMs;
  }

  contains(other: TimeSlot): boolean {
    return this.props.startAtMs <= other.props.startAtMs && other.props.endAtMs <= this.props.endAtMs;
  }

  /** Expande o intervalo com minutos de preparo antes e minutos de esterilização/turnaround depois. */
  expandWithBuffers(prepMinutes: number, cleanupMinutes: number): TimeSlot {
    if (prepMinutes < 0 || cleanupMinutes < 0 || !Number.isInteger(prepMinutes) || !Number.isInteger(cleanupMinutes)) {
      throw new ValidationError('Buffer minutes must be non-negative integers');
    }
    return new TimeSlot({
      startAtMs: this.props.startAtMs - prepMinutes * 60_000,
      endAtMs: this.props.endAtMs + cleanupMinutes * 60_000,
    });
  }
}
