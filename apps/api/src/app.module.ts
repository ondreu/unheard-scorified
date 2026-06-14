import { Module } from '@nestjs/common';
import { DbModule } from './db/db.module';
import { HealthModule } from './health/health.module';
import { RedisModule } from './redis/redis.module';

/**
 * Kořenový modul. Každý herní systém bude přidán jako vlastní feature modul
 * (viz docs konvence). Globální infrastruktura: DB, Redis.
 */
@Module({
  imports: [DbModule, RedisModule, HealthModule],
})
export class AppModule {}
