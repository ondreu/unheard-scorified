# apps/api — backend (NestJS)

NestJS + Fastify, CommonJS. Stateless. Stav v Postgres (Drizzle) + Redis.

## Struktura modulu (šablona pro herní systémy)

Každý herní systém (leveling, gear, combat, professions, arena, ...) je vlastní složka v `src/<systém>/`:

```
src/<systém>/
  <systém>.module.ts       # NestJS modul, deklaruje providers/controllers
  <systém>.controller.ts   # HTTP/WS endpointy (tenké, delegují na service)
  <systém>.service.ts      # business logika; používá vzorce z @game/shared
  <systém>.repository.ts    # přístup k DB (Drizzle) — volitelné
  dto/                     # request/response DTO
  events/                  # eventy publikované do systému
  <systém>.service.test.ts # unit testy
```

## Pravidla

- Herní vzorce a konstanty **importuj z `@game/shared`** — neduplikovat.
- Náhoda jen přes `SeededRng` z `@game/shared`.
- DB klient injektuj přes `DB` token (`src/db/db.module.ts`), Redis přes `REDIS` (`src/redis/redis.module.ts`).
- Drizzle schéma rozšiřuj v `src/db/schema.ts`; migrace `pnpm db:generate` + `pnpm db:migrate`.
- Health endpoint `GET /health` je referenční příklad injektování DB/Redis.

## Příkazy

```bash
pnpm --filter @game/api dev        # watch
pnpm --filter @game/api build
pnpm --filter @game/api test
pnpm --filter @game/api db:generate
pnpm --filter @game/api db:migrate
```
