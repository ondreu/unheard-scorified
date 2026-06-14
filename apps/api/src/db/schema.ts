/**
 * Drizzle schéma. Roste po milnících.
 * M0: health_log. M1: accounts + characters. M2: character_activities + completed_quests.
 * M3: push_subscriptions.
 */
import { relations } from 'drizzle-orm';
import {
  bigint,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import type { ActivityParams, ActivityType, ClassId, Faction, RaceId } from '@game/shared';

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
  gold: integer('gold').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Běžící idle aktivita postavy (M2). Jedna aktivní aktivita na postavu
 * (unique character_id). Průběh i odměny se dopočítávají deterministicky
 * z `start_at` + `seed` (server-authoritative, viz docs/adr/0006).
 */
export const characterActivities = pgTable('character_activities', {
  id: uuid('id').defaultRandom().primaryKey(),
  characterId: uuid('character_id')
    .notNull()
    .unique()
    .references(() => characters.id, { onDelete: 'cascade' }),
  activityType: varchar('activity_type', { length: 16 }).$type<ActivityType>().notNull(),
  params: jsonb('params').$type<ActivityParams>().notNull(),
  startAt: timestamp('start_at', { withTimezone: true }).notNull(),
  durationSec: integer('duration_sec').notNull(),
  // 32-bit unsigned seed (0..4294967295) → přeteče `integer`, proto bigint.
  seed: bigint('seed', { mode: 'number' }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

/** Dokončené story questy postavy (jednorázové; pro prerekvizity a anti-repeat). */
export const completedQuests = pgTable(
  'completed_quests',
  {
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    questId: varchar('quest_id', { length: 48 }).notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.characterId, t.questId] })],
);

/**
 * Web Push subscriptions (M3). Per-účet; jeden účet může mít více
 * subscriptions (různé prohlížeče/zařízení). Endpoint je unikátní identifikátor.
 */
export const pushSubscriptions = pgTable('push_subscriptions', {
  id: uuid('id').defaultRandom().primaryKey(),
  accountId: uuid('account_id')
    .notNull()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  endpoint: text('endpoint').notNull().unique(),
  p256dhKey: text('p256dh_key').notNull(),
  authKey: text('auth_key').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const accountsRelations = relations(accounts, ({ many }) => ({
  characters: many(characters),
  pushSubscriptions: many(pushSubscriptions),
}));

export const charactersRelations = relations(characters, ({ one, many }) => ({
  account: one(accounts, { fields: [characters.accountId], references: [accounts.id] }),
  activity: one(characterActivities),
  completedQuests: many(completedQuests),
}));

export const characterActivitiesRelations = relations(characterActivities, ({ one }) => ({
  character: one(characters, {
    fields: [characterActivities.characterId],
    references: [characters.id],
  }),
}));

export const completedQuestsRelations = relations(completedQuests, ({ one }) => ({
  character: one(characters, {
    fields: [completedQuests.characterId],
    references: [characters.id],
  }),
}));

export const pushSubscriptionsRelations = relations(pushSubscriptions, ({ one }) => ({
  account: one(accounts, {
    fields: [pushSubscriptions.accountId],
    references: [accounts.id],
  }),
}));

export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
export type Character = typeof characters.$inferSelect;
export type NewCharacter = typeof characters.$inferInsert;
export type CharacterActivity = typeof characterActivities.$inferSelect;
export type NewCharacterActivity = typeof characterActivities.$inferInsert;
export type CompletedQuest = typeof completedQuests.$inferSelect;
export type NewCompletedQuest = typeof completedQuests.$inferInsert;
export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type NewPushSubscription = typeof pushSubscriptions.$inferInsert;
