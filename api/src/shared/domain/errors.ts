/** Hierarquia rica de exceções de domínio do SlotMatrix (traduzidas pelo Domain Exception Filter). */
export abstract class DomainException extends Error {
  abstract readonly code: string;
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends DomainException {
  readonly code = 'VALIDATION_ERROR';
}
export class UnsafeWebhookUrlError extends DomainException {
  readonly code = 'UNSAFE_WEBHOOK_URL';
}
export class QuotaExceededError extends DomainException {
  readonly code = 'QUOTA_EXCEEDED';
}
export class FeatureNotEntitledError extends DomainException {
  readonly code = 'FEATURE_NOT_ENTITLED';
}
export class ResourceAllocationConflictError extends DomainException {
  readonly code = 'RESOURCE_ALLOCATION_CONFLICT';
}
export class InvalidStateTransitionError extends DomainException {
  readonly code = 'INVALID_STATE_TRANSITION';
}
export class TenantAccessDeniedError extends DomainException {
  readonly code = 'TENANT_ACCESS_DENIED';
}
export class ForbiddenError extends DomainException {
  readonly code = 'FORBIDDEN';
}
export class UnauthorizedError extends DomainException {
  readonly code = 'UNAUTHORIZED';
}
export class NotFoundError extends DomainException {
  readonly code = 'NOT_FOUND';
}
export class ConflictError extends DomainException {
  readonly code = 'CONFLICT';
}
export class LastOwnerRemovalError extends DomainException {
  readonly code = 'LAST_OWNER_REMOVAL';
}
export class BillingOperationError extends DomainException {
  readonly code: string;
  readonly status: number;
  readonly referenceId?: string;

  constructor(code: string, message: string, status: number = 400, referenceId?: string) {
    super(message);
    this.code = code;
    this.status = status;
    this.referenceId = referenceId;
  }
}