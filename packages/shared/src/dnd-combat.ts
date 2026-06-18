/**
 * D&D 5e dice-roll combat resolution (MR-5). Vrstva nad `CombatActor`, která
 * řeší **hod na zásah (d20 + attackBonus vs AC)**, **damage dice**, **záchranné
 * hody** a **initiative** — místo continuous `computeHit` (ten zůstává pro
 * raid/PVP/Gauntlet, migrace = další inkrement MR-5). Quest combat (`quest-run.ts`)
 * je první adoptér.
 *
 * Veškerá náhoda jen přes `SeededRng` (anti-cheat, reprodukovatelnost). Damage
 * dice jsou kalibrované tak, aby **průměr ≈ `attackPower`** → balanc questů se
 * mění jen o miss chance (winnable zachováno; plný D&D damage redesign = MR-10).
 */
import type { AbilityScore } from './character';
import type { CombatActor } from './combat';
import {
  attackHits,
  diceNotation,
  rollAttack,
  rollD20,
  rollDice,
  rollSave,
  type AttackRoll,
  type DiceRoll,
  type DiceSpec,
  type SaveRoll,
} from './dice';
import { SeededRng } from './rng';

/** Armor Class aktéra (D&D fallback z continuous armoru, když AC chybí). */
export function actorAc(actor: CombatActor): number {
  if (actor.armorClass != null) return actor.armorClass;
  return 10 + Math.floor((actor.armor ?? 0) / 50);
}

/** Útočný bonus aktéra (fallback ~ odvozený z attackPower, když chybí). */
export function actorAttackBonus(actor: CombatActor): number {
  if (actor.attackBonus != null) return actor.attackBonus;
  return Math.max(0, Math.round(Math.sqrt(Math.max(0, actor.attackPower))));
}

/** Save modifikátor aktéra pro daný atribut (0, když není znám). */
export function actorSaveMod(actor: CombatActor, ability: AbilityScore): number {
  return actor.saveMods?.[ability] ?? 0;
}

/** Spell save DC aktéra (fallback 10, když nedefinováno). */
export function actorSpellSaveDc(actor: CombatActor): number {
  return actor.spellSaveDc ?? 10;
}

/**
 * Damage dice aktéra — `count`d6 + `bonus` kalibrované tak, aby **průměr ≈
 * `attackPower`** (NdX redesign per zbraň/kouzlo = MR-10). Crit zdvojnásobí
 * `count` (D&D: kostky, ne bonus).
 */
export function weaponDamageSpec(actor: CombatActor, crit = false): DiceSpec {
  const ap = Math.max(1, actor.attackPower);
  const count = Math.max(1, Math.min(12, Math.round(ap / 7)));
  const bonus = Math.max(0, Math.round(ap - count * 3.5));
  return { count: crit ? count * 2 : count, sides: 6, bonus };
}

/** Výsledek D&D hodu na zásah + poškození. */
export interface DndAttackResult {
  hit: boolean;
  crit: boolean;
  roll: AttackRoll;
  targetAc: number;
  /** Výsledné poškození (0 při miss). */
  amount: number;
  /** Hod na poškození (jen při zásahu). */
  damage?: DiceRoll;
  /** Flat bonus k poškození (jen při zásahu). */
  damageBonus?: number;
  /** Notace kostek poškození pro log (např. `5d6+18`). */
  damageNotation?: string;
}

export interface ResolveAttackOpts {
  /** Násobek poškození ability (1 = základní úder). */
  abilityMult?: number;
  /** Automatický zásah (ignoruje hod na AC) — pro „nelze minout" efekty. */
  autoHit?: boolean;
}

/**
 * Vyřeší jeden útok: d20 + attackBonus vs AC → hit/miss; nat 20 = crit (zdvojené
 * damage dice), nat 1 = miss. Poškození = damage dice × `abilityMult`. Sdílený
 * zdroj pravdy pro hit/miss i číslo poškození → log se nemůže rozejít.
 */
export function resolveAttack(
  attacker: CombatActor,
  defender: CombatActor,
  rng: SeededRng,
  opts: ResolveAttackOpts = {},
): DndAttackResult {
  const abilityMult = opts.abilityMult ?? 1;
  const targetAc = actorAc(defender);
  const roll = rollAttack(rng, actorAttackBonus(attacker));
  const hit = opts.autoHit || attackHits(roll, targetAc);

  if (!hit) {
    return { hit: false, crit: false, roll, targetAc, amount: 0 };
  }

  const crit = roll.isCrit;
  const spec = weaponDamageSpec(attacker, crit);
  const damage = rollDice(rng, spec.count, spec.sides);
  const raw = (damage.total + spec.bonus) * abilityMult;
  return {
    hit: true,
    crit,
    roll,
    targetAc,
    amount: Math.max(1, Math.round(raw)),
    damage,
    damageBonus: spec.bonus,
    damageNotation: diceNotation(spec),
  };
}

/** Záchranný hod cíle proti DC útočníka (d20 + saveMod vs dc). */
export function savingThrow(
  defender: CombatActor,
  rng: SeededRng,
  ability: AbilityScore,
  dc: number,
): SaveRoll {
  return rollSave(rng, actorSaveMod(defender, ability), dc);
}

/** Initiative aktéra: d20 + DEX modifikátor. */
export function rollInitiative(actor: CombatActor, rng: SeededRng): number {
  return rollD20(rng) + actorSaveMod(actor, 'dexterity');
}

// ── Combat-log řádky (anglicky = jazyk hry) ──────────────────────────────────

/** Breakdown hodu na zásah pro log: „rolls 14 + 6 = 20 vs AC 13". */
function rollVsAc(roll: AttackRoll, targetAc: number): string {
  const sign = roll.modifier >= 0 ? '+' : '−';
  return `rolls ${roll.natural} ${sign} ${Math.abs(roll.modifier)} = ${roll.total} vs AC ${targetAc}`;
}

export interface DndAttackMessageInput {
  attackerName: string;
  targetName: string;
  result: DndAttackResult;
  /** Jméno ability/kouzla (named cast). `undefined` = základní úder. */
  abilityName?: string;
  /** Poznámka o spell slotu, např. ` (3rd-level slot)`. */
  slotNote?: string;
  /** Vyléčeno lifestealem/drainem (0 = nic). */
  healed?: number;
  /** Doplněk za větu (např. ` Target: 42 HP.`). */
  suffix?: string;
}

/**
 * Sestaví anglický log řádek pro D&D útok ve formátu zadání MR-5:
 *   `Hero attacks Goblin: rolls 14 + 6 = 20 vs AC 13 → HIT for 28 damage.`
 * Miss: `… → MISS.` · Crit: `… → CRITICAL HIT for 56 damage!`
 */
export function buildDndAttackMessage(input: DndAttackMessageInput): string {
  const { attackerName, targetName, result, abilityName, slotNote, healed, suffix } = input;
  const verb = abilityName ? `casts ${abilityName}${slotNote ?? ''} at` : 'attacks';
  const head = `${attackerName} ${verb} ${targetName}: ${rollVsAc(result.roll, result.targetAc)}`;
  const tail = suffix ?? '';
  if (!result.hit) return `${head} → MISS.${tail}`;
  const healNote = healed && healed > 0 ? `, healing for ${healed}` : '';
  if (result.crit) {
    return `🩸 ${head} → CRITICAL HIT for ${result.amount} damage${healNote}!${tail}`;
  }
  return `${head} → HIT for ${result.amount} damage${healNote}.${tail}`;
}

/** Log řádek záchranného hodu: „Hero rolls a DEX save: 12 + 3 = 15 vs DC 14 → SUCCESS (half damage)." */
export function buildSaveMessage(
  actorName: string,
  ability: AbilityScore,
  save: SaveRoll,
  half: boolean,
): string {
  const sign = save.modifier >= 0 ? '+' : '−';
  const abbr = ability.slice(0, 3).toUpperCase();
  const outcome = save.success
    ? half
      ? 'SUCCESS (half damage)'
      : 'SUCCESS (resisted)'
    : 'FAILURE';
  return `${actorName} rolls a ${abbr} save: ${save.natural} ${sign} ${Math.abs(save.modifier)} = ${save.total} vs DC ${save.dc} → ${outcome}.`;
}
