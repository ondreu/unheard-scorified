# Spell sloty & spellbook (MR-4)

D&D 5e tiered spell sloty napasované na idle model. Viz **ADR 0029**.

## Model

- **Maximální sloty** = funkce třídy + levelu (`spellSlotsFor(klass, level)` v
  `@game/shared/data/spell-slots.ts`). Žádný mutable stav, čistá derivace z D&D
  tabulky. Řídká mapa `tier (1..9) → počet`.
- **Vyčerpané sloty** (`characters.spent_spell_slots`, jediný mutable stav) —
  aktivita je při startu spotřebuje, Long Rest dobije. **Available = max − spent**
  (`availableSlots`).

## Typy sesilatelů (`CASTER_TYPE`)

| Typ    | Třídy                                   | Sloty                                  |
| ------ | --------------------------------------- | -------------------------------------- |
| `full` | Bard, Cleric, Druid, Sorcerer, Wizard   | Plná tabulka 1.–9. tier                |
| `half` | Paladin, Ranger                         | 1.–5. tier, progrese od lvl 2          |
| `pact` | Warlock                                 | Pact Magic — málo slotů na 1 tieru     |
| `none` | Barbarian, Fighter, Monk, Rogue         | Žádné (bojové resources)               |

## Spotřeba & odpočinek

- **Start aktivity** (`ActivityService`): `activitySlotCost(durationSec)` slotů
  (~1 / 30 min, strop 6) se sešle od **nejvyššího dostupného tieru** dolů
  (`spendHighestSlots`). Non-caster → no-op.
- **Long Rest** = plné dobití (reset `spent → {}`):
  - automaticky při **claimu** aktivity (návrat z dobrodružství),
  - manuálně `POST /characters/:id/spells/long-rest`.
- **Short Rest** (Warlock) zatím splývá s Long Restem (idle) — granularita = MR-5+.

## Spellbook

`spellbookFor(klass, subclass, level)` → cantripy (tier 0, at-will) + známá kouzla
seskupená po tieru. Vychází z `resolveAbilities` (gated levelem/subclassem); každé
kouzlo nese `spellTier` z katalogu `data/abilities.ts`. Martial classy mají
prázdný spellbook (jejich kit = bojové techniky → panel Rotation). Class features
bez `spellTier` (Wild Shape) se nezobrazují.

## API

- `GET /characters/:id/spells` → `SpellView`: `casterType`, `level`,
  `spellcastingAbility`, `spellSaveDc`/`spellAttackBonus`, `slots[]`
  (`tier`/`max`/`available`), `totalMax`/`totalAvailable`, `rested`, `spellbook`.
- `POST /characters/:id/spells/long-rest` → Long Rest (idempotentní), vrací
  aktualizovaný `SpellView`.

## Web

`/characters/[id]/spells` — caster meta (typ / casting atribut / save DC / atk),
sloty per tier (pips available/max), Long Rest tlačítko, spellbook (cantripy +
kouzla po tieru s procedurálními ikonami `PixelAbilityIcon`). Nav: Character →
Spellbook.

## Character sheet

`DerivedStats.casterType` + `DerivedStats.spellSlots` (max) → spell sloty jsou
součástí sheetu (overview/inspect) bez extra dotazu. Sheet/inspect zobrazují
souhrn **„Spell Slots"** (součet max slotů; martial bez slotů = „—"), detailní
rozpad per tier je na `/characters/[id]/spells`.

## Scrap mana — spell sloty jako jediný resource (ADR 0034)

Zjednodušený `ResourceType` (`mana`/`energy`/`rage` proxy z WoW-éry) **scrapnut** —
byl to mrtvý kosmetický stav v `DerivedStats.resource`, který se nikdy v boji
nečetl. Jediný resource model hry = **D&D spell sloty** (tento dokument), v budoucnu
doplněné o class resources (Rage/Ki/Pact Magic).

### Per-encounter spotřeba slotů napříč simulátory (Slice 2 ✅)

Sdílený primitiv **`spendSlotForTier(slots, minTier)`** (`data/spell-slots.ts`):
vyčerpá nejnižší dostupný slot tieru ≥ kouzla (upcast jen když musí), nebo vrátí
`null` (kouzlo „fizzles" → zbraň/cantrip). Každý bojový simulátor si na startu
encounteru vezme **lokální kopii** `actor.spellSlots` jako rozpočet:

| Simulátor                         | Stav | Pozn.                                         |
| --------------------------------- | ---- | --------------------------------------------- |
| Quest / Gone Questing (`quest-run.ts`) | ✅ | Od MR-4; upcast + saving throwy (ADR 0032).   |
| Dungeon (`raid.ts` `fightBoss`)   | ✅ | Per-pull rozpočet, **upcast**; healer free basic-swing heal. |
| PVP / arény (`pvp.ts`)            | ✅ | Per-duel / per-člen rozpočet (1v1 i 3v3/5v5). |
| Gauntlet (`gauntlet.ts`)          | ✅ | **Per-run** rozpočet (NEresetuje se po vlně — roguelite), UI „zobrazit + zablokovat" (`outOfSlots`), upcast. |

Cantripy (tier 0) a martial techniky (bez `spellTier`) jdou **zdarma** (at-will);
kouzla (tier ≥ 1) čerpají slot. Idle auto-resolve módy mají rozpočet **per-encounter**
(reset každý souboj), Gauntlet **per-run** (interaktivní rationing). Long Rest =
reset při claimu/návratu (beze změny).

## Follow-up

- Gauntlet slot-refill draft odměna (ventil pro per-run rationing) — ADR 0034.
- Short Rest časová granularita (Warlock).
- Class resources (Rage/Ki/Pact, Slice 3 ADR 0034).

## MR-10e — literal spell dice + saving throwy ✅ (ADR 0032)

Kouzla převzala D&D 5e mechaniku: `SignatureAbility.dice` (literal damage dice, např.
Fireball 8d6 — **nezávisle na `attackPower`**), `dicePerSlotAbove` (upcast za vyšší
slot, +1d6/slot u Fireballu), `save` (per-spell saving throw: DEX-half u Fireballu,
WIS-negate u Vicious Mockery…) a `autoHit` (Magic Missile). Engine hází kostky přes
`abilityDamageSpec`, save aplikuje sdílený `applySpellSave`. Upcast využívá slot, kterým
bylo kouzlo sesláno (quest combat tracker; raid/gauntlet zatím base dice bez upcastu).
Detail damage modelu viz `dnd-combat.md`.
