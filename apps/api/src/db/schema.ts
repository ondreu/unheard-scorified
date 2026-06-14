/**
 * Drizzle schéma. Roste po milnících (M1: accounts/characters, ...).
 * Pro M0 je zde jen technická tabulka pro ověření migrací/health.
 */
import { pgTable, serial, timestamp, varchar } from 'drizzle-orm/pg-core';

export const healthLog = pgTable('health_log', {
  id: serial('id').primaryKey(),
  note: varchar('note', { length: 255 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
