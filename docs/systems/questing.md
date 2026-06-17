# System: Leveling & questing (M2, narrative overhaul M9)

Stav: implementováno v M2; **narrative + combat overhaul v M9** (viz níže).
Zdroj pravdy pro data i vzorce: `packages/shared`. Architektura: viz
`docs/adr/0006-activities-and-questing.md`, `0002-idle-model.md` a
`docs/adr/0024-quest-narrative-engine.md` (M9 overhaul).

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

- **4 level brackety na frakci** (frakce kosmetická — paralelní obsah, stejný balanc):
  - Alliance: Northshire Valley (1–10), Westfall (10–25), Duskwood (25–40),
    Eastern Plaguelands (40–60).
  - Horde: Durotar (1–10), The Barrens (10–25), Thousand Needles (25–40),
    Felwood (40–60).
  - Loot per bracket: `bracket_1`…`bracket_4` (`loot.ts → ZONE_TO_BRACKET`).
- Zóna má `faction`; frakce questu se odvozuje ze zóny (`questFaction` /
  `ZONES[zoneId].faction`). Postava vidí jen questy své frakce.
- **Questy**: `story` (lineární chain přes `requiresQuest`, jednorázové). Balanc
  (doba, odměny) se ladí v datech.
- **Gone Questing** (generický grind, ADR 0025): místo repeatable questů jediná
  idle aktivita s **hráčem volenou délkou** (5 min–6 h). Level flexuje s postavou,
  zóna (loot bracket + flavor) se auto-odvodí (`questingZoneForLevel`), odměny =
  čas × `referenceXpPerHour(level)` × efektivita; loot 1 roll / hod běhu škálovaný
  `GRIND.lootChanceMult` (skoupější než aktivní obsah — ~0.5 itemu za 6h).
  Interní `ActivityType 'grind'`; engine náhodných událostí (`quest.events`)
  zůstává dostupný, ale data repeatable questů byla odebrána.
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

## Narrative + combat overhaul (M9)

Cíl (zadání PM): questy přestaly být „nudný timer → claim zlato". Quest je teď
**vícekrokový příběh** — narativní beaty prokládané **auto-resolved combaty** —
generovaný deterministicky při claimu. Detail rozhodnutí: `docs/adr/0024`.

- **Idle zachováno**: quest je pořád jeden idle běh (timer). Při claimu se ze
  `seed`u (stejný jako pro odměny) vygeneruje **příběhový log** (`questLog` v
  `ClaimResult`). Žádná nová nutná interakce — „vrátím se a přečtu, co se stalo".
- **Combat NELZE prohrát** (rozhodnutí PM): silnější postava = rychlejší/čistší
  boj (vyšší zbylé HP v logu), slabší = víc utržených ran, ale quest se vždy
  dokončí (clamp na 1 HP). Log je **flavor vrstva nad odměnami** —
  `computeQuestReward` se nemění → balanc netknutý.
  - **Výjimka — combat-objective questy (M12):** opt-in `QuestDef.combatObjective`
    přepne boj na **reálný** (engine bez no-fail clampu, `simulateQuestEncounter
    (..., allowDefeat=true)`). Slabá postava může **prohrát** (padne, nebo nestihne
    nepřítele dorazit v `QUEST_ENCOUNTER_MAX_SEC`) → `QuestRunResult.success=false`,
    příběh se utne na prohraném souboji. **Reward gating** v `ActivityService.claim`:
    prohra ⇒ XP/zlato/loot = 0, quest se **nedokončí** (lze opakovat se silnějším
    buildem), `ClaimResult.questFailed=true`. Idle zachováno (jeden běh, determinismus
    přes seed). Odměny kalibrované jako u ostatních questů (riziko odměňuje loot +
    jednorázové dokončení). Ukázky: `ns_padfoot_bounty`/`dt_skull_rock` (~lvl 8) a
    `epl_araj_reckoning`/`fw_jadefire_lord` (~lvl 55).
- **Datový model** (`data/quests.ts`): `QuestDef.steps?: QuestStep[]` (ručně
  psané story questy = narativní + combat kroky) a `events?: QuestEventDef[]` +
  `eventCount?` (repeatable: z poolu se deterministicky vybere podmnožina →
  pokaždé trochu jiný průběh). Combat krok zadává jen **jméno + tier** nepřítele;
  HP/AP se odvodí z levelu questu × tieru (`questFoeStats`) — autor neřeší čísla.
- **Engine** (`quest-run.ts`): `simulateQuestRun(quest, profile, seed)` →
  `QuestRunResult.steps`. Combat kroky recyklují `computeHit`/`applyAbsorb`
  z combat enginu (žádná duplikace). Combat profil postavy (gear/talenty/rotace)
  bere `RotationService.buildCombatProfile` (sdílené s dungeon/raid/arena).
- **Rozsah M9**: engine + bohatě napsané startovní zóny **Northshire** (Alliance)
  a **Durotar** (Horde) + jejich repeatable s náhodnými událostmi.
- **Rozsah M12.1**: nové **40–60 zóny** **Eastern Plaguelands** (Alliance) a
  **Felwood** (Horde) s plným narativním questline (3 story lvl 40/48/55 + 2
  repeatable na zónu) — otevírá tenké late-game pásmo. Mezizóny
  (Westfall/Duskwood/Barrens/Thousand Needles) zatím používají fallback
  (jednoduchý beat z `description`) — doplní se v dalším
  content passu (viz ROADMAP M10+ „Více a kvalitnějších questů").

## Dungeon attunement (M9)

`DungeonDef.attunement?: { questAnyOf: string[] }` (mirroruje `RaidAttunement`):
dungeon vyžaduje level **i** dokončený questline (stačí jeden z uvedených questů
— paralelní Alliance/Horde varianty). `isDungeonUnlocked(id, level, completedIds)`.
Vzorově: **Ragefire Chasm** gated questem `al_ragefire_attunement` /
`ho_ragefire_attunement` (startovní zóny). Web list vystavuje `requiresAttunement`
/ `attuned` → „🔒 Attunement required".

## Testy

- `packages/shared`: unit testy vzorců (leveling aliasy + applyXpGain, activity
  progress/reward determinismus, quest gating) + **`quest-run.test.ts`** (no-fail
  combat, determinismus, autorský story log, generované repeatable události).
- `apps/api`: integrační flow přes **pglite** (bez Dockeru/Redisu, NoopScheduler):
  start → běh → claim → XP/zlato/level-up + **questLog**, story anti-repeat,
  ownership, konflikt; dungeon attunement gating.
