import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module';
import { loadConfig } from './config/config';
import { runMigrations } from './db/migrate';
import { RedisIoAdapter } from './redis/redis-io.adapter';

async function bootstrap(): Promise<void> {
  const config = loadConfig();

  if (config.autoMigrate) {
    try {
      await runMigrations(config.databaseUrl);
      Logger.log('Migrace aplikovány', 'Bootstrap');
    } catch (err) {
      Logger.error(`Migrace selhaly: ${(err as Error).message}`, 'Bootstrap');
    }
  }

  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );

  // WebSocket (M7): Redis pub/sub adaptér pro multi-instance fan-out.
  const redisIoAdapter = new RedisIoAdapter(app);
  await redisIoAdapter.connectToRedis();
  app.useWebSocketAdapter(redisIoAdapter);

  app.enableShutdownHooks();
  await app.listen(config.port, '0.0.0.0');
  Logger.log(`API běží na portu ${config.port} (${config.nodeEnv})`, 'Bootstrap');
}

void bootstrap();
