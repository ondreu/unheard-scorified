# Idle RPG (WoW-inspired)

Webová idle RPG hra inspirovaná vanilla World of Warcraft. Převážně textová, místy pixel art. PWA s push notifikacemi. Idle (kontrola párkrát denně) i krátká aktivní sezení.

> **Roadmapa a vize:** [`docs/ROADMAP.md`](docs/ROADMAP.md) · **Orientace pro vývoj:** [`CLAUDE.md`](CLAUDE.md)

## Stack

TypeScript monorepo (pnpm + Turborepo): NestJS (Fastify) + PostgreSQL/Drizzle + Redis backend, SvelteKit + Tailwind PWA frontend, sdílené vzorce v `packages/shared`. Deploy přes docker-compose (+ Caddy/HTTPS).

## Rychlý start (lokální dev)

```bash
corepack enable
pnpm install
cp .env.example .env

# varianta A: jen infra v dockeru, apps lokálně
docker compose up -d postgres redis
pnpm dev

# varianta B: celý stack v dockeru
docker compose up --build
```

- Web: http://localhost (přes Caddy) nebo http://localhost:5173 (vite dev)
- API health: http://localhost:3000/health

## Příkazy

| Příkaz                         | Co dělá                      |
| ------------------------------ | ---------------------------- |
| `pnpm dev`                     | dev režim všech apps (turbo) |
| `pnpm build`                   | build (shared → api/web)     |
| `pnpm test`                    | testy (vitest)               |
| `pnpm lint` / `pnpm typecheck` | kontrola kvality             |

## Struktura

```
apps/api          NestJS backend
apps/web          SvelteKit PWA
packages/shared   sdílené typy, vzorce, konstanty
docs/             ROADMAP, ADR, system specy
```
