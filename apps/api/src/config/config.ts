/**
 * Centrální čtení konfigurace z prostředí. Stateless API — žádný stav
 * v procesu, jen napojení na Postgres/Redis (viz docs/adr/0003).
 */
export interface AppConfig {
  port: number;
  databaseUrl: string;
  redisUrl: string;
  nodeEnv: string;
}

export function loadConfig(): AppConfig {
  return {
    port: Number(process.env.PORT ?? 3000),
    databaseUrl: process.env.DATABASE_URL ?? 'postgres://game:game@localhost:5432/game',
    redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
    nodeEnv: process.env.NODE_ENV ?? 'development',
  };
}

export const CONFIG = Symbol('APP_CONFIG');
