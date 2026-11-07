import { UniqueEntityId } from './UniqueEntityId';

export abstract class Entity<TProps extends object, TId extends UniqueEntityId = UniqueEntityId> {
  protected props: TProps;
  protected readonly _id: TId;

  protected constructor(props: TProps, id: TId) {
    this.props = props;
    this._id = id;
  }

  get id(): TId {
    return this._id;
  }

  equals(other?: Entity<TProps, TId> | null): boolean {
    return !!other && other._id.equals(this._id);
  }
}
