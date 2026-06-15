# ADR 0011 — Raidy (MP PVE): party combat, attunement & idle matchmaking (M8)

- Status: Accepted
- Datum: 2026-06-15
- Kontext milníku: **M8 — Raidy (MP PVE) & Auction House**

## Kontext

M5 dal deterministický combat engine (1 postava vs sekvence nepřátel) a SP
dungeony; M7 přidal MP PVP a první realtime vrstvu (WebSocket + Redis pub/sub).
M8 přidává **MP PVE Raidy**: organizovaný skupinový obsah s rolemi (tank/heal/dps),
idle boss fighty, attunement gating a raid loot.

Průřezové požadavky (ROADMAP): stateless API, stav v Postgres/Redis, determinismus
(anti-cheat), **idle-first** (hráč je typicky offline, singleplayer-first se i MP
contentem musí dát hrát i sólo).

## Rozhodnutí PM (potvrzeno)

1. **Party 5 hráčů: 1 tank / 1 healer / 3 dps.** Nejmenší smysluplná „trinita".
2. **Attunement = level + dokončený dungeon/questline** (ne item-gated).
3. **2 raidy × ~3 bossy** (Molten Core ~lvl 40, Blackwing Lair ~lvl 55).

## Rozhodnutí

### 1. Raid combat = party vs boss, recyklace M5 enginu

`packages/shared/src/raid.ts::simulateRaidRun(party, bosses, seed)` recykluje
`computeHit`/`CombatActor`/`CombatEvent` z M5 (žádná duplikace vzorců — viz
CLAUDE.md). Na rozdíl od dungeonu je na straně hráčů **víc aktérů** (`RaidActor =
CombatActor + role + healPower`):

- **tank** — víc HP, míň dmg, boss útočí na něj a bere zmírněné poškození;
- **healer** — léčí nejzraněnějšího spoluhráče místo útoku (heal event), token dmg;
- **dps** — plné poškození bossovi.

Boss cílí prvního živého tanka (jinak nejodolnějšího člena jako off-tank), po
`RAID_ENRAGE_SEC` „enrage". Wipe (celá party mrtvá) = defeat. `deriveRaidActor`
škáluje base profil podle role. Combat tag → mechanika zůstává v M5 (`combat.ts`).
Přidána událost `heal` do `CombatEventType`.

### 2. Raidy NEpoužívají `character_activities` (jako arena, ne jako dungeon)

Dungeon je SP idle aktivita (1 řádek per postava v `character_activities`). Raid
je MP — víc postav v jednom běhu — a model „jedna aktivita per postava" by tomu
neseděl. Proto raid kopíruje **arena pattern**: vlastní tabulky `raid_runs`
(snapshot celé party `RaidActor[]` + seed) + `raid_run_participants` (účast +
odměna per reálná postava). Timeline se přepočítá deterministicky ze snapshotu +
seedu (anti-cheat, reveal dle uplynulého času — stateless).

### 3. Idle-first matchmaking + NPC backfill

Singleplayer-first hra s malou základnou nemůže čekat na 5 reálných hráčů. Model:

- **`POST …/raids/:raidId/queue {role}`** — postava se zařadí (Redis hash, snapshot
  `RaidActor`), čeká na vytažení do cizí party (idle).
- **`POST …/raids/:raidId/enter {role}`** — postava raid **spustí teď**: pro chybějící
  role vytáhne čekající reálné hráče (atomicky přes `HDEL`, jako arena), zbytek
  doplní **NPC companiony** (`buildCompanionBase` + `deriveRaidActor`). Run se
  okamžitě deterministicky vyřeší.

Tím jde raid vždy „odehrát" (i sólo s 4 NPC), a zároveň je genuinně MP-capable
(reální hráči se připojí, dostanou odměnu + push, jako offline arena soupeř).
Fronta abstrahovaná za `RaidQueue` (Redis impl + in-memory pro testy).

### 4. Odměny: okamžité, deterministické, per účastník

Při resolve se každému reálnému účastníkovi udělí odměna (XP/zlato/loot) na
deterministicky odvozeném seedu (`runId:characterId`) — `computeRaidReward` v
`data/raids.ts`, loot z `RAID_LOOT_TABLES`. Vytažení hráči dostanou push. (Jako
arena rating se aplikuje hned; `durationSec` slouží jen k reveal combat logu.)

### 5. Attunement

`RaidDef.attunement = { requiredLevel, questAnyOf[] }`. `isRaidUnlocked` ověří
level + dokončení alespoň jednoho z attunement questů (recykluje `completed_quests`
z M2). Per-frakce questline (Aliance/Horda paralelně — frakce kosmetická): pro
Blackwing Lair přidán attunement quest (`al_/ho_drakefire_attunement`).

### 6. Realtime watch

`RaidGateway` recykluje WS vrstvu z M7 (Socket.IO + Redis pub/sub adaptér v
`main.ts`): `raid:subscribe` (room postavy → `raid:resolved` při vytažení do cizí
party) + `raid:watch` (stream předpočítaného timeline). `RaidEventsRelay` rozplétá
service↔gateway (žádný DI cyklus). REST `GET …/raids/run/:runId` je autoritativní
fallback (web používá REST polling).

## Důsledky

- ➕ Raid jde hrát i sólo (idle), přitom MP-capable bez budoucího refaktoru.
- ➕ Žádná duplikace combat vzorců; konzistence FE/BE přes `@game/shared`.
- ➖ NPC backfill znamená, že „čistě MP" zážitek je opt-in (queue), ne vynucený —
  vědomá volba pro malou základnu (idle-first).
- ➖ PVE balanc (boss HP/AP, role tuning, loot) je placeholder → **M9 balanc pass**.
- Větší party (10/20/40), per-role gating dle classy a raid-lockout (weekly reset)
  jsou možné rozšíření bez změny jádra (`RAID_COMPOSITION` + data atributy).

## Reference

- `packages/shared/src/raid.ts`, `packages/shared/src/data/raids.ts`
- `apps/api/src/raid/*`, migrace `drizzle/0006_*`
- `docs/systems/raids.md`
