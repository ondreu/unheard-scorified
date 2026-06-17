# Profese & reputace (M6)

Dlouhodobé filler aktivity vedle questování/dungeonů. Viz ADR
`docs/adr/0009-professions-and-reputation.md`.

## Profese (3 gathering + 3 crafting)

| Profese        | Druh      | Frakce            | Výstup                          |
| -------------- | --------- | ----------------- | ------------------------------- |
| Mining         | gathering | Miners' League    | ore (copper/iron/mithril/silver)|
| Herbalism      | gathering | Herbalist Circle  | herbs (peacebloom/briarthorn/…) |
| Skinning       | gathering | Explorers' Guild  | leather (light/medium/heavy)    |
| Blacksmithing  | crafting  | Miners' League    | equipment (gear)                |
| Alchemy        | crafting  | Herbalist Circle  | consumables (potions/elixirs)   |
| Leatherworking | crafting  | Explorers' Guild  | bags (8/12/16 slotů)            |

> **Skinning → Leatherworking** (craftovatelné batohy): vzácnější kůže = větší
> batoh. Mirror dvojice k Mining→Blacksmithing; čistě data (žádná nová mechanika).

- **Skill** 1..`MAX_PROFESSION_SKILL` (150). Default 1 — postava umí všechny profese
  od startu (žádný learning krok). Skill-up: +1 za běh, dokud je node/recept
  „zelený" (`currentSkill < skillUpTo`), pak zešedne.
- 3 tiery na profesi (requiredSkill 1 / 50 / 100), vyšší tier = lepší výnos /
  silnější item, delší běh.

## Data (`@game/shared`)

- `data/professions.ts` — `PROFESSIONS`, `GATHERING_NODES`, `RECIPES`, helpery
  (`gatheringNodesFor`, `recipesFor`, `professionReputationGains`, validátory).
- `data/materials.ts` — `MATERIALS` (ore/herb), `CONSUMABLES` (potions/elixirs).
- `data/factions.ts` — `FACTIONS`, `REP_TIERS`, `reputationTier`,
  `reputationProgress`, `repTierIndex`.
- `professions.ts` (logika) — `professionSkillUp`, `rollGatherYield` (deterministicky
  přes `SeededRng`).
- Crafted **gear** žije v `data/items.ts` (`ITEMS`) — equipovatelné jako jakýkoli loot.

## Idle smyčka

Gathering/crafting běh = idle aktivita (ADR 0006), typy **`gather`** /
**`craft`**:

1. **Start** (`ProfessionService`): ověří skill (a u craftu rep gate + materiály),
   u craftu **spotřebuje materiály ihned** (anti-double-spend), založí aktivitu
   (`startAt` + `durationSec` + `seed`) a naplánuje BullMQ job.
2. **Průběh**: lazy/deterministický (jako questy/dungeony). Character page zobrazí
   běžící aktivitu „🔨 Working: Gathering/Crafting …".
3. **Claim** (generický `ActivityService.claim`):
   - připíše character XP + materiály/output do inventáře (`ActivityReward`),
   - **skill-up** (`professionSkillUp`) → `character_professions`,
   - **reputaci** (`professionReputationGains`) → `character_reputation`,
   - vrátí `ClaimResult.profession` + `.reputation` (UI „skill +1", „+rep").

`computeGatherReward` rolluje materiály přes `SeededRng`; `computeCraftReward` je
čistě deterministický (output fixní).

## Reputace

- 3 frakce: **Miners' League** (mining+blacksmithing), **Herbalist Circle**
  (herbalism+alchemy), **Explorers' Guild** (poloviční podíl z každého běhu).
- Tiery: Neutral (0) → Friendly (500) → Honored (1500) → Revered (3000) → Exalted (6000).
  Tier se **odvozuje z `standing`** (neukládá se).
- **Rep-gated recepty**: `requiredReputation: { factionId, tier }`. MVP gated
  recepty (Honored): **Masterwork Blade** (Miners' League), **Elixir of Strength**
  (Herbalist Circle).

## DB (Drizzle, migrace `0004`)

- `character_professions` (`character_id`, `profession_id`, `skill`) — PK (char, prof).
- `character_reputation` (`character_id`, `faction_id`, `standing`) — PK (char, faction).
- Materiály/spotřebáky/crafted gear → existující `character_inventory` (žádná nová
  inventory tabulka).

## API (`apps/api/src/profession/`)

- `GET  /characters/:id/professions` — panel: skilly, reputace, materiály, gathering
  nody (unlocked), recepty (unlocked/craftable, rep gate, have/need materiálů).
- `POST /characters/:id/professions/gather/:nodeId` — start gathering.
- `POST /characters/:id/professions/craft/:recipeId` — start crafting (spotřebuje materiály).
- Claim jde přes generický `POST /characters/:id/activity/claim`.
- `ProfessionDataModule` (leaf) drží `ProfessionRepository` + `ReputationRepository`
  → bez modulového cyklu (importují ho Activity i Profession modul). Viz ADR 0009 §4.

## Web (`apps/web/src/routes/characters/[id]/professions/`)

- Profession page: skill bary, reputace (tier + progress), materiály/goods, gathering
  nody (Gather), recepty (Craft, have/need, rep gate). Start → návrat na character page
  (sledování běžící aktivity + claim).
- Character page: link „Professions", claim banner ukazuje skill-up + rep zisky.
- Herní texty anglicky, oddělené od logiky (`ui` objekty).

## Co zbývá doladit (mimo M6)

- „Use" mechanika consumables (buffy) — M9 (buff systém).
- Prodej materiálů/itemů (vendor/AH) — M8.
- Reputace i z questů/dungeonů (retrofit do jejich claimu).
- Balanc (skill XP, yield, rep prahy, durations) — M9.
