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

## Produkční nasazení (server)

Image se staví v CI a pushují do **GHCR**; na serveru se jen táhnou. **Watchtower** automaticky aktualizuje `api`+`web` při nové verzi (viz [`docs/adr/0004-deployment.md`](docs/adr/0004-deployment.md)).

```bash
# 1. (jednorázově) přihlášení k GHCR — jen pokud jsou packages private
#    PAT s oprávněním read:packages:
docker login ghcr.io -u <github-user>

# 2. konfigurace + start
cp .env.example .env        # nastav DOMAIN, hesla, IMAGE_TAG
docker compose -f docker-compose.prod.yml up -d
```

Aktualizace pak probíhá sama: `git push` → CI postaví a nahraje image → Watchtower je do ~5 min stáhne a restartuje. Ruční update: `docker compose -f docker-compose.prod.yml pull && up -d`.

> Pro **private** packages odkomentuj v `docker-compose.prod.yml` u služby `watchtower` mount `~/.docker/config.json`. Jednodušší alternativa: nastav viditelnost GHCR balíčků na **public**.

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
