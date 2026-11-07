import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import {
  ConflictError,
  DomainException,
  FeatureNotEntitledError,
  ForbiddenError,
  InvalidStateTransitionError,
  LastOwnerRemovalError,
  NotFoundError,
  QuotaExceededError,
  ResourceAllocationConflictError,
  TenantAccessDeniedError,
  UnauthorizedError,
  UnsafeWebhookUrlError,
  ValidationError,
} from '../../shared/domain/errors';

export function statusFor(err: unknown): number {
  if (err instanceof QuotaExceededError || err instanceof FeatureNotEntitledError) return 402;
  if (err instanceof UnsafeWebhookUrlError || err instanceof ValidationError) return 422;
  if (
    err instanceof ResourceAllocationConflictError ||
    err instanceof InvalidStateTransitionError ||
    err instanceof ConflictError ||
    err instanceof LastOwnerRemovalError
  ) {
    return 409;
  }
  if (err instanceof TenantAccessDeniedError || err instanceof ForbiddenError) return 403;
  if (err instanceof UnauthorizedError) return 401;
  if (err instanceof NotFoundError) return 404;
  return 500;
}

export function domainExceptionFilter(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'BAD_REQUEST',
      message: 'Invalid request payload',
      issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }
  if (err instanceof DomainException) {
    return res.status(statusFor(err)).json({ error: err.code, message: err.message });
  }
  if ((err as any)?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'BAD_REQUEST', message: 'Malformed JSON' });
  }
  console.error('[unhandled]', err);
  return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Unexpected error' });
}
