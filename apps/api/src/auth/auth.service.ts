import { ConflictException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import { compare, hash } from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { DB, type Database } from '../db/db.module';
import { accounts } from '../db/schema';
import { loadConfig } from '../config/config';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

interface JwtPayload {
  sub: string;
  username: string;
}

const SALT_ROUNDS = 10;

@Injectable()
export class AuthService {
  private readonly config = loadConfig();

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly jwt: JwtService,
  ) {}

  async register(username: string, password: string, email?: string): Promise<TokenPair> {
    const existing = await this.db
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.username, username))
      .limit(1);
    if (existing.length > 0) {
      throw new ConflictException('Uživatelské jméno je obsazené');
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
      throw new UnauthorizedException('Špatné jméno nebo heslo');
    }

    return this.issueTokens({ sub: account.id, username: account.username });
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.config.jwtSecret,
      });
    } catch {
      throw new UnauthorizedException('Neplatný refresh token');
    }
    return this.issueTokens({ sub: payload.sub, username: payload.username });
  }

  verifyAccessToken(token: string): JwtPayload {
    try {
      return this.jwt.verify<JwtPayload>(token, { secret: this.config.jwtSecret });
    } catch {
      throw new UnauthorizedException('Neplatný token');
    }
  }

  private async issueTokens(payload: JwtPayload): Promise<TokenPair> {
    const expiresIn = (ttl: string): JwtSignOptions['expiresIn'] =>
      ttl as JwtSignOptions['expiresIn'];
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(payload, {
        secret: this.config.jwtSecret,
        expiresIn: expiresIn(this.config.accessTokenTtl),
      }),
      this.jwt.signAsync(payload, {
        secret: this.config.jwtSecret,
        expiresIn: expiresIn(this.config.refreshTokenTtl),
      }),
    ]);
    return { accessToken, refreshToken };
  }
}
