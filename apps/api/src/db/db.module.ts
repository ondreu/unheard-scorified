import { Global, Module } from '@nestjs/common';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { loadConfig } from '../config/config';
import * as schema from './schema';

export const DB = Symbol('DB');
export type Database = PostgresJsDatabase<typeof schema>;

@Global()
@Module({
  providers: [
    {
      provide: DB,
      useFactory: (): Database => {
        const { databaseUrl } = loadConfig();
        const client = postgres(databaseUrl, { max: 10 });
        return drizzle(client, { schema });
      },
    },
  ],
  exports: [DB],
})
export class DbModule {}
