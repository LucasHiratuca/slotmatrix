import { Entity } from '../../../shared/domain/Entity';
import { UniqueEntityId } from '../../../shared/domain/UniqueEntityId';
import { ValidationError } from '../../../shared/domain/errors';

export interface UserProps {
  email: string;
  name: string;
  passwordHash: string;
  resetTokenHash?: string | null;
  resetTokenExpiresAt?: Date | null;
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
    return new User(
      {
        email,
        name: input.name.trim(),
        passwordHash: input.passwordHash,
        resetTokenHash: null,
        resetTokenExpiresAt: null,
        createdAt: input.now,
      },
      UniqueEntityId.generate(),
    );
  }

  static reconstitute(props: UserProps, id: UniqueEntityId): User {
    return new User(props, id);
  }

  get email(): string { return this.props.email; }
  get name(): string { return this.props.name; }
  get passwordHash(): string { return this.props.passwordHash; }
  get resetTokenHash(): string | null | undefined { return this.props.resetTokenHash; }
  get resetTokenExpiresAt(): Date | null | undefined { return this.props.resetTokenExpiresAt; }
  get createdAt(): Date { return this.props.createdAt; }

  requestPasswordReset(tokenHash: string, expiresAt: Date): void {
    if (!tokenHash || tokenHash.trim().length === 0) {
      throw new ValidationError('Invalid reset token hash');
    }
    this.props.resetTokenHash = tokenHash;
    this.props.resetTokenExpiresAt = expiresAt;
  }

  resetPassword(newPasswordHash: string, tokenHash: string, now: Date): void {
    if (!this.props.resetTokenHash || this.props.resetTokenHash !== tokenHash) {
      throw new ValidationError('Invalid or unknown password reset token');
    }
    if (!this.props.resetTokenExpiresAt || now.getTime() > this.props.resetTokenExpiresAt.getTime()) {
      throw new ValidationError('Password reset token has expired');
    }
    this.props.passwordHash = newPasswordHash;
    this.props.resetTokenHash = null;
    this.props.resetTokenExpiresAt = null;
  }
}
