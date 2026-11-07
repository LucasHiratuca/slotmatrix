import { ValueObject } from '../../../shared/domain/ValueObject';
import { ValidationError } from '../../../shared/domain/errors';

export class WorkspaceSlug extends ValueObject<{ value: string }> {
  private static readonly FORMAT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  private static readonly RESERVED = new Set(['api', 'admin', 'book', 'www', 'app', 'login', 'public']);

  private constructor(value: string) {
    super({ value });
  }

  static fromName(name: string): WorkspaceSlug {
    const normalized = name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);
    return WorkspaceSlug.create(normalized);
  }

  static create(value: string): WorkspaceSlug {
    if (typeof value !== 'string' || value.length < 3 || value.length > 60) {
      throw new ValidationError('WorkspaceSlug must have between 3 and 60 characters');
    }
    if (!WorkspaceSlug.FORMAT.test(value)) {
      throw new ValidationError('WorkspaceSlug must be lowercase alphanumeric separated by single hyphens');
    }
    if (WorkspaceSlug.RESERVED.has(value)) throw new ValidationError(`WorkspaceSlug "${value}" is reserved`);
    return new WorkspaceSlug(value);
  }

  get value(): string {
    return this.props.value;
  }
  toString(): string {
    return this.props.value;
  }
}
