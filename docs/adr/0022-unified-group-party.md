# ADR 0022 — Trvalá skupina (party) sjednocující formaci pro dungeon/raid/arénu

Status: Accepted · M9

## Kontext

Do M9 existovaly **dva oddělené formační systémy**:

- **Raid lobby** (M8.5-B): leader sestaví party pro raid (role + NPC backfill).
- **Ruční team aréna** (M8.5-C): leader uvede parťáky jménem pro 3v3/5v5.

Navíc idle `enter` (dungeon/raid) skládal partu z fronty. NPC backfill byl mezitím
**odstraněn úplně** (rozhodnutí PM) — group obsah běží jen s reálnými hráči.

PM požadavek: jedna **trvalá skupina (party)**, se kterou lze jít na **dungeon,
raid i arénu**.

## Rozhodnutí

Zavádíme **trvalou skupinu** jako jediný formační systém; **nahrazuje** raid lobby
i ruční team arénu.

- **Trvalá** entita (`groups` + `group_members`, migrace 0020): postava je v
  nejvýše jedné skupině (`joined`), přežívá mezi aktivitami. Pozvánky = řádky
  `invited`. Leader + role (tank/heal/dps; aréna roli ignoruje).
- **Pozvánky gated na friends/guild** (recykluje social graf, stejný gate jako
  M8.5-C). Leader zve dle jména; přijetí/odmítnutí; kick/promote/leave/disband;
  odchod leadera předá vedení nejstaršímu, jinak rozpustí.
- **Launch** (jen leader) → `GroupActivityType`:
  - `dungeon` → `DungeonService.runForGroup` (group PVE run, `content_type='dungeon'`).
  - `raid` → `RaidService.runForGroup` → `finalizeRun` (attunement gate leaderem).
  - `arena` → velikost → bracket (`arenaBracketForSize`: 1→1v1, 3→3v3, 5→5v5;
    jiné odmítnout). 1v1 = `ArenaService.queue`; 3v3/5v5 = `TeamArenaService.launchForGroup`.
- **Žádný NPC backfill**, žádná duplikace combat/odměn — recyklují se existující
  run/aréna enginy (`finalizeRun`, `simulateTeamFight`, Elo, lockout, personal loot).
- Realtime: skupina používá **polling** `getState` (na rozdíl od arény/raidu nemá
  WS gateway) — jednoduchost; pozvánky/změny se projeví do pár sekund.

## Důsledky

- **Odstraněno:** `RaidLobbyService`/controller/repo + tabulky `raid_lobbies`/
  `raid_lobby_members` (migrace 0019 drop), `@game/shared/lobby.ts`,
  `TeamArenaService.queueTeam` (ruční formace dle jmen), web `/raid-lobby` a
  `/team-arena`. **Zachováno:** team match resolution + rating + leaderboard +
  watch (`/team-match/[matchId]`), solo 1v1 aréna, `getTeamArena` overview endpoint.
- Nové moduly `apps/api/src/group/` (service/controller/repository) + web
  `/characters/[id]/group`. `DungeonService`/`RaidService`/`ArenaService`/
  `TeamArenaService` exportované pro `GroupModule` (DI; žádný cyklus — group závisí
  na nich, ne naopak).
- **Sdílené helpery:** `@game/shared/party.ts` (`GroupActivityType`,
  `GroupMemberStatus`), `arenaBracketForSize` v `data/arenas.ts`.

## Follow-up

- WS realtime pro group pozvánky/změny (recyklovat Redis pub/sub vrstvu z M7).
- Composition targets (jako lobby `remainingSlots`) pokud bude potřeba řízené role.
- Matchmaking refinement (čekání na partu / rating-window) pro plynulejší skládání.
