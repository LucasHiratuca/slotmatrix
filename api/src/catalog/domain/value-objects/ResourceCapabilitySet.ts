import { ValueObject } from '../../../shared/domain/ValueObject';
import { ValidationError } from '../../../shared/domain/errors';

export class ResourceCapabilitySet extends ValueObject<{ tags: ReadonlyArray<string> }> {
  private constructor(tags: string[]) {
    super({ tags: Object.freeze([...tags]) });
  }

  static create(rawTags: string[]): ResourceCapabilitySet {
    if (!Array.isArray(rawTags)) throw new ValidationError('Capability tags must be an array');
    const normalized = Array.from(
      new Set(
        rawTags
          .map((t) => String(t).trim().toLowerCase().replace(/[^a-z0-9-_]+/g, '-').replace(/^-+|-+$/g, ''))
          .filter(Boolean),
      ),
    ).sort();
    return new ResourceCapabilitySet(normalized);
  }

  get tags(): ReadonlyArray<string> {
    return this.props.tags;
  }

  /** Verifica se este recurso possui todas as capabilities exigidas por `required`. */
  satisfies(required: ResourceCapabilitySet): boolean {
    const owned = new Set(this.props.tags);
    return required.tags.every((t) => owned.has(t));
  }
}
