# ADR 0010 — Areny (MP PVP), matchmaking & škálovatelný realtime (M7)

- Status: Accepted
- Datum: 2026-06-15
- Kontext milníku: **M7 — Multiplayer infra & Areny (MP PVP)**

## Kontext

M5 dal deterministický combat engine (`packages/shared/src/combat.ts`) a PVE
dungeony; M7 přidává **MP PVP Areny**: zařadím se do fronty, soupeřím s jinou
postavou a stoupám v žebříčku. Zároveň je M7 **první milník, kde se reálně řeší
realtime transport** — M5 combat log byl jen REST polling.

Klíčové průřezové požadavky (ROADMAP): stateless API škálovatelné na víc instancí
(ADR 0003), stav výhradně v Postgres/Redis, determinismus a seedovatelnost
(anti-cheat), idle-first model (hráč je typicky offline).

## Rozhodnutí PM (potvrzeno)

1. **Rozsah MVP: jen bracket `1v1`.** 2v2/3v3 lze přidat bez refaktoru
   (`ArenaBracket` je datový atribut, ne zadrátovaná logika).
2. **Live watch přes WebSocket.** Realtime transport se škálovatelným Redis
   pub/sub adaptérem (multi-instance).
3. **Sezónní ladder s resetem + odměnami** dle dosaženého tieru.

## Rozhodnutí

### 1. PVP = symetrický duel, recyklace combat enginu

`packages/shared/src/pvp.ts::simulatePvpDuel(a, b, seed)` recykluje
`computeHit` a `CombatActor` z M5 (žádná duplikace bojových vzorců — viz
CLAUDE.md). Na rozdíl od dungeonu (postava vs sekvence nepřátel) je duel
**symetrický**: oba aktéři útočí, kritují, lifestealují a používají signature
abilities. Po `PVP_RAMPAGE_SEC` (45 s) oba „enrage" (eskalace dmg) → žádný
souboj není nekonečný; iterační strop má deterministický tie-break (vyšší podíl
HP, při shodě strana `a`).

PVP profil = stejný `deriveCombatProfile` jako PVE (base staty + gear + talenty).
**Samostatný PVP balanc** (PVP power koeficienty, DR) je vědomě odložen na M9
(balanc pass) — viz ROADMAP „Síla PVP vs PVE balancu → M5/M7".

### 2. Idle-first matchmaking přes snapshoty

Fronta drží **snapshot bojového profilu** pořízený při zařazení (jako dungeon
snapshot — anti-cheat + determinismus). Když přijde druhý hráč, server spáruje
proti čekajícímu snapshotu a **okamžitě deterministicky vyřeší zápas** — i když
je první hráč offline. Vyřešení je server-authoritative; obě strany dostanou
realtime „match found", offline soupeř navíc push notifikaci (M3 infra).

Fronta i žebříček jsou **za rozhraním** (`MatchmakingQueue`, `ArenaLeaderboard`)
— Redis impl v produkci (sdílené napříč instancemi), in-memory impl ve flow
testech (vzor `ActivityScheduler` z M2). Atomické „nárokování" soupeře přes
`HDEL` (vrátí 1 jen tomu, kdo záznam odebral) → žádné dvojité párování mezi
instancemi.

### 3. Rating, žebříček, sezóny

- **Elo** (`applyRatingChange`, K=32), start 1500, dno 0. Zero-sum.
- **Tiery** (Unranked → Gladiator) odvozené z ratingu; každý tier má sezónní
  odměnu ve zlatě.
- **Žebříček**: Redis **sorted set** (`ZADD`/`ZREVRANGE`/`ZREVRANK`) jako rychlá
  cache; **durable zdroj pravdy je `arena_ratings`** v Postgresu → `ArenaService`
  dělá fallback na DB (`ORDER BY rating`), když je Redis prázdný/nedostupný.
- **Sezóny** = data v `@game/shared` (`ARENA_SEASONS`, souvislé intervaly).
  Rating je per `(postava, bracket, seasonId)` → nová sezóna = nový řádek se
  startovním ratingem (**reset**). **Sezónní rollover je lazy + idempotentní**:
  při prvním dotazu postavy po skončení sezóny se archivuje finální standing,
  připíše odměna a zapíše do `arena_season_rewards` (PK brání dvojímu udělení) —
  stejný „lazy dopočet" princip jako idle aktivity (ADR 0002).

### 4. Realtime: Socket.IO + Redis pub/sub adaptér

WebSocket vrstva přes `@nestjs/websockets` + `@nestjs/platform-socket.io`.
Multi-instance fan-out přes `@socket.io/redis-adapter` (`RedisIoAdapter` v
`main.ts`): `server.to(room).emit` se rozešle přes Redis pub/sub na všechny
instance → socket připojený k libovolné instanci dostane event (stateless API,
žádné sticky sessions — klient používá jen `websocket` transport).

- **`arena:subscribe`** → join room `char:<id>` → realtime `arena:match_found`
  (klíčový cross-instance moment: hráč ve frontě na instanci X je notifikován,
  když ho spáruje hráč na instanci Y).
- **`arena:watch`** → server streamuje předpočítaný combat timeline po WS
  (odhalování dle uplynulého času). REST `GET …/arena/match/:id` je
  **autoritativní fallback** (recompute z `seed` + snapshotů, jako M5 dungeon).

Gateway je tenký; veškerá logika v `ArenaService` (testováno přes pglite).
`ArenaEventsRelay` (drží `Server`, nastaví ho gateway v `afterInit`) rozplétá
závislost service↔gateway → **žádný DI cyklus**. Best-effort: bez Redisu adaptér
degraduje na single-instance, bez WS serveru jsou emity no-op (REST je pravda).

## Datový model (migrace `0005_normal_donald_blake`)

- `arena_ratings (characterId, bracket, seasonId)` PK — rating, wins, losses.
- `arena_matches` — snapshoty obou stran + seed + winner + rating delty
  (timeline se přepočítá, neukládá se).
- `arena_season_rewards (characterId, seasonId, bracket)` PK — archiv + odměna.

## Důsledky

- ✅ Idle-first PVP funguje i s malou/offline hráčskou základnou (snapshoty).
- ✅ Realtime škáluje horizontálně (Redis pub/sub adaptér), API zůstává stateless.
- ✅ Determinismus zachován (recompute z seed+snapshot, žádný per-process stav).
- ✅ Žádná duplikace bojových vzorců (recyklace M5 `computeHit`).
- ⚠️ Vitest neumí bootnout Nest DI (esbuild neemituje decorator metadata) →
  WS gateway/Redis adaptér se neověřují unit testem; DI graf se ověřuje reálným
  bootem (`AUTO_MIGRATE=false node dist/main.js`). Logika je v testovaném service.
- ⚠️ PVP balanc (vs PVE) odložen na M9; rampage je jen pojistka proti stalemate.
- ⚠️ Matchmaking je MVP rating-blind (nejdéle čekající soupeř) — rating-window
  párování je follow-up, až bude větší základna.
