import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { AuthTokenService, PasswordHasher } from '../application/ports';

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
  constructor(private readonly secret: string, private readonly expiresIn: string = '8h') {}
  sign(userId: string): string {
    return jwt.sign({ sub: userId }, this.secret, { expiresIn: this.expiresIn as any });
  }
  verify(token: string): { userId: string } | null {
    try {
      const p = jwt.verify(token, this.secret) as jwt.JwtPayload;
      return typeof p.sub === 'string' ? { userId: p.sub } : null;
    } catch {
      return null;
    }
  }
}
