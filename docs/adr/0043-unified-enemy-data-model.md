# ADR 0043 — Sjednocený enemy datový model (jeden zdroj pravdy)

- **Stav:** přijato (refactor hotový, balanc beze změny)
- **Kontext:** navazuje na MR-7 (bestiář + Challenge Rating, ADR 0031), MR-10
  (CR-based magnitudy, ADR 0032) a dungeon overhaul (ADR 0037 — multi-enemy
  encountery). Rozhodnutí PM: **plné sjednocení naráz** (vědomě nad rámec
  „malé vertikální přírůstky", protože enemy model je sdílený napříč všemi
  simulátory a chceme jeden základ pro „Enemy schopnosti" + „Bestiář pro hráče").
- **Rozsah:** `packages/shared` — `data/enemies.ts` (katalog + resolver),
  `data/dungeons.ts` (autoring přes katalog), `quest-run.ts` + `data/quests.ts`
  (quest foes katalog-aware), `gauntlet.ts` (jména z katalogu). **Bez DB migrace,
  bez API změn, bez změny veřejného tvaru `EnemyDef`/`EncounterDef`.**

## Kontext

Před refaktorem existovaly **tři nezávislé „zdroje pravdy"** pro nepřátele:

1. **Bestiář** (`data/enemies.ts`, `EnemyTemplate`) — bohatý D&D stat block
   (creature type, CR, typ útoku, resistance/vulnerability/immunity, ability),
   ale **nikdy nepoužitý** žádným obsahem (jen reference vrstva z MR-7).
2. **Dungeon** (`data/dungeons.ts`) — ~32 nepřátel **inline** (`EnemyDef`),
   duplikované vzory (opakované defense-arraye undead/fire/nature napříč
   pozdními dungeony), bez creature typu, bez popisu, bez napojení na katalog.
3. **Quest** (`data/quests.ts`, `QuestFoe`) — elegantní abstraktní tier
   systém (jméno + tier → CR), **bez** typové identity.
4. **Gauntlet** (`gauntlet.ts`) — vlastní hardcoded seznam jmen nepřátel.

Všechny cesty už konvergovaly na `EnemyStats` → `buildEnemyActor` → `CombatActor`
(sdílené CR math z ADR 0032). Fragmentace byla na **autorské** vrstvě.

## Rozhodnutí

1. **Katalog (`data/enemies.ts`) = jediný zdroj pravdy enemy identity.** Rozšířen
   o **všechny konkrétní dungeon kreatury** (named bossové + trash archetypy) jako
   `EnemyTemplate` (creature type, CR, typ útoku, obrany, popis). Typy/obrany jsou
   převzaty **1:1** z původních inline dat.

2. **Sdílený resolver `instantiateEnemy(templateId, overrides)`** staví
   `EnemyStats & { id }` (= `EnemyDef`):
   - **Identita** (jméno, `damageType` = `attackType`, resistance/vulnerability/
     immunity) ze šablony.
   - **Magnituda / pacing** z kontextu (`level`/`challengeRating`/`swingInterval`/
     `armor`/`isBoss`/`maxHealth`/`attackPower`).
   - Když je dán `level`/`challengeRating`, šablonové `cr` se do `EnemyStats`
     **záměrně nepřebírá** (zůstává jen pro bestiář referenci) → dungeon spadne na
     svůj content level (`group.ts` default `requiredLevel`), takže **level-scaling
     a balanc zůstávají beze změny**.

3. **Dungeony autorují přes katalog.** `data/dungeons.ts` nahradil inline
   `enemy(id, name, swing, opts)` za `e(templateId, swing, opts)` (resoluje přes
   `instantiateEnemy`). Oslabení minioni = varianta téže šablony s `id`/`name`/
   `level` přepisem. `EncounterDef.enemies` se resolvuje na konkrétní `EnemyDef[]`
   už při definici → **downstream (group/dungeon-run/dungeon-party/API/web) se
   nedotklo** (stejný tvar dat).

4. **Quest foes katalog-aware (volitelně).** `QuestFoe` dostal volitelný
   `template?` (id katalogu). Když je dán a existuje, foe **zdědí typovou identitu**
   ze šablony; magnituda i tak plyne z levelu questu × tieru (`questFoeStats`).
   Chybí ⇒ generický fyzický foe (**zpětně kompatibilní** — stovky stávajících
   questů beze změny). Neznámé id → tichý fallback (žádný throw v quest pathu).

5. **Gauntlet jména z katalogu.** Paralelní hardcoded seznam jmen nahrazen
   curated podmnožinou katalogových id (jméno z `BESTIARY[id].name`). Typové
   obrany se do Gauntlet combatu **zatím nepropisují** (magnitudy/typing beze
   změny — typed Gauntlet nepřátelé = follow-up „Enemy schopnosti").

## Proč je to balanc-neutrální

- Magnitudy (HP/AP/AC) se v dungeonu dál odvozují z **content levelu**, ne ze
  šablonového CR (viz bod 2). `group.test`/`dungeon-run`/`dungeon-party` zelené.
- Dosud **netypovaní** nepřátelé dostali *fyzický* `attackType` (slashing/piercing/
  bludgeoning). `attackDamageType` v `combat.ts` mapuje `undefined → 'bludgeoning'`
  (taky fyzické) a `RAGE_RESIST_TYPES` pokrývá všechny 3 fyzické typy → přiřazení
  jakéhokoli fyzického typu je **mechanicky inertní** (i vůči Barbarian rage).
- **Typovaní** late-game nepřátelé (Zarfarai/Maradoth/Cinderdeep/Pyrehold) mají
  v katalogu přesně tytéž obrany/typy jako dřív inline → `dungeons.test` (MR-10d
  class-counter) zelené.

## Důsledky

- **+** Jeden zdroj pravdy enemy identity → základ pro „Enemy schopnosti" (aktivní
  abilities/conditiony) i „Bestiář pro hráče" (in-game encyklopedie čte katalog).
- **+** Konec duplikace defense-arrayů; nová dungeon kreatura = jeden řádek `e(...)`.
- **+** Quest/Gauntlet napojené na stejný katalog (jména/identita z jednoho místa).
- **−** Šablonové `cr` u dungeon kreatur je momentálně jen referenční (bestiář),
  ne combat-aktivní; combat magnituda dál z content levelu (záměr — viz balanc).
- **Follow-up:** typed Gauntlet nepřátelé, migrace vybraných quest foes na
  `template`, aktivní enemy abilities (`EnemyAbility` v enginu), player bestiář UI.

## Verifikace

Build/test/lint/typecheck zelené (shared 626→+ kontraktní testy `instantiateEnemy`
+ quest template inheritance; api 199; web). Kontrakt: `data/enemies.test.ts`,
`data/dungeons.test.ts`, `quest-run.test.ts`, `gauntlet.test.ts`, `group.test.ts`.
