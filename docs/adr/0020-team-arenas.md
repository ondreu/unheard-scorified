# ADR 0020 — Týmové arény 3v3/5v5 (M8.5-C)

- Status: Accepted
- Datum: 2026-06-15
- Kontext milníku: **M8.5-C** (odemčeno M9 social)

## Kontext

M7 přinesl 1v1 arénu (idle auto-matchmaking, NPC-blind snapshot fronta). M8.5-C
doplňuje **týmové brackety 3v3 / 5v5**. Rozhodnutí PM: týmy se skládají **ručně**
(hráč si vybere parťáky), **žádný NPC backfill ani idle team-matchmaking** — proto
to čekalo na M9 social (identita + souhlas spoluhráčů). Rating zůstává **per
postava per bracket per sezóna** (ad-hoc týmy per zápas, žádná perzistentní
týmová entita).

## Rozhodnutí

### 1. Ruční tým přes social graf (bez lobby/invite ceremonie)

Leader zařadí tým jedním voláním `queueTeam(bracket, teammateNames[])`. Každý
parťák musí být **friend nebo spoluhráč z guildy** leadera — social graf slouží
jako **souhlas** k zařazení (proto závislost na M9). Žádné samostatné invite/accept
kolečko: jednodušší než raid lobby a dostatečné pro malou základnu. Validuje se
počet (= velikost bracketu − 1), unikátnost, level a že nikdo není už ve frontě.

### 2. Snapshot fronta jako 1v1, ale jednotkou je tým

Fronta (`TeamArenaQueue`, Redis + in-memory) drží **celé týmy** se snapshoty členů
(anti-cheat/determinismus). Nový tým se spáruje s nejdéle čekajícím týmem **bez
překryvu členů**; jinak čeká. Žádný NPC backfill — tým musí být plný reálných
hráčů. Atomické „nárokování" soupeře přes `HDEL` (multi-instance bez dvojího párování).

### 3. Team-vs-team engine recykluje `computeHit`

`@game/shared/pvp.ts::simulateTeamFight`: každý živý člen má basic + signature
timery, cílí **focus-fire** na živého nepřítele s nejnižším HP, po `PVP_RAMPAGE_SEC`
všichni „enrage". Vítězí tým s přeživšími (tie-break podíl HP). Žádná duplikace
per-hit vzorců (sdílí `computeHit` s M5/M7).

### 4. Rating per postava, Elo proti průměru soupeřů

`eloDelta(rating, opponentAvg, won)` se aplikuje **každému členu** zvlášť proti
**průměrnému ratingu soupeřova týmu**. Rozšiřuje M7 `arena_ratings` o brackety
`3v3`/`5v5` (bracket je datový atribut — žádná migrace ratingů, jen nové hodnoty).
Sezónní reset/odměny fungují stejně jako 1v1 (sdílené helpery).

### 5. Persistence + watch (REST polling)

Zápas se ukládá do `arena_team_matches` (snapshoty obou týmů + seed + winner) →
timeline se přepočítá deterministicky (`simulateTeamFight`) a odhaluje dle času,
jako 1v1 `getMatch`. Web **polluje** (WS realtime pro týmy je follow-up; 1v1 WS
vrstva se nechává beze změny).

## Důsledky

- **Pozitivní**: znovu použity matchmaking i rating vzory z M7; tým-vs-tým engine
  sdílí combat math; ad-hoc rating drží idle-first model bez těžké týmové entity.
- **Kompromisy**: social graf jako souhlas (parťák nemusí aktivně potvrdit zařazení
  — přijatelné, je to jeho friend/guild); watch přes polling; tým musí být plný
  (žádný backfill — záměr PM). Perzistentní týmy/ready-check lze přidat později
  bez refaktoru (bracket je datový atribut).

## Testy

- `@game/shared` unit: `pvp.test.ts` (simulateTeamFight determinismus/síla/5v5,
  `eloDelta`, brackety).
- API integrační: `team-arena.flow.test.ts` (pglite) — 3v3 fronta, spárování +
  rating obou stran, 5v5, odmítnutí ne-friend parťáka, špatný počet, leave,
  ownership.
