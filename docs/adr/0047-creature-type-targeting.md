# ADR 0047 — Creature type targeting (omezení cílení kouzel dle typu nestvůry)

- **Stav:** přijato (hotovo)
- **Kontext:** navazuje na sjednocený enemy model (`data/enemies.ts` katalog +
  `creatureType`, ADR 0043), CR/typové obrany (MR-7, ADR 0031), enemy
  schopnosti/conditiony (ADR 0044/0045) a control kouzla (Hold Person/Web/Entangle,
  ADR 0045). Backlog položka „Creature type targeting". Rozhodnutí PM: využít
  existující `creature type` z katalogu jako **gate cílení kouzel** (D&D-věrné:
  Hold Person = humanoid, Hold Monster = libovolný).
- **Rozsah:** `packages/shared` (nové pole + helper + propagace `creatureType`),
  `apps/api` (anti-cheat + view fields), `apps/web` (UI gating + spell karta).
  **Bez DB migrace.**

## Kontext

Katalog nestvůr (`BESTIARY`) už nese `creatureType` (14 D&D typů), ale combat ho
nikde nečetl — všechna kouzla šla na libovolný cíl. D&D 5e přitom část kouzel
omezuje na typ cíle (Hold **Person** = jen humanoid; Hold **Monster** = cokoli).
Engine control kouzla (ADR 0045) tak dovolovala „Hold Person" i na vlka/zombie.

## Rozhodnutí

1. **`SignatureAbility.validTargetTypes?: readonly CreatureType[]`** — `undefined`
   / prázdné = bez omezení (default všech kouzel). Vyplněné = kouzlo jde jen na
   uvedené typy. **Hold Person** (6 class variant) označen `['humanoid']`. Web a
   Entangle jsou v D&D plošné (bez type-gate) → ponechány bez omezení.

2. **`creatureType` na bojovém aktérovi.** `EnemyStats.creatureType` +
   `CombatActor.creatureType`; propsáno `instantiateEnemy` (z šablony) →
   `buildEnemyActor` (→ aktér). Hráč dostává `creatureType: 'humanoid'`
   (`deriveCombatProfile`) → Hold Person funguje i v PVP na soupeře-hráče.

3. **Sdílený pure helper `canTargetCreatureType(ability, targetType)`** (jediný
   zdroj pravdy, `dnd-combat.ts`):
   - bez `validTargetTypes` → `true`,
   - cíl **neznámého** typu (`undefined` — ad-hoc / narativní quest foe bez
     katalogové šablony) → `true` (graceful, neblokujeme legacy obsah),
   - jinak `validTargetTypes.includes(targetType)`.

4. **Validace ve všech simulátorech:**
   - **Tahové** (dungeon-run solo + AI parťáci, dungeon-party MP + AI, gauntlet,
     duel) — cast na nepovolený typ se **odmítne bez spotřeby zdroje** (engine
     guard u ostatních resource checků; AI ho v selekci „drží").
   - **Spojité** (quest / group-raid / PVP) — ability se v auto-rotaci **přeskočí**
     (→ basic úder), stejně jako u chybějícího slotu/Ki.
   - **API anti-cheat** (dungeon-turn/party/gauntlet/duel services) vrací
     `BadRequest`, aby UI dostalo jasnou chybu (engine je jen defenzivní záloha).

5. **UI gating.** Combat views nesou `enemy.creatureType` + `ability.validTargetTypes`;
   ability bar **zašedne** kouzlo proti aktuálně zvolenému nepovolenému cíli
   (štítek „Bad target"). `buildSpellCard`/`SpellCard` ukazuje řádek
   „Targets: humanoid only" (kompendium/tooltipy).

## Důsledky

- **Balanc-neutrální** mimo nové omezení: jediná dotčená kouzla jsou Hold Person
  varianty; ostatní `validTargetTypes` nemají. Syntetické gear-balance foe nemají
  `creatureType` → graceful `true` → kontrakty beze změny.
- Rozšiřitelné: další type-gated kouzla (Hold Monster = bez omezení, případně
  „undead-only" turn efekty) jen doplní `validTargetTypes`.
- **Follow-up:** žádný povinný; případně friendly-target type-gate (revivify jen na
  humanoidy apod.) na stejné infře.

## Reference

- `packages/shared/src/data/abilities.ts` — `validTargetTypes`, Hold Person.
- `packages/shared/src/dnd-combat.ts` — `canTargetCreatureType`.
- `packages/shared/src/combat.ts` / `data/enemies.ts` — `creatureType` propagace.
- `packages/shared/src/creature-type-targeting.test.ts`, `gauntlet.test.ts` — kontrakty.
