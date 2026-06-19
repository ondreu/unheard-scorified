# D&D dice-roll combat (MR-5)

D&D 5e hod na zásob, damage dice, saving throws a initiative. Idle / auto-resolve
(hráč nastavuje jen rotaci, ne jednotlivé tahy). Viz **ADR 0030**.

**Stav:** increment 1 (quest combat) + increment 2 (sjednocení **všech** simulátorů
— dungeon/raid/PVP/aréna/Gauntlet) hotové. `computeHit` i `resolveAttack` jsou tenké
wrappery nad sdíleným jádrem `rollHit` → jeden combat model. Plné D&D číselné
převzetí (per-zbraň/kouzlo dice, CR-based AC/HP/damage) = balanc MR-10.

## Sdílená primitiva

- **`dice.ts`** — `rollD20`, `rollDice(count, sides)`, `rollAttack(bonus)`
  (nat 20 = crit, nat 1 = fumble), `attackHits(roll, ac)`, `rollSave(bonus, dc)`,
  `diceNotation`/`diceAverage`/`formatRoll`. Náhoda jen přes `SeededRng`.
- **`dnd-combat.ts`** — resolution nad `CombatActor`:
  - `resolveAttack(attacker, defender, rng, { abilityMult, autoHit })` → d20 +
    attackBonus vs AC → hit/miss/crit; damage = damage dice × abilityMult (crit
    zdvojnásobí počet kostek).
  - `savingThrow(defender, rng, ability, dc)`, `rollInitiative(actor, rng)`.
  - `buildDndAttackMessage` / `buildSaveMessage` — anglické log řádky.

## D&D staty aktéra (`CombatActor`, volitelné)

`deriveCombatProfile` (postava) a `questFoeStats` (nepřítel) je počítají:

| Pole          | Postava (D&D 5e)                          |
| ------------- | ----------------------------------------- |
| `armorClass`  | 10 + DEX mod + gear armor bonus           |
| `attackBonus` | proficiency + primary stat mod            |
| `damageBonus` | primary stat mod                          |
| `saveMods`    | modifikátory všech 6 atributů             |
| `spellSaveDc` | 8 + proficiency + casting mod             |
| `spellSlots`  | max spell sloty (MR-4)                     |

**Damage dice** (`weaponDamageSpec`) = `N`d`sides` + bonus kalibrované tak, aby
průměr ≈ `attackPower`. `sides` = **per-class kostka zbraně/cantripu** (`attackDie`):
Barbarian d12, martial d8 (Fighter/Paladin/Ranger/Bard), d6 (Rogue/Monk/Cleric/Druid),
caster d10 (Sorcerer/Warlock/Wizard); nepřátelé default d6. Větší kostka = méně
kostek + vyšší variance, **magnitudu drží `attackPower`** (MR-10b). Plný literal
redesign (8d6 Fireball nezávisle na attackPower) + CR-based magnitudy = další MR-10.

## Quest combat (increment 1)

`simulateQuestEncounter`:

1. **Initiative** (d20 + DEX) → kdo útočí první (v logu).
2. **Hod na zásah** d20 + attackBonus vs AC → HIT/MISS/CRITICAL. Log:
   `Hero attacks Goblin: rolls 14 + 6 = 20 vs AC 13 → HIT for 28 damage.`
3. **Saving throws**: hráčova damaging spell (DoT/area) → nepřítel CON save (úspěch
   = poloviční dmg); boss každý 3. tah sešle „special" (1.6×) → hráč DEX save.
4. **Spell sloty (MR-4)**: kouzla (tier ≥ 1) čerpají snapshot slotů jako rozpočet
   běhu; po vyčerpání fallback na zbraň/cantrip. Log: `casts Fireball (3rd-level slot)`.
5. **Enemy AC/attackBonus/save DC** se berou z **Challenge Ratingu** (DMG tabulka
   `crStatGuide`): `questFoeStats` mapuje úroveň questu + tier na CR (MR-10a) →
   reálný kontest; combat-objective questy gated buildem (novice prohraje).

No-fail flavor combat i combat-objective (lze prohrát) zachovány; odměny netknuté.

## Sjednocení simulátorů (increment 2)

`computeHit` přepsán na dice (sdílené jádro `rollHit`) → **dungeon/raid/PVP/aréna/
Gauntlet** běží na stejném D&D modelu. `HitResult` nese `hit`/`roll`/`targetAc`;
miss = `amount: 0` s miss-aware logem (`missMessage` + kompaktní `rollTag`
`[d20: 14 + 6 = 20 vs AC 13]`). Nepřátelé dostávají AC/attackBonus/save DC z
**Challenge Ratingu**: `EnemyStats.challengeRating` (explicitní) → jinak z
`EnemyStats.level` přes `crForContentLevel` (+boss) → `crStatGuide` (DMG tabulka)
v `buildEnemyActor`. Explicitní `armorClass`/`attackBonus`/`spellSaveDc` mají přednost.

## MR-10d — per-ability typy + typovaný late-game obsah ✅

**Per-ability damage typy.** `SignatureAbility.damageType` přebíjí typ classy pro
konkrétní kouzlo → caster **není type-locked**: Wizard hází Magic Missile (force),
Fireball (fire); Druid Produce Flame (fire) / Moonbeam (radiant) / Call Lightning
(lightning); Warlock Hex/Drain Life (necrotic); Bard Vicious Mockery (psychic).
Martial techniky `damageType` nemají → zdědí typ zbraně (fyzické). Engine bere
`ability.damageType ?? attacker.damageType` na **přímém zásahu** (quest/raid/gauntlet/
PVP — `computeHit`/`resolveAttack` override) **i na DoT tikách** (raid/gauntlet
spočítají interakci s obranami cíle při scheduleru → fire DoT „neproteče" fire-immune
cílem).

**Typovaný late-game obsah (14–20).** Dungeony i raidy 14+ dostaly thematické
obrany (bestiář/MR-7): Pyrehold (undead) = vuln radiant → Cleric/Paladin DOMINUJÍ;
Maradoth (nature/earth) = resist physical + vuln fire → „bring a caster"; Cinderdeep
& Cinderforge (fire) = resist fire; Flamelord Ignaroth = **immune fire** (fér: každý
caster má ne-fire kouzlo). Vytváří class-counter dynamiku + aktivuje typový systém
v obsahu, kde na hloubce záleží. _Magnitudy (HP/AP) nedotčené._

## MR-10b — per-class weapon dice + typed útoky ✅

Damage dice dostaly **per-class tvar** (`ClassDef.attackDie` → `CombatActor.attackDie`
→ `weaponDamageSpec`): místo generického d6 hází Barbarian d12, casteři d10 atd.
Magnitudu pořád drží `attackPower` (balanc-neutrální, mění se jen variance + log
notace `5d12+32`). Hráčské útoky navíc dostaly **typ poškození** (`attackDamageType`):
martial = fyzické (slashing/piercing/bludgeoning), casteři = signature element
(fire / force / radiant) → **resistance/vulnerability/immunity (MR-7) je teď živá i
pro hráče**. Pro existující obsah je to inertní (dungeon/raid/quest nepřátelé nemají
obrany), aktivuje se s bestiářem (MR-10d). Spelly zatím sdílí typ classy; literal
per-spell dice/typy (Fireball = 8d6 fire) = závěrečný MR-10 slice.

## MR-10a — CR-based enemy staty ✅

Ad-hoc `~level*0.55` placeholdery (AC/attackBonus) nahrazeny **D&D Challenge
Ratingem**: `crForContentLevel(level, isBoss)` mapuje úroveň obsahu (1–20, MR-11) na
CR (trash = CR level, boss +2 CR; clamp 0–30 i pro Gauntlet „efektivní" vlny nad
cap), `crStatGuide` z toho dá AC/attackBonus/save DC z DMG tabulky. Sjednoceno
napříč všemi simulátory (dungeon/raid/quest/Gauntlet) — `buildEnemyActor` i
`questFoeStats`. **HP/poškození (idle pacing) zůstávají autorská data** (CR-based
HP/damage + per-zbraň/kouzlo dice = další MR-10 slice).

## Follow-up

- Plný damage-dice redesign per zbraň/kouzlo (1d8+STR, 8d6 Fireball) + save-heavy
  kouzla + CR-based HP/damage → **MR-10 (balance pass: převzetí D&D čísel)**.

## MR-10e — literal D&D magnitudy + per-spell dice & saving throwy ✅ (ADR 0032)

Závěrečný MR-10 slice: combat magnitudy přestaly být idle proxy a převzaly D&D 5e čísla.

**HP (literal D&D hit dice).** Sjednocený vzorec `dndMaxHp(hitDie, level, conMod)` =
`hitDie + (level−1)·(avg(hitDie) + CON mod)`. Sdílí ho `deriveStats` (character sheet)
i `deriveCombatProfile` (combat engine) → nemůžou se rozejít. Nepřátelská HP = CR
`hitPoints` (DMG tabulka) přes `crEnemyMagnitude`.

**Poškození.** Hráčův základní útok = `basicAttackDiceCount(level, caster)` útoků/kostek
(D&D Extra Attack u martialů 5/11/20, cantrip scaling u casterů 5/11/17) × průměr
weapon die + damage modifikátor. Nepřátelské poškození za úder = CR `damagePerRound` ×
`ENEMY_DPR_TO_SWING` (idle 1v1 kalibrace: D&D dpr je laděný proti družině, sólo idle
nepřítel udeří zlomkem → encounter vyhratelný, ~6–12 úderů; boss tvrději). HP zůstává
literal.

**Kouzla = literal dice (nezávisle na `attackPower`).** `SignatureAbility.dice`
(`DiceSpec`): Fireball 8d6, Magic Missile 3d4+3 (`autoHit`), Guiding Bolt 4d6, Sacred
Flame 1d8, Fire Bolt 1d10, Call Lightning 3d10… Engine je hodí přímo přes
`abilityDamageSpec` (crit zdvojí počet kostek). **Upcast** `dicePerSlotAbove` = kostek
navíc za každý tier nad `spellTier` (Fireball +1d6/slot). Ability bez `dice` (martial
techniky/drainy/healy) škálují dál přes `attackPower` (`damageMult` + execute).

**Per-spell saving throwy.** `SignatureAbility.save` = `{ ability, effect }`; sdílený
`applySpellSave` (dnd-combat.ts) hodí cíli záchranný hod proti spell save DC útočníka:
`'half'` = úspěch půlí poškození (Fireball/Moonbeam/Call Lightning…), `'negate'` =
úspěch ruší (Sacred Flame DEX, Vicious Mockery WIS). Nahrazuje natvrdo zadrátované
DoT-CON / boss-DEX savy jednotným per-ability mechanismem ve všech simulátorech.

**Nosiče magnitudy.** `attackPower`/`maxHealth` zůstávají serializovaná pole
`CombatActor` (sim-knoby: raid role-mult, boss/size scaling, gauntlet wave growth,
DoT/heal power) — jen re-derived z D&D. Dungeon/raid data převedena na CR-odvození
(`enemy()`/`boss()` helpery už nenesou HP/AP, bossové gradují přes `challengeRating`).

## Gear & balance follow-up — D&D-věrný gear + bounded ability skóre ✅ (ADR 0035)

Dokončení MR-10e follow-upu. Verification-first: kalibrační harness
`gear-balance.test.ts` měří poměr efektivní síly full-BiS / nahá postava a délku
on-level 1v1 (TTK / win-rate / zbylé HP) přes seedované simulace — slouží jako
kontrakt i ladicí nástroj.

**Konec per-level růstu skóre (bounded accuracy).** `PER_LEVEL_GROWTH` (dříve +1 ke
každému atributu za level → na lvl 20 +19, primár ~39, mod +14) **odstraněn**. Ability
skóre teď plynou jen ze standard array + rasy + **ASI** (4/8/12/16/19) a innate skóre
je **clampnuto na 20** (`ABILITY_SCORE_CAP`, D&D PHB) v `baseStatsFor`/`abilityScoresFor`
i v combat enginu (`min(20, innate+ASI) + gear`). Naked lvl 20 je tak na D&D škále
(AC ~13–14, attack bonus +10, spell DC ~17), ne 2× nafouklé.

**D&D-věrný gear (`scripts/rescale-gear.py`).** Katalog `items.ts` (≈340 statových
kusů) přepsán z WoW magnitud na D&D budget odvozený z (itemLevel, rarity, slot, role):
zbraně/šperky → `attack_power`/`spell_power` (martial vs caster z role), armor sloty →
`armor` (→ AC), trinkety → `crit_rating`, ability skóre **jen vzácně** (epic+ trinket
+1, „stat stick"; cap +2 z celého setu) → žádná kaskáda přes AC/attack/DC. Full BiS na
lvl 20 ≈ **1.5–2× efektivní síla** nahé postavy (rozhodnutí PM; bounded accuracy).

**`armor` → AC.** `ARMOR_PER_AC = 40` (jediný zdroj pravdy; gear `armor`/40 = +AC).
Full BiS ≈ +3 AC nad naked. Po rescale gearu (armor desítky, ne stovky) nezpůsobuje
explozi AC.

**Enemy 1v1 kalibrace (re-tune).** Po D&D-ifikaci base (nižší HP/AP hráče) přeladěny
idle 1v1 faktory: `ENEMY_HP_FACTOR` 0.26 trash / 0.40 boss, `ENEMY_DPR_TO_SWING` 0.08
trash / 0.10 boss → geared **martial** on-level: trash rychlý (3–5 úderů, drobná HP
ztráta), boss 5–8 úderů s vítězstvím a ~45–62 % HP; naked výrazně riskantnější (gear
má váhu).

**Známé omezení — casteři (odloženo na „Fix kouzla").** Leveled kouzla/cantripy běží
na **literal D&D kostkách** (Fire Bolt 1d10, Fireball 8d6), které jsou na idle škále
hluboko pod martial `attackPower` (~40–70/úder), a cantripy navíc neškálují s levelem.
Po odstranění HP crutche (growth) tak wizard/cleric nejsou na high-level bossech
viable. Náprava = samostatný milník **„Fix kouzla nesedící na D&D"** (rozhodnutí PM):
škálování cantripů (D&D 1→2→3→4 kostek) + sustained leveled kouzel. Gear/base/enemy
čísla z tohoto passu zůstávají.
