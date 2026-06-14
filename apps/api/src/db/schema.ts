/**
 * Drizzle schéma. Roste po milnících.
 * M0: health_log. M1: accounts + characters.
 */
import { relations } from 'drizzle-orm';
import { integer, pgTable, serial, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import type { ClassId, Faction, RaceId } from '@game/shared';

export const healthLog = pgTable('health_log', {
  id: serial('id').primaryKey(),
  note: varchar('note', { length: 255 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const accounts = pgTable('accounts', {
  id: uuid('id').defaultRandom().primaryKey(),
  username: varchar('username', { length: 32 }).notNull().unique(),
  email: varchar('email', { length: 255 }),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const characters = pgTable('characters', {
  id: uuid('id').defaultRandom().primaryKey(),
  accountId: uuid('account_id')
    .notNull()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 16 }).notNull().unique(),
  race: varchar('race', { length: 16 }).$type<RaceId>().notNull(),
  class: varchar('class', { length: 16 }).$type<ClassId>().notNull(),
  faction: varchar('faction', { length: 16 }).$type<Faction>().notNull(),
  totalXp: integer('total_xp').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const accountsRelations = relations(accounts, ({ many }) => ({
  characters: many(characters),
}));

export const charactersRelations = relations(characters, ({ one }) => ({
  account: one(accounts, { fields: [characters.accountId], references: [accounts.id] }),
}));

export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
export type Character = typeof characters.$inferSelect;
export type NewCharacter = typeof characters.$inferInsert;
