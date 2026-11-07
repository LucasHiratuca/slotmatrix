import { Entity } from '../../../shared/domain/Entity';
import { UniqueEntityId } from '../../../shared/domain/UniqueEntityId';
import { ValidationError } from '../../../shared/domain/errors';

export interface UserProps {
  email: string;
  name: string;
  passwordHash: string;
  createdAt: Date;
}

export class User extends Entity<UserProps> {
  private constructor(props: UserProps, id: UniqueEntityId) {
    super(props, id);
  }
  static create(input: { email: string; name: string; passwordHash: string; now: Date }): User {
    const email = input.email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new ValidationError('Invalid e-mail');
    if (!input.name || input.name.trim().length < 2) throw new ValidationError('Name must have at least 2 chars');
    return new User({ email, name: input.name.trim(), passwordHash: input.passwordHash, createdAt: input.now }, UniqueEntityId.generate());
  }
  static reconstitute(props: UserProps, id: UniqueEntityId): User {
    return new User(props, id);
  }
  get email(): string { return this.props.email; }
  get name(): string { return this.props.name; }
  get passwordHash(): string { return this.props.passwordHash; }
  get createdAt(): Date { return this.props.createdAt; }
}
