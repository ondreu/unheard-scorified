import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { CharacterModule } from './character/character.module';
import { DbModule } from './db/db.module';
import { HealthModule } from './health/health.module';
import { RedisModule } from './redis/redis.module';

/**
 * Kořenový modul. Každý herní systém je vlastní feature modul
 * (viz apps/api/CLAUDE.md). Globální infrastruktura: DB, Redis.
 */
@Module({
  imports: [DbModule, RedisModule, HealthModule, AuthModule, CharacterModule],
})
export class AppModule {}
