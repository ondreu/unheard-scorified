import { Logger, type INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import type { ServerOptions, Server } from 'socket.io';
import { loadConfig } from '../config/config';

/**
 * Socket.IO adaptér se sdíleným Redis pub/sub (M7). Umožňuje horizontální
 * škálování WebSocket vrstvy: `server.to(room).emit` se přes Redis pub/sub
 * rozešle na VŠECHNY instance API → socket připojený k jakékoli instanci
 * obdrží event (stateless API, ADR 0003).
 *
 * Best-effort: když Redis neběží, adaptér se nenasadí a WS funguje single-instance
 * (degradace, ne pád — stejně jako BullMQ scheduler).
 */
export class RedisIoAdapter extends IoAdapter {
  private readonly logger = new Logger(RedisIoAdapter.name);
  private adapterConstructor?: ReturnType<typeof createAdapter>;
  private pubClient?: Redis;
  private subClient?: Redis;

  constructor(app: INestApplicationContext) {
    super(app);
  }

  /** Naváže pub/sub Redis klienty. Volat před `app.listen`. */
  async connectToRedis(): Promise<void> {
    const { redisUrl } = loadConfig();
    try {
      this.pubClient = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 });
      this.subClient = this.pubClient.duplicate();
      this.pubClient.on('error', (err) => this.logger.warn(`Redis pub: ${err.message}`));
      this.subClient.on('error', (err) => this.logger.warn(`Redis sub: ${err.message}`));
      await Promise.all([this.pubClient.connect(), this.subClient.connect()]);
      this.adapterConstructor = createAdapter(this.pubClient, this.subClient);
      this.logger.log('Socket.IO Redis adaptér aktivní (multi-instance)');
    } catch (err) {
      this.logger.warn(
        `Redis adaptér se nenasadil (single-instance fallback): ${(err as Error).message}`,
      );
    }
  }

  override createIOServer(port: number, options?: ServerOptions): Server {
    const server = super.createIOServer(port, options) as Server;
    if (this.adapterConstructor) server.adapter(this.adapterConstructor);
    return server;
  }
}
