# Bestiář + Challenge Rating (MR-7)

D&D vrstva nestvůr nad dice-roll combatem (MR-5, viz `dnd-combat.md`). Přidává
**damage typy**, **resistance / vulnerability / immunity** a **Challenge Rating**.
Rozhodnutí: `docs/adr/0031`.

> Jediný zdroj pravdy: `packages/shared/src/data/damage.ts` (typy + CR math) a
> `packages/shared/src/data/enemies.ts` (katalog). Combat z nich jen čte.

## Damage typy

13 D&D 5e typů poškození:

- **Fyzické (3):** `slashing`, `piercing`, `bludgeoning`.
- **Magické (10):** `fire`, `cold`, `lightning`, `thunder`, `acid`, `poison`,
  `necrotic`, `radiant`, `force`, `psychic`.

Hráčský základní útok je defaultně fyzický (`bludgeoning`) — per-zbraň damage typ
přijde s gear redesignem (MR-10). Nestvůry mají `attackType` ze šablony; ability
mohou mít vlastní typ (`EnemyAbility.damageType`).

## Resistance / vulnerability / immunity

Obranný profil cíle (`DamageDefenses`): `resistances` (×0.5, zaokrouhleno dolů),
`vulnerabilities` (×2), `immunities` (×0).

Priorita (`damageInteraction`): **immunity > zbytek**; resistance + vulnerability
na stejný typ se ruší → `normal`. Aplikace v jádru `rollHit` (`combat.ts`): immune
→ 0, jinak min. 1 (chip damage). Protože `rollHit` je sdílené jádro všech 6
simulátorů (ADR 0030), mechanika je živá všude bez změny call-sites. Combat log
(`buildDndAttackMessage`) připojí `(resisted)` / `(vulnerable!)` / `(immune)`.

## Challenge Rating

Kompletní DMG tabulka CR **0–30** (zlomky 1/8, 1/4, 1/2 jako `0.125`/`0.25`/`0.5`)
→ doporučené staty (`crStatGuide`):

| Pole | Význam |
| ---- | ------ |
| `proficiency` | proficiency bonus nestvůry |
| `armorClass` / `hitPoints` | doporučené AC / HP (střed pásma) |
| `attackBonus` / `damagePerRound` | doporučený útočný bonus / poškození na úder |
| `saveDc` | spell save DC speciálních útoků |
| `xp` | XP odměna za poražení (D&D 5e) |

Helpery: `xpForChallengeRating`, `proficiencyForChallengeRating`,
`formatChallengeRating` (`1/8`…). Mimo rozsah → clamp na nejbližší okraj.

## Bestiář (katalog)

`EnemyTemplate` = id · name · description · `creatureType` (14 D&D rodin) · `cr` ·
`attackType` · resist/vuln/immunity · `abilities` · volitelný `isBoss` a přepisy
HP/damage.

Příklady (demonstrují mechaniky):

| Nestvůra | Type | CR | Obrany |
| -------- | ---- | -- | ------ |
| Skeleton Warrior | undead | 1/4 | vuln bludgeoning, immune poison |
| Fire Elemental | elemental | 5 | immune fire/poison, vuln cold, resist fyzické |
| Grave Wraith | undead | 5 | immune necrotic/poison, vuln radiant + Life Drain |
| Ancient Treant | plant | 9 | resist bludgeoning/piercing, vuln fire |
| Young Red Dragon | dragon | 10 (boss) | immune fire + Fire Breath |

### Buildery

- `buildBestiaryEnemy(template, overrides?)` → `EnemyStats` (id, HP/damage z CR
  doporučení nebo přepisu šablony, AC/attackBonus/saveDc z `crStatGuide`, boss +2 AC,
  damage profil propsaný). `bestiaryEnemyById(id, overrides?)` totéž z id. Bere
  **fixní šablonové CR** → vhodné pro reference / player bestiář / ad-hoc encountery.
- `instantiateEnemy(templateId, overrides?)` → `EnemyStats & { id }` (= `EnemyDef`)
  — **sdílený resolver pro obsah** (ADR 0043). Identita (jméno, typ útoku, obrany)
  ze šablony; magnituda/pacing z kontextu (`level`/`challengeRating`/`swingInterval`/
  `armor`/`isBoss`). Když je dán `level`/`challengeRating`, šablonové `cr` se
  nepřebírá → magnituda plyne z **content levelu** (level-scaling obsahu).

Indexy: `BESTIARY` / `BESTIARY_IDS`, `getEnemyTemplate`, `enemiesByCreatureType`,
`enemiesByChallengeRating`.

## Rozsah (po sjednocení enemy modelu, ADR 0043)

Katalog je **jediný zdroj pravdy enemy identity**:

- **Dungeony** (`data/dungeons.ts`) autorují přes `instantiateEnemy` (`e(templateId, …)`)
  — všechny dungeon kreatury (named bossové + trash archetypy) žijí jako
  `EnemyTemplate`. Magnituda dál z content levelu (balanc beze změny).
- **Quest foes** (`QuestFoe.template`) volitelně dědí typovou identitu z katalogu
  (magnituda z level×tier). Bez `template` = generický fyzický foe.
- **Gauntlet** táhne jména nepřátel z katalogu (typové obrany zatím nepropsané —
  follow-up „Enemy schopnosti").

Follow-up: aktivní enemy abilities (`EnemyAbility` v enginu), typed Gauntlet
nepřátelé, in-game **bestiář pro hráče** (encyklopedie čtoucí katalog).
`SignatureAbility` (hráčské ability) nese damage typ od MR-10/ADR 0036.
