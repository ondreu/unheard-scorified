# ADR 0009 — Profese & reputace (deep time-sinks, M6)

**Status:** Accepted · **Datum:** 2026-06-15

## Kontext

M6 přidává dlouhodobé filler aktivity vedle questování a dungeonů:

- **Gathering profese** (mining, herbalism) — dlouhé idle běhy za **materiály**.
- **Crafting profese** (blacksmithing, alchemy) — spotřeba materiálů → **itemy**
  (equipment) / **spotřebáky** (consumables), s **profession skill levelingem**.
- **Reputace s frakcemi** — rep gain z profession aktivit, **rep tiers**, a
  **rep-gated odměny** (recepty odemčené reputací).

Rozsah MVP (rozhodnutí PM, roadmapa měla „hloubku profesí" jako otevřené menší
rozhodnutí): **2 gathering + 2 crafting** profese (Mining→Blacksmithing pro gear,
Herbalism→Alchemy pro consumables) a **3 frakce** s rep-gated recepty.

Idle model je server-authoritative + lazy/deterministický (ADR 0002, 0006):
aktivita = `startAt` + `durationSec` + `seed`, odměna je čistá funkce v
`@game/shared` dopočítaná při claimu. M6 do tohoto modelu zapadá stejně jako
dungeony (ADR 0008).

## Rozhodnutí

### 1. Gathering/crafting běh = idle aktivita typu `gather` / `craft`

Activity model (ADR 0006) je obecný (`activity_type` + `params` jsonb). Přidáváme
dva nové typy: **`gather`** (`params = { nodeId }`) a **`craft`**
(`params = { recipeId }`). Žádná nová „activity" tabulka, žádná změna `character_activities`.
Platí „jedna aktivní aktivita na postavu" — gathering, crafting, questing i dungeon
se vzájemně vylučují (sdílený `unique character_id`). Claim, BullMQ plánovač i push
se recyklují.

- `computeGatherReward(params, seed)` — materiály rollnuté přes `SeededRng`
  (`rollGatherYield`) + character XP. Deterministické.
- `computeCraftReward(params)` — deterministický output item + character XP
  (bez RNG; vstupy se spotřebovaly při startu).

### 2. Materiály a spotřebáky = ne-equip položky ve sdílené inventory tabulce

Materiály (ore/herb) a crafted spotřebáky žijí ve **stejné tabulce
`character_inventory`** jako gear (`itemId` + `quantity`) — žádná nová inventory
tabulka. Nejsou equipovatelné (nemají slot); equipment katalog `ITEMS` zůstává
oddělený. Nové katalogy v `@game/shared`: `MATERIALS`, `CONSUMABLES`. Crafted
**gear** (blacksmithing) jsou normální položky v `ITEMS` (equipovatelné jako
jakýkoli loot). Crafting **spotřebuje vstupy ihned při startu** (anti-double-spend);
output se vyrobí při claimu.

Materiály/spotřebáky se zobrazují na **profession page** (jejich doménový domov),
ne na equipment inventory page — equipment inventory kontrakt zůstává nezměněn.

### 3. Profession skill & reputace = nové tabulky, připisované při claimu

Dvě nové Drizzle tabulky (migrace `0004`):

- `character_professions` (`character_id`, `profession_id`, `skill`) — skill
  1..`MAX_PROFESSION_SKILL` (150 pro MVP); default 1 (postava „umí" všechny profese
  od startu, žádný learning krok).
- `character_reputation` (`character_id`, `faction_id`, `standing`) — standing
  0..`MAX_REPUTATION`; **tier se odvozuje deterministicky** v `@game/shared`
  (`reputationTier`), neukládá se.

Skill-up je **deterministický bez RNG**: +1 za běh, dokud je node/recept „zelený"
(`currentSkill < skillUpTo`), pak „zešedne" (0). Jednoduchý, testovatelný MVP model.
Reputace: každý běh dává standing primární frakci profese + poloviční podíl
Explorers' Guild (generalisté).

Skill + reputace se připisují v **generickém `ActivityService.claim`** (jediný
claim entry point — character page claimuje libovolnou aktivitu přes
`POST /activity/claim`). `ClaimResult` rozšířen o volitelné `profession` a
`reputation` (pro UI „skill +1", „+rep").

### 4. Žádný modulový cyklus: `ProfessionDataModule` (leaf)

`ActivityService.claim` potřebuje `ProfessionRepository` + `ReputationRepository`;
`ProfessionService` (start gather/craft) potřebuje `ActivityRepository` + scheduler
z `ActivityModule`. Naivně by vznikl **modulový cyklus** Activity↔Profession
(řešitelný `forwardRef`, ale křehký — circular file import nechá injektovanou
závislost `undefined` při startu).

Místo toho repos žijí v samostatném **leaf modulu `ProfessionDataModule`** (jen DB,
který je `@Global`), který bez cyklu importují **oba**: `ActivityModule` (claim) i
`ProfessionModule` (start). `ProfessionModule` importuje `ActivityModule`
jednosměrně. Ověřeno reálným bootem (tsc, ne vitest — esbuild neemituje decorator
metadata, takže DI smoke test musí běžet nad `nest build` výstupem).

### 5. Rep-gated odměny

Recept může mít `requiredReputation: { factionId, tier }`. `ProfessionService.startCraft`
ověří tier postavy proti požadavku (`repTierIndex`). Dvě „mistrovské" receptury
(Masterwork Blade, Elixir of Strength) jsou gated na **Honored** — naplňují
požadavek „rep-gated reward".

## Důsledky

- **+** Profese plně recyklují idle infra (activity, scheduler, push, claim) —
  malý vertikální přírůstek, žádný nový activity model.
- **+** Determinismus zachován (gather yield přes `SeededRng`; skill/rep bez RNG).
- **+** Žádný DI cyklus díky leaf modulu.
- **−** Crafted consumables zatím nemají „use" mechaniku (žádný buff systém) —
  jsou jen v inventáři/prodejné. Doplní se v M9 (buffs) / M8 (AH/vendor).
- **−** Reputace zatím získává jen z profesí (ne z questů/dungeonů) — záměrné
  ohraničení M6; retrofit do quest/dungeon claimu lze přidat později.
- **−** Materiály nejsou na equipment inventory page (jen na profession page) —
  vědomý kompromis pro nezměněný inventory kontrakt.

## Reference

- Detail: `docs/systems/professions-reputation.md`
- Souvislosti: ADR 0002 (idle model), 0006 (aktivity/questing), 0008 (combat/dungeony).
