import { DomainEvent } from '../domain/DomainEvent';
import { Role } from '../../tenancy/domain/events/tenancy-events';

export interface Clock {
  now(): Date;
}
export const systemClock: Clock = { now: () => new Date() };

export interface UnitOfWork {
  run<T>(work: () => Promise<T>): Promise<T>;
}

export interface EventHandler<E extends DomainEvent = DomainEvent> {
  handle(event: E): Promise<void>;
}

export interface DomainEventDispatcher {
  register(eventName: string, handler: EventHandler<any>): void;
  dispatch(events: DomainEvent[]): Promise<void>;
}

export interface PasswordHasher {
  hash(plain: string): Promise<string>;
  verify(plain: string, hash: string): Promise<boolean>;
}

export interface VerifiedTokenPayload {
  userId: string;
  jti?: string;
  exp?: number;
}

export interface AuthTokenService {
  sign(userId: string): string;
  verify(token: string): VerifiedTokenPayload | null;
  revoke?(token: string): Promise<void> | void;
  isRevoked?(jti: string): Promise<boolean> | boolean;
}

export interface TenantContext {
  userId: string;
  tenantId: string;
  role: Role;
}
