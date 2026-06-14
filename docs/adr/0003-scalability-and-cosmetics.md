# ADR 0003 — Škálovatelnost & kosmetická vrstva (příprava monetizace)

**Status:** Accepted · **Datum:** 2026-06-14

## Kontext

PM požaduje (1) škálovatelnost od základu a (2) pozdější možnost prodeje kosmetiky (skinů), aniž by to teď bylo aktivní.

## Rozhodnutí

### Škálovatelnost

- **Stateless API:** žádný herní stav v paměti procesu; vše v Postgres/Redis.
- Horizontální škálování za load balancerem; více instancí API.
- WebSocket vrstva s **Redis pub/sub adaptérem** (zavedeno v M7) → fan-out přes instance.
- Plánované úlohy přes **BullMQ** (Redis) — sdílené mezi instancemi.

### Kosmetika / monetizace

- **Kosmetika je oddělená od statů.** Skin = samostatná entita + ownership na účtu/postavě; vizuální vrstva (transmog) nikdy nedává power.
- Tím lze později přidat prodej skinů (storefront, platby) **bez refaktoru herního jádra**.
- Zatím se kosmetika získává jen ve hře; platby nejsou implementované.

### Frakce

- Aliance/Horda jen kosmetické (vizuál/lore). Frakce je **datový atribut**, ne zadrátovaná logika → pozdější herní rozdělení je možné bez přepisu.

## Důsledky

- Datové modely od začátku oddělují „power" (staty/gear) od „vzhledu" (kosmetika).
- In-memory cache je vždy jen cache (zdroj pravdy je DB/Redis), nikdy jediný zdroj.
