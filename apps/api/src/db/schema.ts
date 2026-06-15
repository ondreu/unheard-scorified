/**
 * Drizzle schéma. Roste po milnících.
 * M0: health_log. M1: accounts + characters. M2: character_activities + completed_quests.
 * M3: push_subscriptions. M4: character_inventory + character_equipment + character_talents + character_skins.
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
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import type {
  ActivityParams,
  ArenaBracket,
  AuctionDurationId,
  AuctionStatus,
  ClassId,
  CombatActor,
  ActivityType,
  DuelSide,
  ChatChannel,
  Faction,
  FactionId,
  FriendRequestStatus,
  GuildRank,
  LobbyMemberStatus,
  ProfessionId,
  RaceId,
  RaidActor,
  RaidComposition,
  RaidLobbyStatus,
  RaidRole,
} from '@game/shared';

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
  bannedAt: timestamp('banned_at', { withTimezone: true }),
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

/**
 * Inventář postavy (M4). Každý řádek = jeden typ itemu s počtem kusů.
 */
export const characterInventory = pgTable(
  'character_inventory',
  {
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    itemId: varchar('item_id', { length: 64 }).notNull(),
    quantity: integer('quantity').notNull().default(1),
    grantedAt: timestamp('granted_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.characterId, t.itemId] })],
);

/**
 * Equipnuté itemy postavy (M4). Jeden řádek per slot.
 */
export const characterEquipment = pgTable(
  'character_equipment',
  {
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    slot: varchar('slot', { length: 32 }).notNull(),
    itemId: varchar('item_id', { length: 64 }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.characterId, t.slot] })],
);

/**
 * Alokované talent body postavy (M4). Jeden řádek per talent uzel.
 */
export const characterTalents = pgTable(
  'character_talents',
  {
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    talentId: varchar('talent_id', { length: 64 }).notNull(),
    points: integer('points').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.characterId, t.talentId] })],
);

/**
 * Profession skill per postava (M6). Jeden řádek per (postava, profese).
 * Skill 1..MAX_PROFESSION_SKILL; default 1 (postava „umí" všechny profese od startu).
 */
export const characterProfessions = pgTable(
  'character_professions',
  {
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    professionId: varchar('profession_id', { length: 32 }).$type<ProfessionId>().notNull(),
    skill: integer('skill').notNull().default(1),
  },
  (t) => [primaryKey({ columns: [t.characterId, t.professionId] })],
);

/**
 * Reputace postavy s frakcí (M6). Standing 0..MAX_REPUTATION; tier se odvozuje
 * deterministicky v `@game/shared` (reputationTier).
 */
export const characterReputation = pgTable(
  'character_reputation',
  {
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    factionId: varchar('faction_id', { length: 32 }).$type<FactionId>().notNull(),
    standing: integer('standing').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.characterId, t.factionId] })],
);

/**
 * Arena rating per (postava, bracket, sezóna) (M7). Rating se resetuje každou
 * sezónu (nový seasonId → nový řádek s STARTING_RATING). Durable zdroj pravdy
 * pro ladder; Redis sorted set je jen rychlá cache (viz ADR 0010).
 */
export const arenaRatings = pgTable(
  'arena_ratings',
  {
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    bracket: varchar('bracket', { length: 8 }).$type<ArenaBracket>().notNull(),
    seasonId: varchar('season_id', { length: 32 }).notNull(),
    rating: integer('rating').notNull().default(1500),
    wins: integer('wins').notNull().default(0),
    losses: integer('losses').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.characterId, t.bracket, t.seasonId] })],
);

/**
 * Odehraný arénový zápas (M7). Ukládá snapshoty bojových profilů obou stran
 * (anti-cheat + determinismus — timeline se přepočítá z `seed` + snapshotů,
 * stejně jako dungeon). Perspektiva „já vs soupeř" se odvodí podle toho, zda je
 * postava strana A nebo B.
 */
export const arenaMatches = pgTable('arena_matches', {
  id: uuid('id').defaultRandom().primaryKey(),
  seasonId: varchar('season_id', { length: 32 }).notNull(),
  bracket: varchar('bracket', { length: 8 }).$type<ArenaBracket>().notNull(),
  aCharacterId: uuid('a_character_id')
    .notNull()
    .references(() => characters.id, { onDelete: 'cascade' }),
  bCharacterId: uuid('b_character_id')
    .notNull()
    .references(() => characters.id, { onDelete: 'cascade' }),
  aSnapshot: jsonb('a_snapshot').$type<CombatActor>().notNull(),
  bSnapshot: jsonb('b_snapshot').$type<CombatActor>().notNull(),
  seed: bigint('seed', { mode: 'number' }).notNull(),
  winner: varchar('winner', { length: 1 }).$type<DuelSide>().notNull(),
  durationSec: integer('duration_sec').notNull(),
  aRatingBefore: integer('a_rating_before').notNull(),
  aRatingAfter: integer('a_rating_after').notNull(),
  bRatingBefore: integer('b_rating_before').notNull(),
  bRatingAfter: integer('b_rating_after').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Archivovaný výsledek sezóny + udělená odměna (M7). Vzniká LAZY při prvním
 * dotazu postavy po skončení sezóny (idempotentní díky PK → žádné dvojité
 * udělení). Reset ratingu = nový řádek v `arena_ratings` pro novou sezónu.
 */
export const arenaSeasonRewards = pgTable(
  'arena_season_rewards',
  {
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    seasonId: varchar('season_id', { length: 32 }).notNull(),
    bracket: varchar('bracket', { length: 8 }).$type<ArenaBracket>().notNull(),
    finalRating: integer('final_rating').notNull(),
    finalTier: varchar('final_tier', { length: 16 }).notNull(),
    rewardGold: integer('reward_gold').notNull(),
    claimedAt: timestamp('claimed_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.characterId, t.seasonId, t.bracket] })],
);

/**
 * Odehraný **group PVE run** (M8, rozšířeno M8.5-B). Sdílená tabulka pro raid
 * i dungeon (`contentType`): ukládá snapshot celé party (`RaidActor[]`, vč. NPC
 * backfillu) + seed → timeline se přepočítá deterministicky (anti-cheat). Resolve
 * je okamžitý (idle-first), `durationSec` slouží k reveal combat logu. Účast a
 * odměny jsou v `raid_run_participants`.
 */
export const raidRuns = pgTable('raid_runs', {
  id: uuid('id').defaultRandom().primaryKey(),
  /** 'raid' | 'dungeon' (druh group PVE obsahu). */
  contentType: varchar('content_type', { length: 16 }).notNull().default('raid'),
  /** Id obsahu (raidId nebo dungeonId). */
  raidId: varchar('raid_id', { length: 32 }).notNull(),
  /** Snapshot celé party (pořadí = pořadí v simulaci). */
  party: jsonb('party').$type<RaidActor[]>().notNull(),
  seed: bigint('seed', { mode: 'number' }).notNull(),
  victory: integer('victory').notNull(),
  durationSec: integer('duration_sec').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Účast postavy v raid runu + udělená odměna (M8). Jeden řádek per (run, postava).
 * Reální hráči (iniciátor + vytažení z fronty); NPC backfill se zde NEukládá.
 * Odměna se uděluje při resolve (okamžitě, deterministicky) — `rewardClaimedAt`
 * je čas udělení (pro „nově získáno" banner v UI).
 */
export const raidRunParticipants = pgTable(
  'raid_run_participants',
  {
    raidRunId: uuid('raid_run_id')
      .notNull()
      .references(() => raidRuns.id, { onDelete: 'cascade' }),
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    role: varchar('role', { length: 8 }).$type<RaidRole>().notNull(),
    /** True, pokud postava raid sama iniciovala (vs vytažena z fronty). */
    initiator: integer('initiator').notNull().default(0),
    rewardXp: integer('reward_xp').notNull().default(0),
    rewardGold: integer('reward_gold').notNull().default(0),
    rewardItems: jsonb('reward_items').$type<string[]>().notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.raidRunId, t.characterId] })],
);

/**
 * Raid lobby (M8.5-B, ruční formace). Leader sestaví party pro daný raid:
 * `composition` = cílové počty rolí, `size` = velikost. `status` forming →
 * started (po spuštění, `runId` ukáže na `raid_runs`) | cancelled. Členové žijí
 * v `raid_lobby_members`. Odemčeno M9 social (pozvánky přes friends/guild).
 */
export const raidLobbies = pgTable('raid_lobbies', {
  id: uuid('id').defaultRandom().primaryKey(),
  raidId: varchar('raid_id', { length: 32 }).notNull(),
  leaderCharacterId: uuid('leader_character_id')
    .notNull()
    .references(() => characters.id, { onDelete: 'cascade' }),
  size: integer('size').notNull(),
  composition: jsonb('composition').$type<RaidComposition>().notNull(),
  status: varchar('status', { length: 12 }).$type<RaidLobbyStatus>().notNull().default('forming'),
  runId: uuid('run_id').references(() => raidRuns.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Člen raid lobby (M8.5-B). `status` invited (čeká na potvrzení) | joined.
 * Leader je řádek se statusem `joined`. Roli si nese každý člen. Jedna postava
 * je v daném lobby nejvýše jednou (PK), aktivní členství napříč lobby hlídá service.
 */
export const raidLobbyMembers = pgTable(
  'raid_lobby_members',
  {
    lobbyId: uuid('lobby_id')
      .notNull()
      .references(() => raidLobbies.id, { onDelete: 'cascade' }),
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    role: varchar('role', { length: 8 }).$type<RaidRole>().notNull(),
    status: varchar('status', { length: 8 }).$type<LobbyMemberStatus>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.lobbyId, t.characterId] })],
);

/**
 * Auction House listing (M8, ekonomika). Hráčský obchod: buyout + bidding
 * s depositem (gold sink) a AH cut. Item se při výpisu „escrowuje" (odebere
 * z inventáře prodejce); aktuální bid escrowuje zlato kupce. Vypořádání je
 * LAZY (zdroj pravdy) + best-effort BullMQ job na expiraci. Viz ADR 0012.
 */
export const auctions = pgTable('auctions', {
  id: uuid('id').defaultRandom().primaryKey(),
  sellerCharacterId: uuid('seller_character_id')
    .notNull()
    .references(() => characters.id, { onDelete: 'cascade' }),
  sellerAccountId: uuid('seller_account_id')
    .notNull()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  itemId: varchar('item_id', { length: 64 }).notNull(),
  quantity: integer('quantity').notNull(),
  startBid: integer('start_bid').notNull(),
  buyout: integer('buyout'),
  currentBid: integer('current_bid'),
  bidderCharacterId: uuid('bidder_character_id').references(() => characters.id, {
    onDelete: 'set null',
  }),
  bidderAccountId: uuid('bidder_account_id').references(() => accounts.id, { onDelete: 'set null' }),
  deposit: integer('deposit').notNull(),
  duration: varchar('duration', { length: 8 }).$type<AuctionDurationId>().notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  status: varchar('status', { length: 12 }).$type<AuctionStatus>().notNull().default('active'),
  /** Vítěz (kupec) a finální cena po vypořádání. */
  winnerCharacterId: uuid('winner_character_id').references(() => characters.id, {
    onDelete: 'set null',
  }),
  finalPrice: integer('final_price'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  settledAt: timestamp('settled_at', { withTimezone: true }),
});

/**
 * Týdenní lockout per postava (M8.6, ekonomika). Jeden řádek = postava je „saved"
 * pro daný obsah (`lockoutId`, např. `raid:molten_core`) v daném UTC týdnu
 * (`weekId`, `YYYY-MM-DD` pondělí). Řádek vzniká při **prvním vítězném** runu
 * obsahu v týdnu; další clear téhož obsahu v témže týdnu pak odměnu nedá. Reset
 * = nový `weekId` (deterministicky dle UTC týdne). Viz ADR 0015.
 */
export const characterLockouts = pgTable(
  'character_lockouts',
  {
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    /** Klíč obsahu: `"<typ>:<contentId>"` (raid/dungeon namespace). */
    lockoutId: varchar('lockout_id', { length: 48 }).notNull(),
    /** UTC týden (`YYYY-MM-DD` pondělí). */
    weekId: varchar('week_id', { length: 16 }).notNull(),
    acquiredAt: timestamp('acquired_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.characterId, t.lockoutId, t.weekId] })],
);

/**
 * Přátelství mezi postavami (M9 social). Jeden řádek = vztah (requester ↔
 * addressee), ne dva směrové. `status`:
 *  - `pending` — `requester` poslal žádost, `addressee` ji ještě nepotvrdil.
 *  - `accepted` — vzájemné přátelství.
 * Odmítnutí žádosti = smazání řádku (žádný `declined` stav). Unikátní pár
 * (requester, addressee) brání duplicitním žádostem stejným směrem; opačný směr
 * řeší service (auto-accept při vzájemné žádosti). Friends jsou per-postava
 * (vanilla-WoW styl) — připraveno na pozdější pozvánky do týmových arén/raidů.
 */
export const friendships = pgTable(
  'friendships',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    requesterCharacterId: uuid('requester_character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    addresseeCharacterId: uuid('addressee_character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    status: varchar('status', { length: 12 }).$type<FriendRequestStatus>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    respondedAt: timestamp('responded_at', { withTimezone: true }),
  },
  (t) => [unique().on(t.requesterCharacterId, t.addresseeCharacterId)],
);

/**
 * Chat zprávy (M9 social). Jednoduchý persistovaný chat: jeden řádek = jedna
 * zpráva v kanálu (zatím jen `global`). Jméno odesílatele je **denormalizované**
 * (`senderName`), aby historie šla vykreslit bez joinu i po smazání postavy
 * (`senderCharacterId` → set null). Realtime fan-out přes Redis pub/sub adaptér
 * (M7); tato tabulka je durable historie. Viz ADR 0016.
 */
export const chatMessages = pgTable('chat_messages', {
  id: uuid('id').defaultRandom().primaryKey(),
  channel: varchar('channel', { length: 16 }).$type<ChatChannel>().notNull(),
  senderCharacterId: uuid('sender_character_id').references(() => characters.id, {
    onDelete: 'set null',
  }),
  senderName: varchar('sender_name', { length: 16 }).notNull(),
  body: varchar('body', { length: 256 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Guilda (M9 social). Per-postava (jako friends). Jméno globálně unikátní.
 * `leaderCharacterId` je redundantní s `guild_members.rank='leader'`, ale drží
 * rychlý odkaz na vůdce. Disband = smazání řádku (cascade members + invites).
 */
export const guilds = pgTable('guilds', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 24 }).notNull().unique(),
  leaderCharacterId: uuid('leader_character_id')
    .notNull()
    .references(() => characters.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Členství v guildě (M9 social). `characterId` je **unikátní** → postava je
 * nejvýše v jedné guildě. Rank member/officer/leader (viz `@game/shared/guild`).
 */
export const guildMembers = pgTable('guild_members', {
  guildId: uuid('guild_id')
    .notNull()
    .references(() => guilds.id, { onDelete: 'cascade' }),
  characterId: uuid('character_id')
    .notNull()
    .unique()
    .references(() => characters.id, { onDelete: 'cascade' }),
  rank: varchar('rank', { length: 8 }).$type<GuildRank>().notNull().default('member'),
  joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Pozvánka do guildy (M9 social). Čekající pozvánka pro postavu (`characterId`);
 * přijetí ji smaže a založí členství, odmítnutí jen smaže. Unikátní pár
 * (guild, character) brání duplicitám.
 */
export const guildInvites = pgTable(
  'guild_invites',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    guildId: uuid('guild_id')
      .notNull()
      .references(() => guilds.id, { onDelete: 'cascade' }),
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    invitedByCharacterId: uuid('invited_by_character_id').references(() => characters.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [unique().on(t.guildId, t.characterId)],
);

/**
 * Kosmetická vlastnictví skinů per účet (M4). Základ pro transmog systém.
 */
export const characterSkins = pgTable(
  'character_skins',
  {
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    skinId: varchar('skin_id', { length: 64 }).notNull(),
    acquiredAt: timestamp('acquired_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.accountId, t.skinId] })],
);

export const accountsRelations = relations(accounts, ({ many }) => ({
  characters: many(characters),
  pushSubscriptions: many(pushSubscriptions),
  skins: many(characterSkins),
}));

export const charactersRelations = relations(characters, ({ one, many }) => ({
  account: one(accounts, { fields: [characters.accountId], references: [accounts.id] }),
  activity: one(characterActivities),
  completedQuests: many(completedQuests),
  inventory: many(characterInventory),
  equipment: many(characterEquipment),
  talents: many(characterTalents),
  professions: many(characterProfessions),
  reputation: many(characterReputation),
  arenaRatings: many(arenaRatings),
}));

export const raidRunsRelations = relations(raidRuns, ({ many }) => ({
  participants: many(raidRunParticipants),
}));

export const raidRunParticipantsRelations = relations(raidRunParticipants, ({ one }) => ({
  run: one(raidRuns, { fields: [raidRunParticipants.raidRunId], references: [raidRuns.id] }),
  character: one(characters, {
    fields: [raidRunParticipants.characterId],
    references: [characters.id],
  }),
}));

export const arenaRatingsRelations = relations(arenaRatings, ({ one }) => ({
  character: one(characters, {
    fields: [arenaRatings.characterId],
    references: [characters.id],
  }),
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

export const characterInventoryRelations = relations(characterInventory, ({ one }) => ({
  character: one(characters, {
    fields: [characterInventory.characterId],
    references: [characters.id],
  }),
}));

export const characterEquipmentRelations = relations(characterEquipment, ({ one }) => ({
  character: one(characters, {
    fields: [characterEquipment.characterId],
    references: [characters.id],
  }),
}));

export const characterTalentsRelations = relations(characterTalents, ({ one }) => ({
  character: one(characters, {
    fields: [characterTalents.characterId],
    references: [characters.id],
  }),
}));

export const characterSkinsRelations = relations(characterSkins, ({ one }) => ({
  account: one(accounts, {
    fields: [characterSkins.accountId],
    references: [accounts.id],
  }),
}));

export const characterProfessionsRelations = relations(characterProfessions, ({ one }) => ({
  character: one(characters, {
    fields: [characterProfessions.characterId],
    references: [characters.id],
  }),
}));

export const characterReputationRelations = relations(characterReputation, ({ one }) => ({
  character: one(characters, {
    fields: [characterReputation.characterId],
    references: [characters.id],
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
export type CharacterInventory = typeof characterInventory.$inferSelect;
export type NewCharacterInventory = typeof characterInventory.$inferInsert;
export type CharacterEquipment = typeof characterEquipment.$inferSelect;
export type NewCharacterEquipment = typeof characterEquipment.$inferInsert;
export type CharacterTalent = typeof characterTalents.$inferSelect;
export type NewCharacterTalent = typeof characterTalents.$inferInsert;
export type CharacterSkin = typeof characterSkins.$inferSelect;
export type NewCharacterSkin = typeof characterSkins.$inferInsert;
export type CharacterProfession = typeof characterProfessions.$inferSelect;
export type NewCharacterProfession = typeof characterProfessions.$inferInsert;
export type CharacterReputation = typeof characterReputation.$inferSelect;
export type NewCharacterReputation = typeof characterReputation.$inferInsert;
export type ArenaRating = typeof arenaRatings.$inferSelect;
export type NewArenaRating = typeof arenaRatings.$inferInsert;
export type ArenaMatch = typeof arenaMatches.$inferSelect;
export type NewArenaMatch = typeof arenaMatches.$inferInsert;
export type ArenaSeasonReward = typeof arenaSeasonRewards.$inferSelect;
export type NewArenaSeasonReward = typeof arenaSeasonRewards.$inferInsert;
export type RaidRun = typeof raidRuns.$inferSelect;
export type NewRaidRun = typeof raidRuns.$inferInsert;
export type RaidRunParticipant = typeof raidRunParticipants.$inferSelect;
export type NewRaidRunParticipant = typeof raidRunParticipants.$inferInsert;
export type Auction = typeof auctions.$inferSelect;
export type NewAuction = typeof auctions.$inferInsert;
export type CharacterLockout = typeof characterLockouts.$inferSelect;
export type NewCharacterLockout = typeof characterLockouts.$inferInsert;
export type Friendship = typeof friendships.$inferSelect;
export type NewFriendship = typeof friendships.$inferInsert;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type NewChatMessage = typeof chatMessages.$inferInsert;
export type RaidLobby = typeof raidLobbies.$inferSelect;
export type NewRaidLobby = typeof raidLobbies.$inferInsert;
export type RaidLobbyMember = typeof raidLobbyMembers.$inferSelect;
export type NewRaidLobbyMember = typeof raidLobbyMembers.$inferInsert;
export type Guild = typeof guilds.$inferSelect;
export type NewGuild = typeof guilds.$inferInsert;
export type GuildMember = typeof guildMembers.$inferSelect;
export type NewGuildMember = typeof guildMembers.$inferInsert;
export type GuildInvite = typeof guildInvites.$inferSelect;
export type NewGuildInvite = typeof guildInvites.$inferInsert;
