/**
 * D&D 5e dice-roll combat — saving throws, initiative a combat-log řádky (MR-5).
 * Jádro hodu na zásob (`computeHit`/`resolveAttack`) + actor helpery + damage dice
 * žijí ve `combat.ts` (u `CombatActor`); tady jsou nadstavby, které je doplňují.
 *
 * Veškerá náhoda jen přes `SeededRng` (anti-cheat, reprodukovatelnost).
 */
import type { AbilityScore } from './character';
import { actorSaveMod, actorSpellSaveDc, type CombatActor, type HitResult } from './combat';
import { applyCondition, type ActiveCondition, type ConditionRider } from './conditions';
import type { SignatureAbility } from './data/abilities';
import { damageInteractionNote } from './data/damage';
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

/** Výsledek aplikace per-spell saving throwu (ADR 0032). */
export interface SpellSaveOutcome {
  /** Poškození po aplikaci save (beze změny, když ability nemá `save`). */
  amount: number;
  /** Log řádek záchranného hodu (jen když ability má `save` a útok zasáhl). */
  message?: string;
  /**
   * Condition k uvalení na cíl, pokud `ability.condition` je nastavena a cíl
   * **neuspěl** save (Slice 2a). `undefined` = save uspěl / ability bez conditiony.
   * Volající ji aplikuje na svůj mutabilní stav aktéra (`applyCondition`).
   */
  condition?: ConditionRider;
}

/**
 * Aplikuje per-spell saving throw (ADR 0032): pokud má `ability.save`, cíl si hodí
 * záchranný hod proti spell save DC útočníka. `effect: 'half'` → úspěch půlí
 * poškození, `'negate'` → úspěch ho ruší (min. 1 při zásahu, aby šel poznat dopad
 * = ne, negate dává 0). Bez `save` vrací poškození beze změny. Sdílený zdroj pravdy
 * pro všechny simulátory (quest/raid/gauntlet) — žádná duplikace save vzorců.
 */
export function applySpellSave(
  ability: SignatureAbility,
  attacker: CombatActor,
  defender: CombatActor,
  rng: SeededRng,
  amount: number,
): SpellSaveOutcome {
  const spec = ability.save;
  if (!spec) return { amount };
  const save = savingThrow(defender, rng, spec.ability, actorSpellSaveDc(attacker));
  let result = amount;
  // `'none'` (Slice 2d): poškození se savem nemění (plný úder); save jen gatuje condition.
  if (save.success && spec.effect !== 'none') {
    result = spec.effect === 'negate' ? 0 : Math.max(1, Math.floor(amount / 2));
  }
  // Condition rider (Slice 2a/2d): neúspěšný save → condition (stejný hod jako damage).
  const condition = !save.success && ability.condition ? ability.condition : undefined;
  return {
    amount: result,
    message: buildSaveMessage(defender.name, spec.ability, save, spec.effect),
    ...(condition ? { condition } : {}),
  };
}

/**
 * Je ability **čisté „control" kouzlo** (Slice 2d) — žádný útočný hod ani
 * poškození, jediným efektem je condition na cíl (Hold Person / Web / Entangle)?
 * Pozná se podle `kind: 'strike'` + `damageMult: 0` bez `dice`/`bonusDice`, s
 * `condition` riderem. Engine pro něj přeskočí hod na zásah i damage roll a vyřeší
 * jen save → condition (`resolveControlCast`). Útoky s damage + condition riderem
 * (Trip Attack, Ensnaring Strike, Fireball s riderem) sem **nepatří** — ty jdou
 * normální damage cestou (`applySpellSave`).
 */
export function isControlSpell(ability: SignatureAbility): boolean {
  return (
    ability.kind === 'strike' &&
    ability.damageMult === 0 &&
    !ability.dice &&
    !ability.bonusDice &&
    !!ability.condition
  );
}

/** Výsledek seslání pure-control kouzla (Slice 2d). */
export interface ControlCastOutcome {
  /** Log řádek záchranného hodu (jen když kouzlo má `save`). */
  saveMessage?: string;
  /** Condition uvalená na cíl (neúspěšný save / save-less rider), nebo `undefined`. */
  applied?: ConditionRider;
}

/**
 * Vyřeší pure-control kouzlo (Hold Person/Web/Entangle, Slice 2d): D&D control
 * kouzla nemají útočný hod (žádné „d20 vs AC") ani poškození — cíl si jen hodí
 * záchranný hod a na **neúspěch** dostane condition. Bez `save` (save-less rider)
 * se condition uvalí automaticky. **Mutuje `target.conditions`** (přiřadí nový
 * seznam přes `applyCondition`); volající vyemituje log řádky z vrácených dat.
 * Sdíleno tahovými simulátory (`dungeon-run`, `dungeon-party`) → žádná duplikace.
 */
export function resolveControlCast(
  ability: SignatureAbility,
  attacker: CombatActor,
  target: { actor: CombatActor; name: string; conditions?: ActiveCondition[] },
  rng: SeededRng,
  sourceName: string,
): ControlCastOutcome {
  if (ability.save) {
    const outcome = applySpellSave(ability, attacker, target.actor, rng, 0);
    if (outcome.condition) {
      target.conditions = applyCondition(target.conditions, outcome.condition, sourceName);
    }
    return { saveMessage: outcome.message, applied: outcome.condition };
  }
  // Save-less control (nepoužívá se v katalogu zatím, ale engine je symetrický).
  if (ability.condition) {
    target.conditions = applyCondition(target.conditions, ability.condition, sourceName);
    return { applied: ability.condition };
  }
  return {};
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
  // Resistance/vulnerability/immunity note (MR-7) — jen když není `normal`.
  const typeNote = result.damageInteraction
    ? damageInteractionNote(result.damageInteraction)
    : '';
  if (result.crit) {
    return `🩸 ${head} → CRITICAL HIT for ${result.amount} damage${typeNote}${healNote}!${tail}`;
  }
  return `${head} → HIT for ${result.amount} damage${typeNote}${healNote}.${tail}`;
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

/** Log řádek záchranného hodu: „Hero rolls a DEX save: 12 + 3 = 15 vs DC 14 → SUCCESS (half damage)."
 * `effect` (může být i legacy `boolean` = half) řídí slovní popis úspěchu. */
export function buildSaveMessage(
  actorName: string,
  ability: AbilityScore,
  save: SaveRoll,
  effect: 'half' | 'negate' | 'none' | boolean,
): string {
  const sign = save.modifier >= 0 ? '+' : '−';
  const abbr = ability.slice(0, 3).toUpperCase();
  const eff = effect === true ? 'half' : effect === false ? 'negate' : effect;
  const successNote = eff === 'half' ? 'half damage' : eff === 'none' ? 'resists the effect' : 'resisted';
  const outcome = save.success ? `SUCCESS (${successNote})` : 'FAILURE';
  return `${actorName} rolls a ${abbr} save: ${save.natural} ${sign} ${Math.abs(save.modifier)} = ${save.total} vs DC ${save.dc} → ${outcome}.`;
}
