import { resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

/**
 * Spustí Drizzle migrace (idempotentní) proti dané DB. Volá se při startu API,
 * aby na čistém Postgresu (např. první deploy na NAS) vznikly tabulky bez
 * ručního zásahu. Migrace jsou přibalené v image ve složce `drizzle/`.
 */
export async function runMigrations(databaseUrl: string): Promise<void> {
  const client = postgres(databaseUrl, { max: 1 });
  try {
    await migrate(drizzle(client), { migrationsFolder: resolve(process.cwd(), 'drizzle') });
  } finally {
    await client.end();
  }
}
