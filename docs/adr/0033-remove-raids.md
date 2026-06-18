# ADR 0033 — Vyříznutí raidů (raid systém odstraněn)

- Status: Accepted
- Datum: 2026-06-18
- Kontext fáze: **post-Remaster backlog** (combat & obsah overhaul)

## Kontext

Raidy (MP PVE, M8 — ADR 0011) byly idle-first MP obsah: party 5/10/20 hráčů
s rolemi T/H/DPS vs sekvence bossů, role-based matchmaking fronta, attunement
gating, weekly lockout, raid-only loot a achievementy. M8.5-B (ADR 0014) je
sjednotil s dungeony do jednoho **group PVE run** modelu; M9 (ADR 0022) je dal
pod trvalou skupinu (party).

V post-Remaster směřování (rozhodnutí PM, viz ROADMAP „Combat & obsah —
overhaul") se raidy **úplně vyřezávají**. Důvody: MP raid obsah se nehodí do
budoucího směru (tahové interaktivní dungeony 3 velikostí), drží mrtvou váhu
kódu/dat a komplikuje balanc. Dungeony ale **zůstávají** a sdílí s raidy podstatnou
infrastrukturu (combat engine, run tabulky, repo, fronta, lockout) — řez proto
musí být chirurgický, ne smazání složky.

## Rozhodnutí

### 1. Minimální řez — sdílený engine zůstává pod legacy názvem `raid_*`

Dungeony běží na **stejném** group-run enginu jako raidy (`simulateRaidRun`,
`RaidActor`, `RaidRole`, `deriveRaidActor`, `scaleBoss`, role tuning) i na stejné
persistenci (`raid_runs` / `raid_run_participants`, `RaidRepository`,
`RAID_QUEUE`). Tyto kusy **zůstávají beze změny názvů** (rozhodnutí PM: minimální
churn, nižší riziko) jako **interní legacy** — `packages/shared/src/raid.ts` je
nově dokumentován jako „group PVE run engine", `apps/api/src/raid/` jako „sdílená
group-run infrastruktura" (`RaidModule` bez controllerů/služeb, jen poskytuje
repo + frontu dungeonům). `GroupContentType` zúžen na `'dungeon'` (rozšiřitelný
abstrakční bod, kdyby přibyl další group PVE mód).

### 2. Co se smazalo (raid-specifické)

- **API**: `raid.controller.ts`, `raid.service.ts`, `raid.gateway.ts`,
  `raid.events.ts`, `raid.flow.test.ts`. `RaidModule` osekán na repo + frontu.
  Odebrán z `app.module` (žádné raid endpointy); `GroupModule` už ho neimportuje.
- **Group launch**: `GroupService.launch` ztratil větev `raid`; `GroupLaunchResult`
  a `GROUP_ACTIVITY_TYPES` (`party.ts`) jsou `dungeon | arena`. `LaunchGroupDto`
  validuje jen `dungeon|arena`.
- **Shared data**: `data/raids.ts` (celý katalog `RAIDS` + helpery
  `buildRaidBoss`/`computeRaidReward`/`isRaidUnlocked`) smazán. Typ `RaidReward`
  přesunut do `raid.ts` (zůstává jako tvar odměny group runu).
- **Web**: routy `/characters/[id]/raids` a `/raid/[runId]`, raid API klient
  (`listRaids`/`enterRaid`/…), nav sekce „Raids", raid launch v group UI, raid
  „ongoing" na overview, raid scene témata.

### 3. Loot a achievementy — retire (rozhodnutí PM)

- **Raid loot**: `RAID_LOOT_TABLES` (`loot.ts`) smazány → raid-exkluzivní itemy
  jsou **neobtainable**. **Definice itemů v `data/items.ts` zůstávají**, takže
  kusy, které hráči už vlastní, se nadále korektně resolvují (žádná data migrace,
  nic se nedropuje z inventářů).
- **Raid achievementy** (`raid_1/10/50`) a metrika `raidClears` smazány z
  `achievements.ts` + `goals.ts` (a z `progression.service`). Dříve odemčené
  nároky v `character_achievement_claims` zůstávají jako **historická data**
  (osiřelé id se prostě nevykreslí).

### 4. Žádná schema migrace; historická data zůstávají

`raid_runs` / `raid_run_participants` (sdílené s dungeony) i `character_lockouts`
**zůstávají**. Staré řádky s `content_type='raid'` se už nikde nedotazují
(progression čte jen `'dungeon'`) — jsou inertní historická data. Weekly lockout
(`lockout.ts`) nově platí jen pro dungeony s `weeklyLockout`. History feed si
ponechává štítek druhu `raid` pro vykreslení starých záznamů.

### 5. Attunement questy ponechány jako běžný obsah

Raid attunement questline (`*_drakefire_attunement`, `*_paragons_of_power`,
`*_scepter_of_the_sands`, `dw_morbent_fel`, `tn_galak_ogres`) **nemažeme** —
zůstávají jako normální dokončitelné questy (XP/zlato, počítají se do
`questsCompleted`). Mizí jen jejich role raid-gate (spolu s `data/raids.ts`).
Zabrání se tím rozbití quest-řetězů, počtů a achievementů (nižší riziko).

## Důsledky

- **Pozitivní**: raidy pryč z UI i runtime; dungeony nedotčené (sdílený engine);
  žádná riziková DB migrace; vlastněné itemy a odemčené achievementy zachovány.
- **Kompromisy**: ve sdílené infře přežívá legacy název `raid_*` (engine, tabulky,
  modul) — záměrný kompromis za minimální churn. Osiřelá raid data v DB
  (historické runy, claimy) zůstávají inertní. Raid-exkluzivní item definice
  zůstávají v katalogu jako neobtainable „legacy" kusy.
- **Navazuje**: tahové dungeony 3 velikostí + spell sloty všude (ROADMAP backlog).
  Až dojde na ně, lze zvážit přejmenování legacy `raid_*` infry na group-agnostic.

## Testy

- `@game/shared`: `raid.test.ts` přepsán na testy enginu se **syntetickými** bossy
  (ne raid daty); `group.test.ts`/`economy.test.ts`/`loot.test.ts`/
  `data/dungeons.test.ts`/`party.test.ts` zbaveny raid větví. 442 testů zelených.
- `@game/api`: `group.flow.test.ts` bez raid launch/RaidService; 181 testů zelených.
- Build/lint/typecheck (shared/api/web) zelené.

## Související ADR (raid aspekty deprecated tímto ADR)

0011 (raidy MP PVE), 0013 (wipe/retry — zůstává pro dungeony), 0014 (unified group
run — zůstává, jen dungeon), 0015 (weekly lockout — zůstává pro dungeony), 0018
(raid lobby — už dříve nahrazeno ADR 0022), 0022 (group party — zůstává: dungeon +
aréna).
