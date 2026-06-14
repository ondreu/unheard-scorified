# System: Leveling & questing (M2)

Stav: implementováno v M2. Zdroj pravdy pro data i vzorce: `packages/shared`.
Architektura: viz `docs/adr/0006-activities-and-questing.md` a `0002-idle-model.md`.

## Idle smyčka (výstup M2)

Vytvoř postavu → pošli ji questovat → na pozadí (i offline) získá XP/zlato →
vrať se, vyber odměny, postava povýší. Server je autorita; web jen zobrazuje
a posílá záměry (start/claim).

## Datový model (Postgres / Drizzle — `apps/api/src/db/schema.ts`)

- **characters**: M2 přidává `gold` (integer, default 0).
- **character_activities**: `id`, `character_id` (fk→characters, cascade, **unique** =
  jedna aktivní aktivita na postavu), `activity_type` (`'quest'`), `params` (jsonb),
  `start_at`, `duration_sec`, `seed` (bigint — 32-bit unsigned), `created_at`.
- **completed_quests**: PK (`character_id`, `quest_id`), `completed_at` — evidence
  dokončených **story** questů (prerekvizity + anti-repeat).

## Leveling (`packages/shared/src/leveling.ts`, `constants.ts`)

- XP křivka `XP_CURVE` (cap 60, záměrně pomalá) z M0 — laditelný parametr.
- `xpForNextLevel(level)`, `totalXpForLevel(level)`, `levelFromTotalXp(totalXp)`.
- Smluvní aliasy (M2): `xpForLevel` (= kumulativní XP na level), `levelFromXp`
  (= jen číslo levelu).
- `applyXpGain(totalXpBefore, xpGained)` → `{ totalXp, levelBefore, levelAfter,
leveledUp, levelsGained }` (level-up po dokončení aktivity).
- Per-level staty řeší `baseStatsFor(race, class, level)` z M1.

## Aktivity & odměny (`packages/shared/src/activity.ts`)

- `ActivityState` = `{ activityType, params, startAt, durationSec, seed }`.
- `activitySeed(characterId, questId, startAtMs)` — server volí seed deterministicky.
- `activityProgress(state, now)` → `{ elapsedSec, remainingSec, progress, completed,
finishesAt }`.
- `computeQuestReward(quest, seed)` — XP fixní; zlato ±`goldVariance` přes `SeededRng`.
- `computeActivityReward(state, now)` — odměna jen je-li dokončeno, jinak `null`.

## Zóny & questy (`packages/shared/src/data/{zones,quests}.ts`)

- **3 level brackety na frakci** (frakce kosmetická — paralelní obsah, stejný balanc):
  - Alliance: Northshire Valley (1–10), Westfall (10–25), Duskwood (25–40).
  - Horde: Durotar (1–10), The Barrens (10–25), Thousand Needles (25–40).
- Zóna má `faction`; frakce questu se odvozuje ze zóny (`questFaction` /
  `ZONES[zoneId].faction`). Postava vidí jen questy své frakce.
- **Questy**: `story` (lineární chain přes `requiresQuest`, jednorázové) + `repeatable`
  (gated levelem/zónou/frakcí). Balanc (doba, odměny) se ladí v datech.
- `availableQuests(level, completedIds, faction)` / `isQuestAvailable(..., faction)` — gating.
- `zonesForFaction(faction)` — zóny dané frakce (pro UI).

## API moduly

- `apps/api/src/quest/` — `GET /characters/:characterId/quests` (dostupné questy).
  `CompletedQuestRepository` (sdílený s activity modulem).
- `apps/api/src/activity/`:
  - `GET /characters/:characterId/activity` — běžící aktivita (lazy průběh) nebo `null`.
  - `POST /characters/:characterId/activity` — start (`{ activityType, questId }`).
  - `POST /characters/:characterId/activity/claim` — vybrání odměn (XP/zlato + level-up).
  - `ActivityScheduler` (BullMQ) — delayed job na dokončení; M2 jen log, M3 push.
    Best-effort: bez Redisu smyčka funguje přes lazy dopočet.

## Web (`apps/web/src/routes/characters/[id]/`)

- `+page.svelte` — character sheet + panel aktivity (živý odpočet, claim, level-up banner).
- `quests/+page.svelte` — seznam dostupných questů, „Send" → start aktivity.
- Herní stringy anglicky, oddělené od logiky (`ui` objekt) pro pozdější i18n.

## Testy

- `packages/shared`: unit testy vzorců (leveling aliasy + applyXpGain, activity
  progress/reward determinismus, quest gating).
- `apps/api`: integrační flow přes **pglite** (bez Dockeru/Redisu, NoopScheduler):
  start → běh → claim → XP/zlato/level-up, story anti-repeat, ownership, konflikt.
