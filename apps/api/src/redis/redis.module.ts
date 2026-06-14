import { Global, Inject, Logger, Module, OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import { loadConfig } from '../config/config';

export const REDIS = Symbol('REDIS_CLIENT');

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      useFactory: () => {
        const { redisUrl } = loadConfig();
        const client = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 });
        // Bez handleru by ioredis vyhazoval "Unhandled error event" při výpadku.
        client.on('error', (err) => Logger.warn(`Redis: ${err.message}`, 'RedisModule'));
        return client;
      },
    },
  ],
  exports: [REDIS],
})
export class RedisModule implements OnModuleDestroy {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async onModuleDestroy(): Promise<void> {
    if (this.redis.status === 'ready' || this.redis.status === 'connecting') {
      await this.redis.quit();
    } else {
      this.redis.disconnect();
    }
  }
}
