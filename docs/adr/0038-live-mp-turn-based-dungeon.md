# ADR 0038 — Živé MP tahové dungeon sezení (real players + AI fallback)

Status: **Accepted** (rozhodnutí PM: živé sezení + AI fallback) — realizováno
inkrementálně (sub-slices). Datum: 2026-06-19.
Navazuje na ADR 0037 (dungeon overhaul), je to jeho **Slice 4**.

## Kontext

ADR 0037 přinesl tahový dungeon engine: **Slice 2** (solo 1 hráč) a **Slice 3**
(group s **AI parťáky**, autofill 3-player). Engine (`dungeon-run.ts`) je
hero-centrický „round model": jeden tah = hráč zvolí ability+cíl → AI parťáci
jednají automaticky → nepřátelé útočí → údržba.

Slice 4 = **ruční party reálných hráčů** (3/5) v tahovém boji. Rozhodnutí PM
(model koordinace tahů): **živé sezení + AI fallback** — hráči se sejdou
(stávající party systém), boj běží tah po tahu; když hráč svůj tah nestihne
v časovém okně, **převezme ho AI** (recykluje rozhodovací logiku ze Slice 3).
To je most mezi idle/AFK povahou hry a MP zážitkem (nikdo neblokuje run navždy).

Existující infra (viz mapa): Socket.IO + Redis adaptér (multi-instance,
`redis-io.adapter.ts`), event-relay gateway vzor (`arena.gateway.ts`,
`social.gateway.ts`), party systém (`groups`/`group_members`, `group.launch`),
atomická Redis fronta (`raid.matchmaking.ts`), sdílená run persistence
(`raid_runs`/`raid_run_participants`), web socket klient (`arena-socket.ts`).

## Rozhodnutí

Postavit **živé, sdílené, server-authoritative tahové dungeon sezení** pro partu
reálných hráčů, s **AI fallbackem** na timeout tahu. Model boje:
**simultánní kolo s buffrovanými akcemi** (drží se round modelu ze Slice 2/3 —
NE plně initiative-interleaved): každé kolo všichni živí lidští hráči zvolí svou
akci; jakmile všichni odešlou (nebo vyprší deadline → AI doplní chybějící),
**kolo se vyhodnotí** (akce hráčů v pořadí slotů → AI-obsazené sloty → nepřátelé).
Server je jediný zdroj pravdy; klient posílá jen volbu (anti-cheat).

Sdílený run (multi-owner) odkazuje členy party (vlastnictví slotu = `characterId`
nebo `null` pro AI). Prázdné sloty lze doplnit AI (companion roster ze Slice 3) →
party menší než 3/5 je hratelná. **Wipe** = padne celá party (na rozdíl od solo,
kde „down hrdiny = konec"); pád jednotlivce ho jen vyřadí.

### Sub-slices

- **Slice 4a — deterministické jádro (`dungeon-party.ts`) + testy (tento commit):**
  Čistý serializovatelný engine pro **multi-owner partu** (členové = lidé i AI):
  `startPartyRun`, `submitPartyAction` (buffrování + validace vlastnictví/tahu),
  `resolvePartyRound` (vyhodnocení kola: lidské akce → AI-obsazené → nepřátelé,
  advance/wipe). AI volba tahu sdílí logiku se Slice 3. Recykluje sdílené bojové
  primitivy (`computeHit`/`abilityDamageSpec`/`healDiceSpec`/slot+Ki+rage),
  `groupEncounters`, `TANK_INCOMING_DAMAGE_MULT`. **Nezasahuje do Slice 2/3**
  (separátní stav/engine vedle `dungeon-run.ts`). Kontraktní unit testy
  (determinismus, AI fallback, wipe, clear).

- **Slice 4b — API + persistence + REST:** multi-owner run tabulka (+ participanti),
  `DungeonPartyService` (launch z party přes `group.launch`, `submitAction`,
  deadline → AI fallback resolve, finalize = `computeGroupReward` + lockout +
  per-člen loot), routy. REST polling klient (jako group page 4s polling) —
  funkční bez WS.

- **Slice 4c — WebSocket živé push:** `DungeonPartyGateway` (room `party-run:{id}`,
  arena-style relay) → push stavu + „tvůj tah" notifikace místo pollingu;
  deadline timer (BullMQ scheduled job / WS tick) → AI fallback. Web živá stránka.

- **Slice 4d — 5-player + polish:** velikost 5, initiative ordering (D&D flavor),
  reconnection, content tuning.

## Důsledky

- **Determinismus zachován** — vše přes `SeededRng`; kolo se vyhodnotí ze
  serializovaného stavu + buffrovaných akcí → reprodukovatelné (anti-cheat).
- **Idle-friendly** — AI fallback na deadline znamená, že odpojený/nečinný hráč
  neblokuje run; party doběhne i s AI. WS (4c) je enhancement nad REST (4b),
  konzistentní s tím, jak je v repo arena (REST polling + WS push).
- **Slice 2/3 nedotčeny** — live engine je separátní (`dungeon-party.ts`); solo
  a 3-AI autofill (`dungeon-run.ts`) beze změny.
- **Reward model sdílený** — `computeGroupReward` + weekly lockout + reputace
  jako auto-resolve i Slice 2/3 (žádná nová ekonomika).

## Reference

- `packages/shared/src/dungeon-party.ts` (live engine, Slice 4a)
- `packages/shared/src/dungeon-run.ts` (Slice 2/3 engine — nedotčen)
- `packages/shared/src/data/companions.ts` (AI roster, Slice 3)
- ADR 0037 (dungeon overhaul), ADR 0014 (group PVE run), ADR 0010 (WS realtime).
