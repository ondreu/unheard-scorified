/**
 * Drizzle schéma. Roste po milnících.
 * M0: health_log. M1: accounts + characters. M2: character_activities + completed_quests.
 * M3: push_subscriptions. M4: character_inventory + character_equipment + character_talents + character_skins.
 */
import { relations } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  boolean,
  index,
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
  GroupMemberStatus,
  GuildRank,
  ProfessionId,
  RaceId,
  RaidActor,
  RaidRole,
  RotationRule,
  TradeSide,
  TradeStatus,
  GauntletRunState,
  GauntletStatus,
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
  // Kosmeticky zvolený („active") mount (M10+). Power je odvozený z vlastněných
  // mountů (character_mounts), tahle volba je čistě vizuál → monetizace skinů.
  activeMountId: varchar('active_mount_id', { length: 64 }),
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
 * Odehraný týmový arénový zápas (M8.5-C, 3v3/5v5). Ukládá snapshoty obou týmů
 * (`CombatActor[]`) + seed → timeline se přepočítá deterministicky
 * (`simulateTeamFight`), stejně jako 1v1 `arena_matches`. `*MemberIds` drží
 * pořadí postav pro perspektivu „můj tým / soupeř". Rating se ukládá do
 * `arena_ratings` (per postava per bracket). Týmy jsou ad-hoc (per zápas).
 */
export const arenaTeamMatches = pgTable('arena_team_matches', {
  id: uuid('id').defaultRandom().primaryKey(),
  seasonId: varchar('season_id', { length: 32 }).notNull(),
  bracket: varchar('bracket', { length: 8 }).$type<ArenaBracket>().notNull(),
  aMembers: jsonb('a_members').$type<CombatActor[]>().notNull(),
  bMembers: jsonb('b_members').$type<CombatActor[]>().notNull(),
  aMemberIds: jsonb('a_member_ids').$type<string[]>().notNull(),
  bMemberIds: jsonb('b_member_ids').$type<string[]>().notNull(),
  seed: bigint('seed', { mode: 'number' }).notNull(),
  winner: varchar('winner', { length: 1 }).$type<DuelSide>().notNull(),
  durationSec: integer('duration_sec').notNull(),
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
 * Trvalá skupina (party) — M9 social (ADR 0022). Leader + členové; přežívá mezi
 * aktivitami a spouští dungeon/raid/arénu (jeden formační systém místo raid lobby
 * + ruční team arény). Členové žijí v `group_members`.
 */
export const groups = pgTable('groups', {
  id: uuid('id').defaultRandom().primaryKey(),
  leaderCharacterId: uuid('leader_character_id')
    .notNull()
    .references(() => characters.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Člen skupiny (M9). `status` invited (čeká na potvrzení) | joined. Leader je
 * řádek se statusem `joined`. `role` = PVE role (tank/heal/dps; aréna ji
 * ignoruje). Postava je v dané skupině nejvýše jednou (PK); nejvýše jedno
 * `joined` členství napříč skupinami hlídá service.
 */
export const groupMembers = pgTable(
  'group_members',
  {
    groupId: uuid('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    role: varchar('role', { length: 8 }).$type<RaidRole>().notNull(),
    // 16 kvůli statusu 'requested' (M9 group join requests).
    status: varchar('status', { length: 16 }).$type<GroupMemberStatus>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.groupId, t.characterId] })],
);

/**
 * P2P trade session (M8.5-D). Přímá výměna mezi dvěma postavami: `open` →
 * completed | cancelled. Nabídka každé strany = zlato (sloupec) + položky
 * (`trade_items`). Potvrzení obou stran (`*_confirmed`) spustí atomickou výměnu;
 * jakákoli změna nabídky potvrzení resetuje. Žádný escrow během vyjednávání —
 * vlastnictví se ověří a převede až při provedení. Viz ADR 0019.
 */
export const trades = pgTable('trades', {
  id: uuid('id').defaultRandom().primaryKey(),
  initiatorCharacterId: uuid('initiator_character_id')
    .notNull()
    .references(() => characters.id, { onDelete: 'cascade' }),
  partnerCharacterId: uuid('partner_character_id')
    .notNull()
    .references(() => characters.id, { onDelete: 'cascade' }),
  initiatorGold: integer('initiator_gold').notNull().default(0),
  partnerGold: integer('partner_gold').notNull().default(0),
  initiatorConfirmed: integer('initiator_confirmed').notNull().default(0),
  partnerConfirmed: integer('partner_confirmed').notNull().default(0),
  status: varchar('status', { length: 12 }).$type<TradeStatus>().notNull().default('open'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
});

/**
 * Položka v nabídce trade (M8.5-D). Jeden řádek = stack itemu nabídnutý jednou
 * stranou. `side` = která strana item nabízí.
 */
export const tradeItems = pgTable(
  'trade_items',
  {
    tradeId: uuid('trade_id')
      .notNull()
      .references(() => trades.id, { onDelete: 'cascade' }),
    side: varchar('side', { length: 10 }).$type<TradeSide>().notNull(),
    itemId: varchar('item_id', { length: 64 }).notNull(),
    quantity: integer('quantity').notNull(),
  },
  (t) => [primaryKey({ columns: [t.tradeId, t.side, t.itemId] })],
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
 * Nákupy NPC listingů na Auction House (M10+ „živá aukce"). NPC nabídky se
 * **negenerují do `auctions`** — počítají se deterministicky z časového okna
 * (`@game/shared/npc-auction`). Tady evidujeme jen **provedené nákupy**, aby
 * (a) hráč nekoupil tentýž listing dvakrát (unique), (b) zmizel mu z výpisu.
 * Stará okna zůstanou jako neškodný historický záznam.
 */
export const npcAuctionPurchases = pgTable(
  'npc_auction_purchases',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    /** `npc:<windowId>:<index>` — viz `@game/shared/npc-auction`. */
    listingId: varchar('listing_id', { length: 48 }).notNull(),
    itemId: varchar('item_id', { length: 64 }).notNull(),
    quantity: integer('quantity').notNull(),
    price: integer('price').notNull(),
    boughtAt: timestamp('bought_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [unique().on(t.characterId, t.listingId)],
);

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
export const chatMessages = pgTable(
  'chat_messages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    channel: varchar('channel', { length: 16 }).$type<ChatChannel>().notNull(),
    // Scope kanálu (M9 chat overhaul): guildId pro `guild` kanál, NULL pro `global`.
    // Drží historii guild chatu oddělenou per guilda. Bez FK reference (úmyslně
    // generický scope — kanál je datový atribut, snadno přidat další scoped kanály).
    scopeId: uuid('scope_id'),
    senderCharacterId: uuid('sender_character_id').references(() => characters.id, {
      onDelete: 'set null',
    }),
    senderName: varchar('sender_name', { length: 16 }).notNull(),
    body: varchar('body', { length: 256 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('chat_messages_channel_scope_idx').on(t.channel, t.scopeId, t.createdAt)],
);

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
  // Zpráva dne (MOTD, M9 social follow-up) — nastavuje officer+; NULL = žádná.
  motd: varchar('motd', { length: 200 }),
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
 * Guild charter (vanilla-WoW styl založení). Zakladatel vytvoří charter (zaplatí
 * zlatý poplatek), pak sbírá podpisy od jiných postav. S dostatkem podpisů (viz
 * `@game/shared` GUILD_CHARTER_SIGNATURES_REQUIRED) může guildu založit → charter
 * se smaže (cascade podpisy). `founderCharacterId` unikátní = jeden charter na
 * postavu; `name` unikátní (rezervuje jméno guildy stejně jako `guilds.name`).
 */
export const guildCharters = pgTable('guild_charters', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 24 }).notNull().unique(),
  founderCharacterId: uuid('founder_character_id')
    .notNull()
    .unique()
    .references(() => characters.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Podpis charteru (M9). Řádek = pozvánka k podpisu pro postavu (`characterId`);
 * `signed=false` = čekající žádost, `signed=true` = podepsáno. Unikátní pár
 * (charter, character) brání duplicitám. Počítají se jen `signed=true`.
 */
export const guildCharterSignatures = pgTable(
  'guild_charter_signatures',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    charterId: uuid('charter_id')
      .notNull()
      .references(() => guildCharters.id, { onDelete: 'cascade' }),
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    signed: boolean('signed').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [unique().on(t.charterId, t.characterId)],
);

/**
 * Pošta (M9). Offline doručitelná zpráva mezi postavami (whisper je jen online).
 * Může nést **přílohy**: itemy (`mail_items`) a zlato — escrow ze sendera při
 * odeslání, příjemce si je vyzvedne (`claimed`). `fromName` je snapshot (přežije
 * přejmenování/smazání odesílatele). Systémová pošta má `fromCharacterId=null`.
 */
export const mail = pgTable('mail', {
  id: uuid('id').defaultRandom().primaryKey(),
  toCharacterId: uuid('to_character_id')
    .notNull()
    .references(() => characters.id, { onDelete: 'cascade' }),
  fromCharacterId: uuid('from_character_id').references(() => characters.id, {
    onDelete: 'set null',
  }),
  fromName: varchar('from_name', { length: 16 }).notNull(),
  subject: varchar('subject', { length: 64 }).notNull(),
  body: varchar('body', { length: 512 }).notNull().default(''),
  gold: integer('gold').notNull().default(0),
  readAt: timestamp('read_at', { withTimezone: true }),
  claimed: boolean('claimed').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

/** Přílohy pošty (itemy). Escrow při odeslání, do inventáře při vyzvednutí. */
export const mailItems = pgTable('mail_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  mailId: uuid('mail_id')
    .notNull()
    .references(() => mail.id, { onDelete: 'cascade' }),
  itemId: varchar('item_id', { length: 64 }).notNull(),
  quantity: integer('quantity').notNull(),
});

/**
 * Nárokované achievementy postavy (M9). Jeden řádek = postava si vyzvedla odměnu
 * za achievement (`achievementId` z `@game/shared` katalogu). Splnění se odvozuje
 * lazy z herního stavu; tady se drží jen fakt vyzvednutí (jednorázová odměna).
 */
export const characterAchievements = pgTable(
  'character_achievements',
  {
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    achievementId: varchar('achievement_id', { length: 48 }).notNull(),
    claimedAt: timestamp('claimed_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.characterId, t.achievementId] })],
);

/**
 * Vyzvednuté denní/týdenní cíle (M9). PK = (postava, cíl, období) → cíl jde
 * splnit znovu v dalším období (`periodId` = UTC den / pondělí). `goalId` z
 * `@game/shared` katalogu. Splnění se odvozuje lazy z herního stavu v období.
 */
export const characterGoalClaims = pgTable(
  'character_goal_claims',
  {
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    goalId: varchar('goal_id', { length: 48 }).notNull(),
    periodId: varchar('period_id', { length: 16 }).notNull(),
    claimedAt: timestamp('claimed_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.characterId, t.goalId, t.periodId] })],
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
  mounts: many(characterMounts),
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

/**
 * Vlastněné mounty per postava (M10+ FEAT). Mount dává speed bonus (zkrácení
 * pohybových aktivit) — viz `@game/shared/data/mounts`. Power je odvozený z
 * vlastnictví; `characters.active_mount_id` je jen kosmetická volba vizuálu.
 */
export const characterMounts = pgTable(
  'character_mounts',
  {
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    mountId: varchar('mount_id', { length: 64 }).notNull(),
    acquiredAt: timestamp('acquired_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.characterId, t.mountId] })],
);

export const characterMountsRelations = relations(characterMounts, ({ one }) => ({
  character: one(characters, {
    fields: [characterMounts.characterId],
    references: [characters.id],
  }),
}));

/**
 * Aktivní buffy postavy (M10 consumables). Jeden řádek na spotřebák (PK
 * character+consumable) — opětovné použití obnoví `expiresAt` (refresh, ne
 * stacking). Stat bonus se odvozuje z `CONSUMABLE_BUFFS` (@game/shared), tady
 * jen identita + expirace. Prošlé buffy se lazy filtrují/mažou při čtení.
 */
export const characterBuffs = pgTable(
  'character_buffs',
  {
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    consumableId: varchar('consumable_id', { length: 64 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.characterId, t.consumableId] })],
);

export const characterBuffsRelations = relations(characterBuffs, ({ one }) => ({
  character: one(characters, {
    fields: [characterBuffs.characterId],
    references: [characters.id],
  }),
}));

/**
 * Vložené batohy (M10 limited inventory). Jeden řádek na bag slot (PK
 * character+slotIndex, 0..BAG_SLOT_COUNT-1). Přidaná kapacita se odvozuje z
 * `bagSlots(bagId)` (@game/shared).
 */
export const characterBags = pgTable(
  'character_bags',
  {
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    slotIndex: integer('slot_index').notNull(),
    bagId: varchar('bag_id', { length: 64 }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.characterId, t.slotIndex] })],
);

/**
 * Banka (M10+ FEAT) — úložiště mimo batoh. Stejný tvar jako `character_inventory`
 * (`itemId` + `quantity`), ale vlastní kapacita (`BASE_BANK_SLOTS`) → uložení
 * uvolní sloty v batohu. Deposit/withdraw přesouvá itemy mezi inventářem a bankou.
 */
export const characterBank = pgTable(
  'character_bank',
  {
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    itemId: varchar('item_id', { length: 64 }).notNull(),
    quantity: integer('quantity').notNull().default(1),
    storedAt: timestamp('stored_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.characterId, t.itemId] })],
);

export const characterBagsRelations = relations(characterBags, ({ one }) => ({
  character: one(characters, {
    fields: [characterBags.characterId],
    references: [characters.id],
  }),
}));

/**
 * Deklarativní rotace postavy (MIL — combat overhaul). Jeden řádek na postavu;
 * `rules` = seřazená pravidla (priorita) `{ abilityId, enabled, conditionType,
 * threshold }`. Chybí-li řádek, engine použije default („always" pro všechny
 * ability) — beze změny chování.
 */
export const characterRotations = pgTable('character_rotations', {
  characterId: uuid('character_id')
    .primaryKey()
    .references(() => characters.id, { onDelete: 'cascade' }),
  rules: jsonb('rules').$type<RotationRule[]>().notNull(),
});

export const characterRotationsRelations = relations(characterRotations, ({ one }) => ({
  character: one(characters, {
    fields: [characterRotations.characterId],
    references: [characters.id],
  }),
}));

/**
 * The Gauntlet (M13) — aktivní tahová minihra. Na rozdíl od idle auto-resolve
 * obsahu je run **stateful**: `state` (JSON) drží kompletní mutabilní průběh
 * (vlna, HP, cooldowny, vybrané drafty, log). `playerSnapshot` = neměnný bojový
 * profil ze vstupu (deterministicky se z něj + draftů odvozuje efektivní actor).
 * Odměna se uděluje až při ukončení runu (smrt/retire/dokončení) — denní strop
 * řeší `gauntlet_daily`.
 */
export const gauntletRuns = pgTable('gauntlet_runs', {
  id: uuid('id').defaultRandom().primaryKey(),
  characterId: uuid('character_id')
    .notNull()
    .references(() => characters.id, { onDelete: 'cascade' }),
  /** Bojový profil postavy při vstupu (snapshot — anti-cheat/determinismus). */
  playerSnapshot: jsonb('player_snapshot').$type<CombatActor>().notNull(),
  level: integer('level').notNull(),
  /** Kompletní mutabilní stav runu (engine `GauntletRunState`). */
  state: jsonb('state').$type<GauntletRunState>().notNull(),
  status: varchar('status', { length: 16 }).$type<GauntletStatus>().notNull(),
  wavesCleared: integer('waves_cleared').notNull().default(0),
  rewardXp: integer('reward_xp').notNull().default(0),
  rewardGold: integer('reward_gold').notNull().default(0),
  rewardItems: jsonb('reward_items').$type<string[]>().notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
});

export const gauntletRunsRelations = relations(gauntletRuns, ({ one }) => ({
  character: one(characters, {
    fields: [gauntletRuns.characterId],
    references: [characters.id],
  }),
}));

/**
 * Denní (UTC) souhrn odměn získaných z Gauntletu — pro denní strop (anti-grind).
 * `dayId` = `YYYY-MM-DD` (UTC). Jeden řádek na postavu a den.
 */
export const gauntletDaily = pgTable(
  'gauntlet_daily',
  {
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    dayId: varchar('day_id', { length: 10 }).notNull(),
    xpEarned: integer('xp_earned').notNull().default(0),
    goldEarned: integer('gold_earned').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.characterId, t.dayId] })],
);

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
export type CharacterBuff = typeof characterBuffs.$inferSelect;
export type NewCharacterBuff = typeof characterBuffs.$inferInsert;
export type CharacterBag = typeof characterBags.$inferSelect;
export type NewCharacterBag = typeof characterBags.$inferInsert;
export type CharacterBankRow = typeof characterBank.$inferSelect;
export type NewCharacterBankRow = typeof characterBank.$inferInsert;
export type CharacterMount = typeof characterMounts.$inferSelect;
export type NewCharacterMount = typeof characterMounts.$inferInsert;
export type CharacterProfession = typeof characterProfessions.$inferSelect;
export type NewCharacterProfession = typeof characterProfessions.$inferInsert;
export type CharacterReputation = typeof characterReputation.$inferSelect;
export type NewCharacterReputation = typeof characterReputation.$inferInsert;
export type ArenaRating = typeof arenaRatings.$inferSelect;
export type NewArenaRating = typeof arenaRatings.$inferInsert;
export type ArenaMatch = typeof arenaMatches.$inferSelect;
export type NewArenaMatch = typeof arenaMatches.$inferInsert;
export type ArenaTeamMatch = typeof arenaTeamMatches.$inferSelect;
export type NewArenaTeamMatch = typeof arenaTeamMatches.$inferInsert;
export type ArenaSeasonReward = typeof arenaSeasonRewards.$inferSelect;
export type NewArenaSeasonReward = typeof arenaSeasonRewards.$inferInsert;
export type RaidRun = typeof raidRuns.$inferSelect;
export type NewRaidRun = typeof raidRuns.$inferInsert;
export type RaidRunParticipant = typeof raidRunParticipants.$inferSelect;
export type NewRaidRunParticipant = typeof raidRunParticipants.$inferInsert;
export type Auction = typeof auctions.$inferSelect;
export type NewAuction = typeof auctions.$inferInsert;
export type NpcAuctionPurchase = typeof npcAuctionPurchases.$inferSelect;
export type NewNpcAuctionPurchase = typeof npcAuctionPurchases.$inferInsert;
export type CharacterLockout = typeof characterLockouts.$inferSelect;
export type NewCharacterLockout = typeof characterLockouts.$inferInsert;
export type Friendship = typeof friendships.$inferSelect;
export type NewFriendship = typeof friendships.$inferInsert;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type NewChatMessage = typeof chatMessages.$inferInsert;
export type CharacterAchievement = typeof characterAchievements.$inferSelect;
export type NewCharacterAchievement = typeof characterAchievements.$inferInsert;
export type CharacterGoalClaim = typeof characterGoalClaims.$inferSelect;
export type NewCharacterGoalClaim = typeof characterGoalClaims.$inferInsert;
export type Trade = typeof trades.$inferSelect;
export type NewTrade = typeof trades.$inferInsert;
export type TradeItem = typeof tradeItems.$inferSelect;
export type NewTradeItem = typeof tradeItems.$inferInsert;
export type Group = typeof groups.$inferSelect;
export type NewGroup = typeof groups.$inferInsert;
export type GroupMember = typeof groupMembers.$inferSelect;
export type NewGroupMember = typeof groupMembers.$inferInsert;
export type Guild = typeof guilds.$inferSelect;
export type NewGuild = typeof guilds.$inferInsert;
export type GuildMember = typeof guildMembers.$inferSelect;
export type NewGuildMember = typeof guildMembers.$inferInsert;
export type GuildInvite = typeof guildInvites.$inferSelect;
export type NewGuildInvite = typeof guildInvites.$inferInsert;
export type GuildCharter = typeof guildCharters.$inferSelect;
export type NewGuildCharter = typeof guildCharters.$inferInsert;
export type GuildCharterSignature = typeof guildCharterSignatures.$inferSelect;
export type NewGuildCharterSignature = typeof guildCharterSignatures.$inferInsert;
export type Mail = typeof mail.$inferSelect;
export type NewMail = typeof mail.$inferInsert;
export type MailItem = typeof mailItems.$inferSelect;
export type NewMailItem = typeof mailItems.$inferInsert;
export type GauntletRun = typeof gauntletRuns.$inferSelect;
export type NewGauntletRun = typeof gauntletRuns.$inferInsert;
export type GauntletDaily = typeof gauntletDaily.$inferSelect;
export type NewGauntletDaily = typeof gauntletDaily.$inferInsert;

/**
 * Persistentní historie dokončených aktivit: výsledky questů, profesí, dungeonů,
 * raidů a arén v jednom chronologickém feedu (jeden záznam = jedna dokončená
 * aktivita). Zapisuje se při claimu/grantu odměn; čte se na History stránce a
 * nahrává do notifikací. Append-only (žádné mazání kromě kaskády při smazání
 * postavy). `kind` = quest|gather|craft|dungeon|raid|arena; `outcome` =
 * win|loss|victory|defeat|null.
 */
export const characterEventLog = pgTable('character_event_log', {
  id: uuid('id').defaultRandom().primaryKey(),
  characterId: uuid('character_id')
    .notNull()
    .references(() => characters.id, { onDelete: 'cascade' }),
  kind: varchar('kind', { length: 16 }).notNull(),
  title: varchar('title', { length: 160 }).notNull(),
  detail: varchar('detail', { length: 240 }).notNull().default(''),
  outcome: varchar('outcome', { length: 16 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  // Monotónní pořadí zápisu → deterministický tie-break, když dva eventy spadnou
  // do stejného `created_at` (jinak je „nejnovější první" nedefinované).
  seq: bigserial('seq', { mode: 'number' }).notNull(),
});

export type CharacterEventLog = typeof characterEventLog.$inferSelect;
export type NewCharacterEventLog = typeof characterEventLog.$inferInsert;
