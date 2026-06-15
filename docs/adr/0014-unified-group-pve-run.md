# ADR 0014 — Sjednocený group PVE run model & group dungeony (M8.5-B + D)

- Status: Accepted
- Datum: 2026-06-15
- Kontext milníku: **M8.5 — část B (skupinové PVE módy) + D (personal loot)**

## Kontext

M5 dělal SP dungeon jako **idle aktivitu** (`character_activities`, 1 postava vs
sekvence nepřátel, `simulateDungeonRun`, claim přes generický activity model). M8
přidal raidy jako **run model** (`raid_runs` + `raid_run_participants`, party vs
boss sekvence, `simulateRaidRun`, okamžitý resolve, per-participant odměny, NPC
backfill, matchmaking fronta). Dva paralelní modely pro v podstatě stejnou věc
(group PVE).

PM rozhodl (ROADMAP M8.5-B, volba „plná unifikace"): **sjednotit dungeon + raid
pod jeden „group PVE run" model**; SP dungeon = jeho speciální případ (1 hráč).
Dungeon dostane i **skupinový mód 3/5** (idle, NPC backfill — to je u PVE povolené;
ruční formace leadera čeká na M9 social). M8.5-D: **personal loot per účastník**
i pro dungeony.

## Rozhodnutí

### 1. Sdílený run model (data)

`raid_runs` rozšířeno o `content_type` ('raid' | 'dungeon'); `raid_id` drží
**content id** (raidId nebo dungeonId). `raid_run_participants` se nemění. Migrace
`0009_group_run_content_type` (ADD COLUMN, default 'raid' → zpětně kompatibilní).
`RaidRepository` je content-aware (`listRecentForCharacter(..., contentType)`),
sdílené mezi raid i dungeon službou (exportované z `RaidModule`).

> Tabulky si ponechávají fyzický název `raid_*` (žádný destruktivní rename na NAS
> s daty); logicky jsou to **group runs**.

### 2. Sdílená simulace (combat)

Dungeon i raid jedou na `simulateRaidRun` (party vs sekvence encounterů, wipe/retry
z M8.5-A). Členové party nově používají **signature abilities** (tank/dps), takže
solo dungeon dps o ně nepřijde. SP dungeon = party 1 dps; group dungeon 3/5 a raid
přidávají role + NPC backfill. Tím `simulateDungeonRun` (single-actor, M5) přestává
být runtime cestou pro dungeony — zůstává jen jako legacy formule pokrytá unit testy
(odstranění je úklid pro M9).

### 3. Content-agnostické helpery (`@game/shared/group.ts`)

`groupContentSizes` (dungeon 1/3/5, raid sizes), `groupComposition` (dungeon:
1 = solo dps, 3 = 1/1/1, 5 = 1/1/3), `groupEncounters` (encountery škálované
velikostí party — dungeon base 1 hráč, raid `scaleBoss`), `buildDungeonCompanion`
(NPC baseline z `recommendedLevel`), `isGroupContentUnlocked`, a **personal**
`computeGroupReward` (hard fail = 0; clear škálovaný wipy přes `wipeRewardMultiplier`;
dungeon loot tabulky / delegace na `computeRaidReward`).

### 4. Dungeon = group PVE run (API)

`DungeonService` přepsán z activity modelu na run model: `enter(size?, role?,
composition?)` (SP `size=1`, group 3/5) sestaví party (vytažení čekajících z fronty
`dungeon:<id>` + NPC backfill), deterministicky vyřeší přes `simulateRaidRun`, uloží
run (`contentType='dungeon'`) a udělí **personal loot** každému reálnému účastníkovi.
`queue`/`leave` (group matchmaking), `getRun(runId)` (reveal dle času), `recentRuns`.
Žádný `character_activities` pro dungeony. Web: `dungeons` (výběr velikosti + Enter)
→ `dungeon/[runId]` (sledování + personal reward).

## Důsledky

- **SP i group dungeon jsou personal-loot, wipe/retry, idle**; raid beze změny
  chování (sdílí jen data/sim/helpery). Konvergence `RaidService` na společný
  `GroupRunService` je nepovinný úklid (data model už sjednocený).
- Zrušen separátní dungeon claim — odměna padá při resolve (jako raid).
- `simulateDungeonRun`/`computeDungeonReward`/`DungeonActivityParams` zůstávají
  v shared jako legacy (unit testy formulí); runtime je nepoužívá. Úklid → M9.
- Ruční formace (leader/lobby) a P2P trade zůstávají na M9 (social). Týmové arény
  (3v3/5v5) také (ruční týmy → M9, viz ROADMAP M8.5-C).
