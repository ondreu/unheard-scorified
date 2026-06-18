# ADR 0029 — D&D tiered spell sloty (MR-4)

Status: Accepted · Datum: 2026-06-18

## Kontext

MR-4 v rámci D&D Remasteru zavádí **tiered spell sloty** dle D&D 5e tabulky
(1.–9. level kouzel), spotřebovávané hrou a obnovované Long Restem. Dosud měly
classy jen zjednodušený resource (`rage`/`energy`/`mana`) z MR-1/MR-2 a abilit
kit bez slotové ekonomiky.

Výzva: napasovat D&D slotový model (vázaný na encountery a Long/Short Rest) na
**idle, server-authoritative, deterministickou** hru, kde hráč kontroluje
postavu párkrát denně.

## Rozhodnutí

### 1. Sloty jako idle resource spotřebovávaný aktivitami

- **Maximální sloty** jsou čistě odvozené z **třídy + levelu** (D&D tabulka),
  žádný mutable stav — `spellSlotsFor(klass, level)` v `@game/shared`.
- **Spotřeba**: aktivita (quest/Gone Questing) při startu „sešle nejlepší
  dostupná kouzla" → `activitySlotCost(durationSec)` slotů od nejvyššího tieru
  dolů (`spendHighestSlots`). Delší/těžší běh spotřebuje víc (strop 6).
- **Long Rest = plné dobití** při **claimu odměny / návratu** (reset vyčerpaných
  na `{}`), plus manuální `POST /characters/:id/spells/long-rest`.
- Jediný mutable stav = `characters.spent_spell_slots` (řídká mapa `tier→počet`).
  Available = max − spent (`availableSlots`). Determinismus zachován (max je
  funkce dat, spent je explicitní krok).

### 2. Typy sesilatelů (D&D 5e)

`CASTER_TYPE` per třída: **full** (Bard/Cleric/Druid/Sorcerer/Wizard), **half**
(Paladin/Ranger, sloty 1.–5. tier od lvl 2), **pact** (Warlock — Pact Magic, málo
slotů na nejvyšším tieru, Short Rest recharge), **none** (Barbarian/Fighter/Monk/
Rogue — bez slotů, bojové resources).

V idle modelu Short Rest (Warlock) momentálně splývá s Long Restem (dobití při
claimu) — časová granularita Short vs Long Rest = follow-up (MR-5+).

### 3. Spell list per třída (spellbook)

Abilit katalog (`data/abilities.ts`) dostal pole **`spellTier`** (0 = cantrip /
at-will, 1..9 = kouzlo daného levelu). `spellbookFor(klass, subclass, level)`
seskupí známá kouzla (z `resolveAbilities`) po tieru. Martial classy → prázdný
spellbook (jejich „abilities" jsou bojové techniky, ne kouzla); class features
bez `spellTier` (např. Wild Shape) se ve spellbooku nezobrazují.

### 4. Zobrazení v character sheetu

`DerivedStats` rozšířen o `casterType` + `spellSlots` (max) → spell sloty jsou
viditelné všude, kde se staví sheet (overview/inspect), bez extra dotazu.

## Rozsah MR-4 vs. follow-up

**Hotovo teď:** slotová tabulka (full/half/pact/none) + caster typy + spellbook
s tiery + Long Rest recharge + idle spotřeba aktivitou + API (`/spells`) + web
panel + character-sheet integrace. Vše deterministické a otestované.

**Vědomě odloženo:**

- **Per-encounter depletion řídící boj** („šetři sloty na bosse", slabší rotace
  bez slotů) → s **dice-roll combatem MR-5**. Spotřeba teď neovlivňuje výsledek
  boje (questy nejdou prohrát mimo combat-objective, M9/M12).
- **Spotřeba u dungeonů/raidů/arén/Gauntletu** (jdou mimo `ActivityService`) →
  retrofit v MR-5, až bude spotřeba bojově relevantní.
- **Short Rest časová granularita** (Warlock rychlejší obnova) → MR-5+.
- **Balanc** počtu spotřebovaných slotů / dopadu → MR-10.

## Důsledky

- (+) Faithful D&D slotová tabulka jako sdílená pravda; idle-kompatibilní (max je
  derivace, jen `spent` je stav, lazy reset při claimu).
- (+) Spellbook s tiery připravuje MR-5 (dice combat) i UI bez dalšího refaktoru.
- (−) Dokud combat nečte sloty, je spotřeba „kosmetická" (zobrazí depletion, ale
  netrestá) — vědomý mezikrok konzistentní s pořadím MR (MR-4 před MR-5).

## Alternativy

- **Sloty čistě časově dobíjené (bez claim resetu).** Zamítnuto — koliduje s idle
  „set & forget" a roadmapou („Long Rest = recharge při claimu/návratu").
- **Plný D&D resource model (concentration, akce/bonus akce) hned.** Zamítnuto —
  idle auto-resolve to neunese; BG3-style zjednodušení (viz MR rozsah, bod 10).
