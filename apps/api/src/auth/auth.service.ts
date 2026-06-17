import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import { compare, hash } from 'bcryptjs';
import type { Redis } from 'ioredis';
import { eq } from 'drizzle-orm';
import { DB, type Database } from '../db/db.module';
import { REDIS } from '../redis/redis.module';
import { accounts } from '../db/schema';
import { loadConfig } from '../config/config';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  user: { accountId: string; username: string };
}

interface JwtPayload {
  sub: string;
  username: string;
}

interface RefreshPayload extends JwtPayload {
  jti: string;
}

const SALT_ROUNDS = 10;
const REDIS_RT_PREFIX = 'auth:rt:';

/** Parsuje duration string ("15m", "30d", "2h") na sekundy. */
function parseTtlSeconds(ttl: string): number {
  const match = /^(\d+)([smhd])$/.exec(ttl);
  if (!match) return 0;
  const n = parseInt(match[1]!, 10);
  switch (match[2]) {
    case 's': return n;
    case 'm': return n * 60;
    case 'h': return n * 3600;
    case 'd': return n * 86400;
    default: return 0;
  }
}

@Injectable()
export class AuthService {
  private readonly config = loadConfig();

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly jwt: JwtService,
    @Optional() @Inject(REDIS) private readonly redis?: Redis,
  ) {}

  async register(username: string, password: string, email?: string): Promise<TokenPair> {
    const existing = await this.db
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.username, username))
      .limit(1);
    if (existing.length > 0) {
      throw new ConflictException('Username is already taken');
    }

    const passwordHash = await hash(password, SALT_ROUNDS);
    const [account] = await this.db
      .insert(accounts)
      .values({ username, email: email ?? null, passwordHash })
      .returning({ id: accounts.id, username: accounts.username });

    return this.issueTokens({ sub: account!.id, username: account!.username });
  }

  async login(username: string, password: string): Promise<TokenPair> {
    const [account] = await this.db
      .select()
      .from(accounts)
      .where(eq(accounts.username, username))
      .limit(1);

    if (!account || !(await compare(password, account.passwordHash))) {
      throw new UnauthorizedException('Invalid username or password');
    }

    if (account.bannedAt) {
      throw new ForbiddenException('Account is banned');
    }

    return this.issueTokens({ sub: account.id, username: account.username });
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    let payload: RefreshPayload;
    try {
      payload = await this.jwt.verifyAsync<RefreshPayload>(refreshToken, {
        secret: this.config.jwtSecret,
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Ověř a zrotuj JTI v Redisu (pokud je Redis dostupný).
    if (this.redis && payload.jti) {
      const key = `${REDIS_RT_PREFIX}${payload.jti}`;
      const stored = await this.redis.get(key);
      if (!stored) throw new UnauthorizedException('Refresh token revoked or expired');
      await this.redis.del(key);
    }

    return this.issueTokens({ sub: payload.sub, username: payload.username });
  }

  async revokeRefreshJti(refreshToken: string): Promise<void> {
    if (!this.redis) return;
    try {
      const payload = this.jwt.verify<RefreshPayload>(refreshToken, {
        secret: this.config.jwtSecret,
      });
      if (payload.jti) {
        await this.redis.del(`${REDIS_RT_PREFIX}${payload.jti}`);
      }
    } catch {
      // Token neplatný nebo prošlý — není co revoknout.
    }
  }

  verifyAccessToken(token: string): JwtPayload {
    try {
      return this.jwt.verify<JwtPayload>(token, { secret: this.config.jwtSecret });
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
  }

  private async issueTokens(payload: JwtPayload): Promise<TokenPair> {
    const expiresIn = (ttl: string): JwtSignOptions['expiresIn'] =>
      ttl as JwtSignOptions['expiresIn'];
    const jti = randomUUID();
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(payload, {
        secret: this.config.jwtSecret,
        expiresIn: expiresIn(this.config.accessTokenTtl),
      }),
      this.jwt.signAsync({ ...payload, jti }, {
        secret: this.config.jwtSecret,
        expiresIn: expiresIn(this.config.refreshTokenTtl),
      }),
    ]);

    // Ulož JTI do Redisu pro pozdější revokaci (pokud je Redis dostupný).
    if (this.redis) {
      const ttlSec = parseTtlSeconds(this.config.refreshTokenTtl);
      if (ttlSec > 0) {
        await this.redis.setex(`${REDIS_RT_PREFIX}${jti}`, ttlSec, payload.sub);
      }
    }

    return { accessToken, refreshToken, user: { accountId: payload.sub, username: payload.username } };
  }
}
