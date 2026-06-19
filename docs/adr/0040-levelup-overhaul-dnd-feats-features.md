# ADR 0040 — Level-up overhaul: D&D featy, class-feature volby, víc subclass

- **Stav:** přijato (B1 hotové; B2 + B3 plánované)
- **Kontext:** navazuje na MR-2 (level-up systém, ASI/Feat, talent stromy zrušeny),
  ADR 0036 (D&D-věrné abilities / engine efekty) a Slice A (level track 1–20).
- **Rozsah:** `packages/shared` (feats data + validace), `apps/api` (LevelUpModule),
  `apps/web` (`/levelup`).

## Kontext

Po Slice A je `/levelup` čitelný level track, ale **obsah voleb** zůstal slabý:
featy byly **jeden plochý globální seznam** abstraktních combat-tagů, dostupný
všem třídám stejně, bez prereků a bez D&D příchutě. Subclass je v MVP jen **1 per
classa** a class-feature volby (Fighting Style, Metamagic, …) chybí úplně. Cíl PM:
**víc D&D-like a přehledné.**

## Rozhodnutí (PM)

1. **Feat roster — kurátorský výběr** (~15–25 nejpoužívanějších D&D 5e featů),
   ne plný PHB list (objem/balanc). Half-featy s **+1 do atributu**, prereky
   (atribut/level/caster), **filtrování dle classy** (martial vs caster).
2. **Class-feature volby — ANO** (B2): Fighting Style (Fighter/Paladin/Ranger),
   Metamagic (Sorcerer), Eldritch Invocations (Warlock), Battle Master manévry
   (Fighter) jako součást level-upu.
3. **Subclasses — 2–3 per classa** (B3): ke stávající 1 přidat 1–2 D&D subclassy
   s vlastní signature ability.

## Krájení na slice

- **B1 — D&D feat roster (tento ADR, hotové).**
- **B2 — class-feature volby.** Nový typ level-up slotu (class+level gated),
  class-specific nabídka, napojení na engine (ADR 0036 efekty).
- **B3 — víc subclass.** Data (subclass def + signature ability) + picker.

## Architektura B1 (`packages/shared/src/data/feats.ts`)

`FeatDef` rozšířen o:

- `classes?: ClassId[]` — které classy feat nabízí (`undefined` = univerzální).
  `featsForClass(klass)` / `isFeatForClass(feat, klass)` = filtr (martial vs caster).
- `prerequisites?: { minLevel?, minAbility?, caster? }` — `meetsFeatPrerequisites`
  je čistá funkce nad **efektivními** staty (base + ASI/feat progrese); prereky
  potřebují staty → vyhodnocuje je **API service**, ne čisté `isValidChoice`
  (to ověří jen tvar: existence + class filtr + half-feat atribut).
  `featPrerequisiteLabel` = lidsky čitelný popis pro UI.
- `effect.statChoice?: { options, amount }` — **half-feat**: hráč zvolí +`amount`
  do jednoho z `options`. `FeatChoice` dostal `abilityChoice?: AbilityScore`;
  `aggregateProgression` ho aplikuje, `isValidFeatAbilityChoice` validuje.

**Zpětná kompatibilita:** všech 13 původních feat id zachováno (jen obohaceno o
`classes`/`prerequisites`); uložené volby existujících postav zůstávají platné.
Efekty stále recyklují `COMBAT_TAG_EFFECTS`/`SHIELD_TAGS` (jediný zdroj pravdy pro
„jak volba mění postavu") — kontraktní test ověřuje, že každý použitý tag engine zná.

### API + web

- `LevelUpService.getLevelUp` vrací featy **filtrované dle classy** s `eligible`
  (prereky vs efektivní staty), `prerequisite` (label) a `abilityOptions` (half-feat).
  `choose` navíc server-side ověří prereky.
- `/levelup` zobrazuje featy s prereq labelem (zašednutí ineligible) a u half-featů
  picker atributu (+1 STR/DEX…).

## Důsledky

- Featy jsou D&D-věrnější a class-relevantní; magnitudy (combat tagy) nedotčené.
- B2/B3 přidají hloubku voleb (class features, víc subclass) — řez zachová „malé
  vertikální přírůstky", každý slice samostatně spustitelný a zelený.
