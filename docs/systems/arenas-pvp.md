# Systém: Areny & PVP (M7)

Rated 1v1 PVP s matchmakingem, Elo ratingem, sezónním ladderem a realtime
WebSocket vrstvou. Viz ADR `docs/adr/0010-arena-pvp-and-realtime.md`.

## Přehled smyčky

1. Hráč otevře **Arenu** (`/characters/[id]/arena`) → vidí rating, tier, žebříček,
   historii zápasů.
2. **Enter queue** → server uloží snapshot bojového profilu (base + gear +
   talenty) a buď okamžitě spáruje s čekajícím soupeřem, nebo nechá postavu čekat.
3. Při spárování se zápas **deterministicky vyřeší** (1v1 duel) a obě strany
   dostanou realtime `arena:match_found` (offline soupeř i push notifikaci).
4. Hráč **sleduje souboj živě** (`/arena/match/[matchId]`) — combat log se
   odhaluje přes WebSocket; rating se posune dle výsledku.
5. Konec sezóny → **reset ratingu** + **sezónní odměna** dle dosaženého tieru
   (lazy připsání při dalším dotazu).

## Shared (`@game/shared`)

| Soubor             | Obsah                                                                                  |
| ------------------ | -------------------------------------------------------------------------------------- |
| `data/arenas.ts`   | Bracket (`1v1`), tiery (Unranked→Gladiator), sezóny, konstanty (start 1500, K=32, min level 10) |
| `pvp.ts`           | `simulatePvpDuel` (recykluje M5 `computeHit`), Elo (`applyRatingChange`), tier/sezónní helpery |

- **`simulatePvpDuel(a, b, seed)`** — symetrický event-driven duel. Oba aktéři
  útočí/kritují/lifestealují/castí signature abilities. Po 45 s „rampage"
  (eskalace dmg) → konečné rozhodnutí. Vrací `CombatEvent[]` + vítěze + délku.
- **`applyRatingChange(winner, loser)`** — Elo K=32, zero-sum, dno 0.
- **`ratingTier(rating)`**, **`activeSeasonAt(now)`**, **`seasonRewardGold`**.

## API (`apps/api/src/arena/`)

| Komponenta              | Role                                                                        |
| ----------------------- | --------------------------------------------------------------------------- |
| `arena.service.ts`      | Orchestrace: queue/resolve, rating, žebříček (Redis + DB fallback), sezónní rollover |
| `arena.repository.ts`   | Drizzle: ratings, matches, season rewards                                   |
| `arena.matchmaking.ts`  | `MatchmakingQueue` (Redis hash impl + in-memory pro testy)                   |
| `arena.leaderboard.ts`  | `ArenaLeaderboard` (Redis sorted set impl + in-memory pro testy)            |
| `arena.events.ts`       | `ArenaEventsRelay` — most service → WS (drží socket.io `Server`)            |
| `arena.gateway.ts`      | WebSocket gateway (JWT handshake, `arena:subscribe`/`watch`)               |
| `arena.controller.ts`   | REST: `GET /arena`, `POST /arena/queue`, `POST /arena/leave`, `GET /arena/match/:id` |

### REST endpointy

- `GET /characters/:id/arena` — přehled (rating, tier, žebříček, historie, fronta).
- `POST /characters/:id/arena/queue` — zařadí (nebo okamžitě vyřeší zápas).
- `POST /characters/:id/arena/leave` — opustí frontu.
- `GET /characters/:id/arena/match/:matchId` — detail/přehrání zápasu (autoritativní).

### WebSocket (`/api/socket.io`, jen `websocket` transport)

- `arena:subscribe { characterId }` → join room → příjem `arena:match_found`.
- `arena:watch { characterId, matchId }` → server streamuje `arena:match`
  (postupně odhalený timeline) do konce souboje.

Škálování: `RedisIoAdapter` (`@socket.io/redis-adapter`) fan-outuje broadcasty
přes Redis pub/sub na všechny instance (ADR 0003). Bez Redisu → single-instance
fallback; bez WS → REST je zdroj pravdy.

## Datový model (migrace `0005_normal_donald_blake`)

- `arena_ratings (characterId, bracket, seasonId)` — rating, wins, losses.
- `arena_matches` — snapshoty obou stran + seed + winner + rating delty.
- `arena_season_rewards (characterId, seasonId, bracket)` — archiv + odměna.

## Web (`apps/web`)

- `/characters/[id]/arena` — přehled, fronta (live „match found" přes WS),
  žebříček, historie, banner sezónní odměny.
- `/characters/[id]/arena/match/[matchId]` — živé sledování souboje přes WS.
- `$lib/arena-socket.ts` — socket.io klient (JWT handshake, subscribe/watch).

Všechny herní texty jsou anglicky, oddělené od logiky (i18n-ready).

## Testy

- Shared: `pvp.test.ts` (15) — determinismus duelu, Elo, tiery, sezóny.
- API: `arena.flow.test.ts` (7) — fronta/spárování, zero-sum rating, W/L,
  žebříček/rank, leave, vlastnictví, lazy sezónní rollover (přes pglite,
  in-memory fronta/žebříček).
- WS gateway se netestuje unit testem (viz ADR 0010 — vitest neumí Nest DI);
  ověřeno reálným bootem.

## Týmové arény 3v3/5v5 (M8.5-C)

Vedle 1v1 jsou rated brackety **3v3 a 5v5**. Tým se od **M9 (ADR 0022)** sestavuje
**trvalou skupinou** (`/characters/[id]/group`, viz `docs/systems/groups.md`) a
spustí — velikost skupiny určuje bracket (3→3v3, 5→5v5). `TeamArenaService.
launchForGroup` udělá snapshoty a zařadí tým do fronty (eligibilita friend/guild
se řeší už při vstupu do skupiny). Žádný NPC backfill — tým se páruje jen s jiným
plným reálným týmem bez překryvu členů. Boj: `simulateTeamFight` (focus-fire,
rampage, recykluje `computeHit`). Rating **per postava per bracket** přes `eloDelta`
proti průměru soupeřova týmu (`arena_ratings`). Zápas v `arena_team_matches`, watch
přes REST reveal (`/team-arena/match/:id`; web polluje). Detail: **ADR 0020** +
**0022**. _Původní ruční `queueTeam` dle jmen (M8.5-C) bylo nahrazeno skupinou._

## Známé follow-upy (M8/M9)

- PVP-specifický balanc (vs PVE), rating-window matchmaking, sezónní cosmetic
  odměny (transmog titul), per-postavová push granularita, WS realtime watch pro
  týmové zápasy (zatím REST polling), 2v2 bracket.
