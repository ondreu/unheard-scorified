/**
 * D&D 5e dice-roll combat — saving throws, initiative a combat-log řádky (MR-5).
 * Jádro hodu na zásob (`computeHit`/`resolveAttack`) + actor helpery + damage dice
 * žijí ve `combat.ts` (u `CombatActor`); tady jsou nadstavby, které je doplňují.
 *
 * Veškerá náhoda jen přes `SeededRng` (anti-cheat, reprodukovatelnost).
 */
import type { AbilityScore } from './character';
import { actorSaveMod, type CombatActor, type HitResult } from './combat';
import { rollD20, rollSave, type SaveRoll } from './dice';
import { SeededRng } from './rng';

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
function rollVsAc(roll: HitResult['roll'], targetAc: number): string {
  const sign = roll.modifier >= 0 ? '+' : '−';
  return `rolls ${roll.natural} ${sign} ${Math.abs(roll.modifier)} = ${roll.total} vs AC ${targetAc}`;
}

export interface DndAttackMessageInput {
  attackerName: string;
  targetName: string;
  result: HitResult;
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

/** Kompaktní tag hodu na zásah pro hutné logy: `[d20: 14 + 6 = 20 vs AC 13]`. */
export function rollTag(result: HitResult): string {
  const r = result.roll;
  const sign = r.modifier >= 0 ? '+' : '−';
  return `[d20: ${r.natural} ${sign} ${Math.abs(r.modifier)} = ${r.total} vs AC ${result.targetAc}]`;
}

/** Krátká hláška „minul" pro simulátory s vlastním formátem logu. */
export function missMessage(attackerName: string, targetName: string, result: HitResult): string {
  return `${attackerName} attacks ${targetName} — MISS ${rollTag(result)}`;
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
