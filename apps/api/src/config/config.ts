/**
 * Centrální čtení konfigurace z prostředí. Stateless API — žádný stav
 * v procesu, jen napojení na Postgres/Redis (viz docs/adr/0003).
 */
export interface AppConfig {
  port: number;
  databaseUrl: string;
  redisUrl: string;
  nodeEnv: string;
  jwtSecret: string;
  accessTokenTtl: string;
  refreshTokenTtl: string;
  /** Spustit Drizzle migrace při startu (default true; vypni `AUTO_MIGRATE=false`). */
  autoMigrate: boolean;
  /** VAPID klíče pro Web Push (M3). V produkci MUSÍ být nastaveny přes env. */
  vapidPublicKey: string;
  vapidPrivateKey: string;
  /** Mailto pro VAPID „sub" claim (RFC 8292). */
  vapidEmail: string;
  /** Nastavit Secure flag na auth cookies (true v produkci s HTTPS). */
  cookieSecure: boolean;
}

export function loadConfig(): AppConfig {
  return {
    port: Number(process.env.PORT ?? 3000),
    databaseUrl: process.env.DATABASE_URL ?? 'postgres://game:game@localhost:5432/game',
    redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
    nodeEnv: process.env.NODE_ENV ?? 'development',
    // V produkci MUSÍ být nastaveno přes env; default jen pro lokální dev.
    jwtSecret: process.env.JWT_SECRET ?? 'dev-insecure-secret-change-me',
    accessTokenTtl: process.env.ACCESS_TOKEN_TTL ?? '15m',
    refreshTokenTtl: process.env.REFRESH_TOKEN_TTL ?? '30d',
    autoMigrate: process.env.AUTO_MIGRATE !== 'false',
    // VAPID dev klíče — vygenerovat nové pro produkci: `npx web-push generate-vapid-keys`.
    vapidPublicKey:
      process.env.VAPID_PUBLIC_KEY ??
      'BD4MxhV-quKSxofwn3RA_iM7r7DI1hfQcKM7aMJDxNBUtFq54BGAqXmUSNK09GTpysFufxrtOakaK3zrZ6J9HaU',
    vapidPrivateKey:
      process.env.VAPID_PRIVATE_KEY ?? '-d1-ZqhlXcILCrZnCAqgEueXramSBMgo8MdVU2v3bOQ',
    vapidEmail: process.env.VAPID_EMAIL ?? 'mailto:admin@afkto60.local',
    cookieSecure: (process.env.NODE_ENV ?? 'development') === 'production',
  };
}

export const CONFIG = Symbol('APP_CONFIG');
