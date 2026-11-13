import { NextFunction, Request, Response } from 'express';

interface BucketEntry {
  count: number;
  resetAt: number;
}

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  bucketName: string;
  keyGenerator?: (req: Request) => string;
}

export function createRateLimiter(opts: RateLimitOptions) {
  const hits = new Map<string, BucketEntry>();

  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    if (hits.size > 5000) {
      for (const [k, v] of hits.entries()) {
        if (now > v.resetAt) hits.delete(k);
      }
    }

    const clientKey = opts.keyGenerator ? opts.keyGenerator(req) : (req.ip || req.socket.remoteAddress || 'unknown');
    const key = `${opts.bucketName}:${clientKey}`;
    const existing = hits.get(key);

    if (!existing || now > existing.resetAt) {
      hits.set(key, { count: 1, resetAt: now + opts.windowMs });
      res.setHeader('X-RateLimit-Limit', String(opts.max));
      res.setHeader('X-RateLimit-Remaining', String(Math.max(0, opts.max - 1)));
      return next();
    }

    existing.count += 1;
    const remaining = Math.max(0, opts.max - existing.count);
    res.setHeader('X-RateLimit-Limit', String(opts.max));
    res.setHeader('X-RateLimit-Remaining', String(remaining));

    if (existing.count > opts.max) {
      const retryAfterSec = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSec));
      return res.status(429).json({
        error: 'RATE_LIMITED',
        message: 'Muitas tentativas em sequência. Aguarde alguns instantes antes de tentar novamente.',
      });
    }

    return next();
  };
}
