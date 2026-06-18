# D&D dice-roll combat (MR-5)

D&D 5e hod na zásob, damage dice, saving throws a initiative. Idle / auto-resolve
(hráč nastavuje jen rotaci, ne jednotlivé tahy). Viz **ADR 0030**. Zaváděno
inkrementálně — **increment 1 = quest combat**; dungeon/raid/PVP/aréna/Gauntlet
zatím na continuous modelu (increment 2).

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

**Damage dice** (`weaponDamageSpec`) = `N`d6 + bonus kalibrované tak, aby průměr
≈ `attackPower` (magnitudy zachovány; plný NdX redesign 1d8+STR / 8d6 = MR-10).

## Quest combat (increment 1)

`simulateQuestEncounter`:

1. **Initiative** (d20 + DEX) → kdo útočí první (v logu).
2. **Hod na zásah** d20 + attackBonus vs AC → HIT/MISS/CRITICAL. Log:
   `Hero attacks Goblin: rolls 14 + 6 = 20 vs AC 13 → HIT for 28 damage.`
3. **Saving throws**: hráčova damaging spell (DoT/area) → nepřítel CON save (úspěch
   = poloviční dmg); boss každý 3. tah sešle „special" (1.6×) → hráč DEX save.
4. **Spell sloty (MR-4)**: kouzla (tier ≥ 1) čerpají snapshot slotů jako rozpočet
   běhu; po vyčerpání fallback na zbraň/cantrip. Log: `casts Fireball (3rd-level slot)`.
5. **Enemy AC/attackBonus** škálují ~level/2 (`questFoeStats`) → reálný kontest;
   combat-objective questy gated buildem (novice prohraje).

No-fail flavor combat i combat-objective (lze prohrát) zachovány; odměny netknuté.

## Follow-up

- **Increment 2**: migrace dungeon/raid/PVP/aréna/Gauntlet na `resolveAttack`
  (recalibrace encounterů, Elo/wipe).
- Plný damage-dice redesign per zbraň/kouzlo + save-heavy kouzla → MR-7 (bestiář/
  CR) + MR-10 (balance pass).
