# ADR 0031 — D&D bestiář + Challenge Rating (MR-7)

Status: Accepted · Datum: 2026-06-18

## Kontext

MR-5 sjednotil veškerý combat na D&D dice-roll model (ADR 0030), ale nepřátelé
zůstali „ploší": jen `maxHealth`/`attackPower`/`swingInterval` (+ AC/attackBonus
odvozené ~level/2 z úrovně obsahu) a **bez typu poškození**. Combat tak neuměl
D&D pilíře nestvůr — **damage typy**, **resistance/vulnerability/immunity** a
**Challenge Rating** (principiální zdroj statů + XP).

MR-7 to dodává jako další vertikální přírůstek nad MR-5, **bez rebalancu**
existujícího obsahu (přiřazení CR dungeonům/raidům + finální čísla = MR-10).

## Rozhodnutí

### Nová čistá datová vrstva (`packages/shared`, jediný zdroj pravdy)

- **`data/damage.ts`** — žádný import z `combat.ts` → žádný runtime cyklus:
  - 13 D&D **damage typů** (3 fyzické + 10 magických), `CreatureType` (14 rodin).
  - **Resistance/vulnerability/immunity math**: `damageInteraction(type, defenses)`
    (priorita immunity > zbytek; resist + vuln na stejný typ se ruší) +
    `applyDamageInteraction(amount, interaction)` (×0.5 zaokrouhleno dolů / ×2 / ×0).
  - **Challenge Rating**: kompletní DMG tabulka CR 0–30 → doporučené staty
    (`crStatGuide`: AC, HP, attack bonus, damage/round, save DC, proficiency, XP).
    Helpery `xpForChallengeRating`, `proficiencyForChallengeRating`,
    `formatChallengeRating` (`1/8`, `1/4`, `1/2`).
- **`data/enemies.ts`** — bestiář: `EnemyTemplate` (id, name, creatureType, cr,
  attackType, resistances/vulnerabilities/immunities, unikátní `EnemyAbility[]`).
  Reprezentativní katalog napříč creature typy a CR (skelet vulnerable na
  bludgeoning + immune poison, fire elemental immune fire / vulnerable cold,
  treant resist fyzické / vulnerable fire, wraith life-drain, young red dragon
  fire breath…). Builder `buildBestiaryEnemy(template, overrides?)` → `EnemyStats`
  (HP/damage z CR doporučení nebo přepisu šablony; AC/attackBonus/save DC z CR;
  damage profil propsaný).

### Combat engine (`combat.ts`) — typové poškození živé ve všech simulátorech

- `CombatActor` i `EnemyStats` dostávají volitelná pole `damageType`,
  `resistances`, `vulnerabilities`, `immunities` (zpětně kompatibilní).
- Sdílené jádro **`rollHit`** po výpočtu poškození aplikuje
  `damageInteraction` cíle: immune → 0, jinak min. 1 (chip damage). Protože
  `rollHit` je jediné jádro (ADR 0030 increment 2), mechanika je **automaticky
  živá** ve všech 6 simulátorech bez změny call-sites.
- `damageType` útoku: explicitní override (ability) → `attacker.damageType` →
  fyzické (`bludgeoning`) default. `computeHit`/`resolveAttack` přijímají
  volitelný `damageType` (ability-typed poškození, např. Fireball vs fire-immune).
- `HitResult` nese `damageType` + `damageInteraction`; `buildDndAttackMessage`
  připojí note `(resisted)`/`(vulnerable!)`/`(immune)` (jen když není `normal` →
  žádná změna existujících logů/testů).

## Rozsah vs. follow-up

**Hotovo:** damage typy + resist/vuln/immunity math + CR tabulky + bestiář +
builder + napojení do dice-roll combatu + log note. 458 shared testů zelené.

**Záměrně mimo (MR-10 balance pass):** přemapování existujících dungeon/raid
nepřátel na bestiář a CR, převzetí D&D damage dice per zbraň/kouzlo, recalibrace
XP/loot dle CR. Hráčské útoky jsou zatím defaultně fyzické (per-zbraň damage typ
= gear redesign v MR-10); ability-typed poškození má hook (`damageType` param),
ale `SignatureAbility` ještě nenese damage typ (doplní MR-10 spolu se spell daty).

## Důsledky

- (+) D&D pilíře nestvůr (typy, resist/vuln/immunity, CR/XP) jako znovupoužitelná
  datová vrstva — content authoring i budoucí balanc z ní čerpá.
- (+) Resistance/vulnerability mechanika je živá okamžitě ve všech simulátorech
  (sdílené `rollHit`), jakmile cíl má obrany — nulová duplikace.
- (+) CR = principiální zdroj statů/XP místo ad-hoc čísel (připraveno pro MR-10/11).
- (−) Bestiář zatím není napojený na živý obsah (dungeony dál používají inline
  `EnemyDef`) → demonstrační/přípravná vrstva, plné využití v MR-10. Vědomý
  mezikrok (malé vertikální přírůstky).

## Alternativy

- **Rovnou přemapovat všechny dungeon/raid nepřátele na bestiář.** Zamítnuto —
  rebalanc tuned encounterů = MR-10, velký rizikový refaktor v jednom kroku.
- **Resistance jako flat armor/procento, ne typové.** Zamítnuto — neplní D&D
  model (typové resist/vuln/immunity) a nesedí na damage typy/CR.
