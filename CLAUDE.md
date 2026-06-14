# CLAUDE.md — orientace pro agenty

Tento projekt staví AI agenti, PM (uživatel) řídí a schvaluje. Tenhle soubor tě má **rychle zorientovat**. Než začneš pracovat, přečti i `docs/ROADMAP.md` (single source of truth roadmapy).

## Co to je

Webová **idle RPG hra inspirovaná vanilla WoW**. Převážně textová + pixel art. Idle (kontrola párkrát denně), ale i krátká aktivní sezení. PWA s push notifikacemi. Singleplayer-first s MP prvky (Areny PVP, Dungeony SP PVE, Raidy MP PVE).

## Architektura (stručně)

Full-stack TypeScript monorepo (pnpm + turbo):

```
apps/api      NestJS (Fastify) backend — herní systémy = feature moduly
apps/web      SvelteKit frontend (PWA), Tailwind v4
packages/shared   sdílené typy, herní vzorce, konstanty (jediný zdroj pravdy)
docs/         ROADMAP.md, adr/ (rozhodnutí), systems/ (detail-specy)
```

Stav: **PostgreSQL** (Drizzle ORM) + **Redis** (cache, BullMQ fronty, pub/sub, leaderboardy). API je **stateless** (škálovatelnost — viz `docs/adr/0003`).

Idle model: server-authoritative, deterministický (seedovaný RNG), offline progres se lazy dopočítá. Detaily: `docs/adr/0002`.

## Příkazy

```bash
pnpm install            # instalace (z rootu)
pnpm dev                # spustí všechny apps v dev (turbo)
pnpm build              # build všeho (shared se buildí první)
pnpm test               # testy (vitest)
pnpm lint               # eslint
pnpm typecheck          # typová kontrola
docker compose up       # celý stack (postgres, redis, api, web, caddy)
```

API healthcheck: `GET /health` → stav + napojení na Postgres/Redis.

## Konvence (závazné)

- **Sdílená pravda jen v `packages/shared`.** Žádné herní vzorce/konstanty duplikované v api nebo web.
- **Herní náhoda jen přes `SeededRng`** z `@game/shared`. Nikdy `Math.random()` v herní logice (determinismus, anti-cheat).
- **Každý herní systém = vlastní NestJS modul** (`apps/api/src/<systém>/`) se strukturou `*.module.ts`, `*.controller.ts`, `*.service.ts`, případně `*.repository.ts`, `dto/`, `events/`.
- **Přísný TypeScript** (`strict`, `noUncheckedIndexedAccess`). ESLint + Prettier, CI brání mergi při červené.
- **Testy jako kontrakt:** herní vzorce v `shared` mají unit testy; API moduly integrační testy.
- **Malé vertikální přírůstky.** Žádné velké nedokončené refaktory. Po dokončení milníku aktualizuj `docs/ROADMAP.md`.
- **Velká rozhodnutí → ADR** do `docs/adr/`.

## Kde právě jsme

Viz `docs/ROADMAP.md` → aktuální milník je označený 🚧. Nezačínej práci na pozdějším milníku bez dokončení předchozího.
