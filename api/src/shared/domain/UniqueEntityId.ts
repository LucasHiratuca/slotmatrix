import { randomUUID } from 'node:crypto';
import { ValidationError } from './errors';

export class UniqueEntityId {
  protected constructor(public readonly value: string) {
    if (!value || typeof value !== 'string') throw new ValidationError('Identifier must be a non-empty string');
  }
  static generate(): UniqueEntityId {
    return new UniqueEntityId(randomUUID());
  }
  static from(value: string): UniqueEntityId {
    return new UniqueEntityId(value);
  }
  equals(other?: UniqueEntityId | null): boolean {
    return !!other && other.value === this.value;
  }
  toString(): string {
    return this.value;
  }
}

export class TenantId extends UniqueEntityId {
  static override generate(): TenantId {
    return new TenantId(randomUUID());
  }
  static override from(value: string): TenantId {
    return new TenantId(value);
  }
}
