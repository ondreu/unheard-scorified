# ADR 0001 — Technologický stack

**Status:** Accepted · **Datum:** 2026-06-14

## Kontext

Idle RPG s mnoha provázanými systémy (combat, gear, leveling). Běží na vlastním Dockeru, PWA + push notifikace. Vývoj řídí AI agenti — kódová báze musí být konzistentní a snadno uchopitelná.

## Rozhodnutí

Full-stack **TypeScript monorepo** (pnpm workspaces + Turborepo):

- Backend **NestJS** (Fastify adapter) — modulární DI, herní systém = modul.
- DB **PostgreSQL** + **Drizzle ORM** (SQL-first, type-safe).
- **Redis** — cache, BullMQ fronty, pub/sub, leaderboardy.
- Frontend **SvelteKit** + **Tailwind v4**, PWA přes `@vite-pwa/sveltekit`.
- Pixel grafika **PixiJS** v izolovaných komponentách (později).
- Deploy: docker-compose (api, web, postgres, redis, Caddy s HTTPS).

## Důsledky

- Jeden jazyk a sdílené typy/vzorce (`packages/shared`) napříč FE i BE → konzistence balancu.
- `shared` a `api` jsou CommonJS, `web` ESM (Vite si CJS závislost načte) — viz pozn. níže.
- Caddy řeší HTTPS, které vyžaduje Web Push.

## Poznámka

ESM/CommonJS: NestJS jede nejhladčeji v CommonJS, proto `shared` buildí CommonJS (univerzálně konzumovatelné). Pokud v budoucnu přejdeme na čisté ESM, je to samostatné ADR.
