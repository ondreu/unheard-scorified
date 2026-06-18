# ADR 0030 — D&D dice-roll combat (MR-5, increment 1)

Status: Accepted · Datum: 2026-06-18

## Kontext

MR-5 přidává D&D 5e **dice-roll combat**: hod na zásah d20 + attack bonus vs AC
(hit/miss), damage dice, saving throws, initiative — místo continuous modelu
(`computeHit` = attackPower × variance × crit × armor reduction). Combat zůstává
**idle / auto-resolve** (hráč nenastavuje jednotlivé tahy, jen rotaci).

Combat engine je sdílený napříč 6 simulátory (quest, grind, dungeon, raid, PVP,
Gauntlet) přes primitiva v `combat.ts`. Přepsat všechny najednou by byl velký
rizikový refaktor (tuned encounter HP, wipe křivky, enrage timery, Elo) → v
rozporu s „malé vertikální přírůstky" (CLAUDE.md). Proto **inkrementálně** (jako
M8.5 / M12 / M14).

## Rozhodnutí — increment 1

### Nové sdílené moduly (deterministické, jen `SeededRng`)

- **`dice.ts`** — kostky: `rollD20`, `rollDice(count,sides)`, `rollAttack`
  (d20 + bonus, nat 20 = crit, nat 1 = fumble), `attackHits(roll, ac)`, `rollSave`,
  notace/průměr/format helpery.
- **`dnd-combat.ts`** — D&D resolution nad `CombatActor`: `resolveAttack`
  (d20 + attackBonus vs AC → hit/miss/crit + damage dice × abilityMult),
  `savingThrow`, `rollInitiative`, log-buildery
  (`Hero attacks Goblin: rolls 14 + 6 = 20 vs AC 13 → HIT for 28 damage.`).

### `CombatActor` rozšířen o D&D pole (volitelná, zpětně kompatibilní)

`armorClass`, `attackBonus`, `damageBonus`, `saveMods`, `spellSaveDc`,
`spellSlots`. `deriveCombatProfile` je počítá z efektivních atributů (D&D 5e:
AC = 10 + DEX mod + gear; attackBonus = prof + primary mod; spell save DC =
8 + prof + casting mod; spell sloty z MR-4). Ostatní simulátory pole ignorují →
**žádná změna chování** (dál continuous `computeHit`).

### Damage dice — kalibrace

`weaponDamageSpec(actor)` = `N`d6 + bonus kalibrované tak, aby **průměr ≈
`attackPower`** → magnitudy zachovány, balanc se mění jen o **miss chance**.
Crit zdvojnásobí **počet kostek** (D&D: kostky, ne bonus). Plný NdX redesign per
zbraň/kouzlo (1d8+STR, 8d6 Fireball) = MR-10 (závisí na itemizaci/spell datech).

### Quest combat = první adoptér (end-to-end)

`simulateQuestEncounter` přepsán na dice:
- **Initiative** (d20 + DEX) rozhodne, kdo útočí první (v logu).
- **Hod na zásah** d20 + attackBonus vs AC → hit/miss/crit, damage dice.
- **Saving throws**: hráčova damaging spell (DoT/area) → nepřítel CON save (úspěch =
  půlka); boss občas (každý 3. tah) sešle telegrafovaný „special" (1.6×) → hráč
  DEX save (úspěch = půlka).
- **Spell sloty (MR-4 hookup)**: kouzla (tier ≥ 1) čerpají snapshot spell slotů
  jako rozpočet v rámci běhu; když dojdou, postava sáhne po zbrani/cantripu
  (log: „casts Fireball (3rd-level slot)"). **Spell sloty teď v boji reálně něco
  znamenají.**
- **Enemy AC/attackBonus škálují ~level/2** (`questFoeStats`) — drží krok s
  inflovanými D&D modifikátory hráče (`baseStatsFor` přidává +1/level skóre), aby
  byl boj reálný kontest. Combat-objective questy zůstaly **gated buildem**
  (novice prohraje, vybavený/vyšší level vyhraje).

No-fail flavor combat (nelze prohrát, M9) i combat-objective (M12, lze prohrát)
zachovány. Odměny netknuté.

## Rozsah vs. follow-up

**Hotovo (increment 1):** dice/dnd-combat moduly + D&D actor pole + quest combat
end-to-end (d20/AC, dice, saves, initiative, spell-slot spotřeba) + bohatý log.
Testy: `dice.test.ts` (+11), `dnd-combat.test.ts` (+11), quest-run (+3).

**Increment 2 (zbývá MR-5):** migrovat **dungeon/raid/PVP/aréna/Gauntlet** z
continuous `computeHit` na `resolveAttack` (recalibrace tuned encounterů,
Elo/wipe křivek). Plný damage-dice redesign (1d8+STR, 8d6) + saving-throw-heavy
kouzla = MR-7 (bestiář/CR) + MR-10 (balance pass).

## Důsledky

- (+) D&D dice-roll mechanika (d20/AC/crit/save/initiative) + přesný log formát ze
  zadání MR-5, na nejviditelnějším místě (story quest log).
- (+) Spell sloty z MR-4 mají bojový dopad (rozpočet kouzel za běh).
- (+) Magnitudy zachované (damage ≈ attackPower) → quest balanc stabilní; ostatní
  simulátory beze změny.
- (−) Dva combat modely transientně (dice = quest, continuous = zbytek) → vědomý
  mezikrok, sjednocení v increment 2. Jediný zdroj pravdy primitiv (`dice`/
  `dnd-combat`) zůstává.

## Alternativy

- **Přepsat `computeHit` globálně hned.** Zamítnuto — rozbije tuned raid/PVP/aréna
  balanc + ~desítky testů v jednom kroku (velký nedokončený refaktor).
- **Jen log formátovat jako dice, mechaniku nechat continuous.** Zamítnuto —
  neplní MR-5 (reálný hod na zásah / AC / saves).
