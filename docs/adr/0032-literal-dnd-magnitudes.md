# ADR 0032 — Literal D&D magnitudy (combat HP/damage + per-spell dice & saving throws)

Status: Accepted (MR-10, finální slice balance passu)
Datum: 2026-06-18
Souvisí: ADR 0030 (dice-roll combat), ADR 0031 (bestiář / CR), ADR 0029 (spell sloty)

## Kontext

MR-5 zavedlo D&D dice-roll combat (d20 vs AC, damage dice, saving throws), MR-7 bestiář
+ Challenge Rating + typové poškození, MR-10a–d CR-based AC/attackBonus, per-class weapon
dice a per-ability typy. Ve všech těchto krocích zůstala **magnituda** (HP, poškození)
záměrně autorská idle-pacing data: `CombatActor.attackPower` (spojitý DPS proxy) +
ad-hoc `maxHealth` vzorec u hráče a literal čísla u nepřátel. `weaponDamageSpec`
kalibrovala damage dice tak, aby jejich **průměr ≈ `attackPower`** → kostky daly D&D
*tvar/varianci*, ale magnitudu pořád řídil idle model. CR tabulka řídila jen
AC/attackBonus/save DC/XP, **ne** HP ani poškození.

Roadmapa (MR-10) měla jako poslední, záměrně odložený kus: **literal per-spell dice
(8d6 Fireball nezávisle na attackPower) + CR-based HP/damage magnitudy**. PM rozhodl
provést **plný literal D&D magnitudový model** (čísla mají odpovídat D&D 5e, ne idle
proxy) v jednom inkrementu.

## Rozhodnutí

Combat magnitudy se odvozují z D&D 5e zdrojů:

1. **Hráčské HP** = D&D hit dice: `hitDie + (level−1)·(avg(hitDie) + CON mod)` (min 1).
   Nahrazuje ad-hoc `40 + CON·8 + level·6`. Sjednoceno mezi `deriveStats` (character.ts)
   a `deriveCombatProfile` (combat.ts) — jeden vzorec `dndMaxHp()`.
2. **Nepřátelská HP** = `crStatGuide(cr).hitPoints` (DMG tabulka). Nahrazuje `def.maxHealth`
   v `buildEnemyActor`. CR se odvodí z `level`/`challengeRating` (jako dosud, ADR 0031).
3. **Hráčské základní útoky** = literal weapon/cantrip dice: `attackDie` × **počet podle
   levelu** (martial Extra Attack na 5/11/20 → 1/2/3/4 útoky; caster cantrip scaling na
   5/11/17 → 1/2/3/4 kostky) + atributový modifikátor. `attackPower` se nově **dopočítá
   jako průměr** této literal kostky (zpětná kompatibilita pro sim-knoby — viz níže).
4. **Kouzla = literal D&D dice** (`SignatureAbility.dice` = `DiceSpec`) **nezávisle na
   attackPower**: Fireball 8d6, Magic Missile 3·(1d4+1), Guiding Bolt 4d6 atd. **Upcast**
   (`dicePerSlotAbove`): seslání vyšším slotem přidá kostky (Fireball +1d6/slot). Když má
   ability `dice`, engine hodí přímo je (+ atributový modifikátor u relevantních); jinak
   spadne na starý `damageMult × attackPower` (martial techniky, drainy, healy bez dice).
5. **Per-spell saving throwy** (`SignatureAbility.save`): kouzlo deklaruje `{ ability,
   effect }` — `effect: 'half'` (úspěch = poloviční dmg, Fireball/Moonbeam…) nebo
   `'negate'` (úspěch = žádný dmg, jednoduché „save-or-nothing"). Cíl si hodí proti spell
   save DC útočníka. Nahrazuje dosavadní natvrdo zadrátované DoT-CON / boss-DEX savy
   jednotným per-ability mechanismem ve všech simulátorech.

### Nosiče magnitudy `attackPower` / `maxHealth` zůstávají (re-derived)

`attackPower`/`maxHealth` se NEodstraňují — zůstávají serializovanými poli `CombatActor`,
na kterých staví **sim-knoby** napříč 6 simulátory (raid role-multiplikátory, boss/raid
size scaling, gauntlet wave growth, draft buffy, DoT tick power, healPower). Mění se jen
jejich **zdroj**: počítají se z D&D (body 1–3), takže reprezentují skutečné D&D magnitudy.
Tím zůstává architektura simulátorů beze změny a literal flip má omezený blast-radius.

### Idle 1v1 ↔ D&D party-facing damage (kalibrace)

D&D `damagePerRound` (CR tabulka) je laděný proti **4členné družině**, která ho rozkládá/
soaká. Idle encounter je z větší části **1 hráč vs 1 nepřítel**, a hráč má většinu
encounterů vyhrát. Proto **HP je literal** (CR `hitPoints`, hráč hit dice), ale
nepřátelské **poškození za úder** se odvozuje z `damagePerRound` přes konstantu
`ENEMY_DPR_TO_SWING` (~0.25 trash, vyšší boss) → encounter je vyhratelný a trvá ~6–12
úderů (sledovatelný log). Konstanta je dokumentovaná, izolovaná a laditelná; nemění
literal povahu HP ani kouzel. (D&D solo „deadly" encounter math: damage jednoho monstra
je balancované proti družině, ne proti sólo PC.)

## Důsledky

- **Délka soubojů** klesá z desítek úderů na ~6–12 (blíž D&D ~3–5 kolům) → kratší, údernější
  combat log. **Odměny tím netrpí**: XP/gold/loot závisí na win/loss + wipech + CR XP, ne
  na absolutní HP hodnotě ani počtu eventů (ověřeno auditem všech reward cest).
- `weaponDamageSpec` přestává kalibrovat na `attackPower` — vrací literal weapon dice
  (počet dle levelu). Spell dice jdou novou cestou `abilityDamageSpec`.
- **Healing power**: `attackPower` u casterů reprezentuje spell output → healy/štíty v
  raidu i gauntletu škálují dál na (nyní D&D) `attackPower`; heal kouzla mohou mít `dice`.
- **Zobrazení** (NpcProfile, inspect) čte magnitudy přes stejný engine → konzistentní s
  bojem (combat-lookup bere HP/dmg z CR jako bestiář).
- Combat zůstává **deterministický** (SeededRng) a **sdílené jádro** `rollHit` slouží všem
  simulátorům — žádná duplikace per-hit vzorců (CLAUDE.md).
- Balanc CR-přiřazení obsahu a finální tuning `ENEMY_DPR_TO_SWING` / upcast hodnot je
  laditelný follow-up (čísla, ne architektura).

## Alternativy zvážené

- **Ukotvený model** (8d6 škálované na attackPower, magnitudy zůstávají idle): menší riziko,
  ale čísla nejsou D&D → PM odmítl.
- **Odstranit `attackPower` úplně**: čistší, ale rozbíjí všechny sim-knoby (role mult, wave
  growth) → velký churn bez funkčního přínosu. Zamítnuto ve prospěch re-derive.
