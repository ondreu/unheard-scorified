# ADR 0041 — Level-up Slice C: class features po levelech (D&D progrese)

- **Stav:** přijato (Slice C hotové)
- **Kontext:** uzavírá Level-up overhaul (ADR 0040 = Slice B). Navazuje na Slice A
  (level track 1–20, `level-track.ts`), MR-2 (level-up systém) a ADR 0034 (class
  resources Ki/Rage).
- **Rozsah:** `packages/shared` (nový `class-progression.ts` + napojení do
  `level-track.ts`), `apps/web` (`/levelup`). **Bez DB migrace, bez API změn.**

## Kontext

Po Slice A+B má `/levelup` čitelný level track a bohaté **volby** (subclass / ASI /
Feat / class-feature skupiny). Pořád ale chybělo **zviditelnění automatických D&D
class features**, které se na daných levelech „prostě stanou": Extra Attack, Rage
uses/damage, Ki, Sneak Attack scaling. Tyhle mechaniky **engine už modeluje**
(scaling v `combat.ts` / `class-resources.ts` / baseline abilitách), ale na level
tracku nebyly vidět → některé levely působily prázdně, ač reálně něco přinesly.

## Rozhodnutí

1. **Surfaceovat jen reálně modelované features.** Nový čistý modul
   `class-progression.ts` deriváuje milníky z **jediného zdroje pravdy** (konvence
   „žádné duplikované magnitudy"):
   - **Extra Attack** (martial = ne-caster) na 5/11/20 z `basicAttackDiceCount`.
   - **Improved Cantrips** (full/pact caster) na 5/11/17 z `cantripDiceMultiplier`.
   - **Rage** (Barbarian) uses/damage z `rageChargesFor` / `rageDamageBonus`.
   - **Ki** (Monk) z `kiPointsFor`.
   - **Sneak Attack** scaling (a obecně baseline ability s `bonusDicePerLevels`)
     odvozený přesně jako `bonusDiceSpec` v enginu (`ceil(level/N)`).
2. **Žádné fiktivní features.** Čistě flavorové D&D features bez mechanické
   implementace (Channel Divinity uses, Second Wind, Wild Shape…) se **zatím
   nepřidávají** — patří k jejich budoucí implementaci (backlog „Enemy schopnosti"
   / class features content pass). Level track tak nikdy neslibuje, co engine nedělá.
3. **Žádné nové volby.** Slice C je **prezentační** — volby už pokryl Slice B.
   `classProgression` features volbu nedávají (`classFeatures` ≠ `choices`).

## Architektura

- `class-progression.ts`: `ClassFeatureMilestone { id, level, name, description }`
  + `classProgression(klass)` (všechny milníky 1–20, seřazené) a
  `classProgressionAt(klass, level)`. Modul leží na úrovni `level-track.ts` (smí
  importovat `combat.ts` — žádný cyklus: combat neimportuje level-track ani
  class-progression).
- `LevelTrackEntry` rozšířen o `classFeatures: LevelTrackEntry_Feature[]`;
  `buildLevelTrack` je naplní z `classProgression` indexem po levelu. Existující
  `newFeatures` (baseline/subclass abilities) i `newSpells` beze změny.
- `LevelUpView.track` už pole nese → **žádná API změna**. Web `/levelup` vykreslí
  `classFeatures` se štítkem „Class feature" nad baseline technikami.

## Důsledky

- Každý level dává na tracku feedback i tam, kde dřív zelo prázdno; čísla se nikdy
  nerozejdou s bojem (vše odvozené). Kontraktní testy ověřují shodu popisů s engine
  helpery (`basicAttackDiceCount` / `cantripDiceMultiplier` / `bonusDiceSpec` /
  class-resources).
- Uzavírá Level-up overhaul. Doplnění dosud nemodelovaných class features (Channel
  Divinity, Second Wind, Wild Shape…) je vědomě odloženo na jejich mechanickou
  implementaci.
