import { ValueObject } from '../../../shared/domain/ValueObject';
import { ValidationError } from '../../../shared/domain/errors';

export interface TurnaroundBufferProps {
  prepMinutes: number;
  cleanupMinutes: number;
}

/**
 * Encapsula os minutos de preparo pré-atendimento e de esterilização/turnaround pós-atendimento
 * exigidos por um requisito de recurso num procedimento.
 */
export class TurnaroundBuffer extends ValueObject<TurnaroundBufferProps> {
  static readonly MAX_BUFFER_MINUTES = 240;

  private constructor(props: TurnaroundBufferProps) {
    super(props);
  }

  static create(prepMinutes = 0, cleanupMinutes = 0): TurnaroundBuffer {
    if (!Number.isInteger(prepMinutes) || !Number.isInteger(cleanupMinutes) || prepMinutes < 0 || cleanupMinutes < 0) {
      throw new ValidationError('TurnaroundBuffer prepMinutes and cleanupMinutes must be non-negative integers');
    }
    if (prepMinutes > TurnaroundBuffer.MAX_BUFFER_MINUTES || cleanupMinutes > TurnaroundBuffer.MAX_BUFFER_MINUTES) {
      throw new ValidationError(`TurnaroundBuffer cannot exceed ${TurnaroundBuffer.MAX_BUFFER_MINUTES} minutes`);
    }
    return new TurnaroundBuffer({ prepMinutes, cleanupMinutes });
  }

  static zero(): TurnaroundBuffer {
    return new TurnaroundBuffer({ prepMinutes: 0, cleanupMinutes: 0 });
  }

  get prepMinutes(): number {
    return this.props.prepMinutes;
  }
  get cleanupMinutes(): number {
    return this.props.cleanupMinutes;
  }
  get totalExtraMinutes(): number {
    return this.props.prepMinutes + this.props.cleanupMinutes;
  }
}
