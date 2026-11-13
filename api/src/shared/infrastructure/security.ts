import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { AuthTokenService, PasswordHasher, VerifiedTokenPayload } from '../application/ports';

export interface TokenRevocationStore {
  revoke(jti: string, expiresAtMs: number): Promise<void> | void;
  isRevoked(jti: string): Promise<boolean> | boolean;
}

export class InMemoryTokenRevocationStore implements TokenRevocationStore {
  private readonly revoked = new Map<string, number>();

  revoke(jti: string, expiresAtMs: number): void {
    this.prune();
    this.revoked.set(jti, expiresAtMs);
  }

  isRevoked(jti: string): boolean {
    const exp = this.revoked.get(jti);
    if (!exp) return false;
    if (Date.now() > exp) {
      this.revoked.delete(jti);
      return false;
    }
    return true;
  }

  private prune(): void {
    const now = Date.now();
    for (const [key, exp] of this.revoked.entries()) {
      if (now > exp) this.revoked.delete(key);
    }
  }
}

export class BcryptPasswordHasher implements PasswordHasher {
  constructor(private readonly rounds = 10) {}
  hash(plain: string) {
    return bcrypt.hash(plain, this.rounds);
  }
  verify(plain: string, hash: string) {
    return bcrypt.compare(plain, hash);
  }
}

export class JwtTokenService implements AuthTokenService {
  constructor(
    private readonly secret: string,
    private readonly expiresIn: string = '8h',
    private readonly revocationStore: TokenRevocationStore = new InMemoryTokenRevocationStore(),
  ) {}

  sign(userId: string): string {
    return jwt.sign({ sub: userId, jti: randomUUID() }, this.secret, {
      algorithm: 'HS256',
      expiresIn: this.expiresIn as any,
    });
  }

  verify(token: string): VerifiedTokenPayload | null {
    try {
      const p = jwt.verify(token, this.secret, { algorithms: ['HS256'] }) as jwt.JwtPayload;
      if (typeof p.sub !== 'string') return null;
      return {
        userId: p.sub,
        jti: typeof p.jti === 'string' ? p.jti : undefined,
        exp: typeof p.exp === 'number' ? p.exp : undefined,
      };
    } catch {
      return null;
    }
  }

  async revoke(token: string): Promise<void> {
    const payload = this.verify(token);
    if (!payload?.jti) return;
    const expMs = payload.exp ? payload.exp * 1000 : Date.now() + 8 * 60 * 60 * 1000;
    await this.revocationStore.revoke(payload.jti, expMs);
  }

  async isRevoked(jti: string): Promise<boolean> {
    return await this.revocationStore.isRevoked(jti);
  }
}
