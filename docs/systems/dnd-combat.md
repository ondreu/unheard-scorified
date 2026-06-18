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
