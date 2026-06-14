import { Controller, Get, Inject } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { Redis } from 'ioredis';
import { MAX_LEVEL } from '@game/shared';
import { DB, type Database } from '../db/db.module';
import { REDIS } from '../redis/redis.module';

interface DependencyStatus {
  status: 'up' | 'down';
  error?: string;
}

@Controller('health')
export class HealthController {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  @Get()
  async check(): Promise<{
    status: 'ok' | 'degraded';
    uptime: number;
    maxLevel: number;
    deps: { postgres: DependencyStatus; redis: DependencyStatus };
  }> {
    const postgres = await this.pingPostgres();
    const redis = await this.pingRedis();
    const ok = postgres.status === 'up' && redis.status === 'up';
    return {
      status: ok ? 'ok' : 'degraded',
      uptime: process.uptime(),
      // Sanity check sdíleného balíčku napříč vrstvami.
      maxLevel: MAX_LEVEL,
      deps: { postgres, redis },
    };
  }

  private async pingPostgres(): Promise<DependencyStatus> {
    try {
      await this.db.execute(sql`select 1`);
      return { status: 'up' };
    } catch (err) {
      return { status: 'down', error: (err as Error).message };
    }
  }

  private async pingRedis(): Promise<DependencyStatus> {
    try {
      await this.redis.ping();
      return { status: 'up' };
    } catch (err) {
      return { status: 'down', error: (err as Error).message };
    }
  }
}
