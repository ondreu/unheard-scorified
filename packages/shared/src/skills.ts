/**
 * D&D 5e ability checks (skill checks) — questové skill checky (auto-resolved,
 * idle). Hod d20 + atribut modifikátor (+ proficiency bonus, je-li postava ve
 * skillu proficient) vs DC. Mirror `dnd-combat.ts → savingThrow`; sdílí
 * `rollSave` primitiv (d20 + bonus vs DC) → žádná duplikace hodu.
 *
 * Proficiency zdrojem je Background postavy (`BACKGROUNDS[].skillProficiencies`),
 * protažený do `CombatActor.skillProficiencies` (`deriveCombatProfile`). Class/race
 * skill proficiencies = follow-up (viz ADR).
 *
 * Veškerá náhoda jen přes `SeededRng` (anti-cheat, reprodukovatelnost — CLAUDE.md).
 */
import { proficiencyBonus, type AbilityScore } from './character';
import type { CombatActor } from './combat';
import { rollSave, type SaveRoll } from './dice';
import { SeededRng } from './rng';

/** 18 D&D 5e skillů. Stringy se shodují s `BACKGROUNDS[].skillProficiencies`. */
export type SkillName =
  | 'Athletics'
  | 'Acrobatics'
  | 'Sleight of Hand'
  | 'Stealth'
  | 'Arcana'
  | 'History'
  | 'Investigation'
  | 'Nature'
  | 'Religion'
  | 'Animal Handling'
  | 'Insight'
  | 'Medicine'
  | 'Perception'
  | 'Survival'
  | 'Deception'
  | 'Intimidation'
  | 'Performance'
  | 'Persuasion';

/** Skill → řídící atribut (D&D 5e PHB). Jediný zdroj pravdy. */
export const SKILL_ABILITY: Record<SkillName, AbilityScore> = {
  Athletics: 'strength',
  Acrobatics: 'dexterity',
  'Sleight of Hand': 'dexterity',
  Stealth: 'dexterity',
  Arcana: 'intelligence',
  History: 'intelligence',
  Investigation: 'intelligence',
  Nature: 'intelligence',
  Religion: 'intelligence',
  'Animal Handling': 'wisdom',
  Insight: 'wisdom',
  Medicine: 'wisdom',
  Perception: 'wisdom',
  Survival: 'wisdom',
  Deception: 'charisma',
  Intimidation: 'charisma',
  Performance: 'charisma',
  Persuasion: 'charisma',
};

export const ALL_SKILLS = Object.keys(SKILL_ABILITY) as SkillName[];

/** Je aktér ve skillu proficient (Background)? */
export function isProficientInSkill(actor: CombatActor, skill: SkillName): boolean {
  return (actor.skillProficiencies ?? []).includes(skill);
}

/**
 * Modifikátor ability checku = atribut modifikátor (z `saveMods`) + proficiency
 * bonus (jen pokud je aktér ve skillu proficient). Bez proficiency = jen atribut.
 */
export function skillModifier(actor: CombatActor, skill: SkillName): number {
  const abilityMod = actor.saveMods?.[SKILL_ABILITY[skill]] ?? 0;
  const prof = isProficientInSkill(actor, skill) ? proficiencyBonus(actor.level ?? 1) : 0;
  return abilityMod + prof;
}

/** Výsledek ability checku. */
export interface SkillCheckResult extends SaveRoll {
  skill: SkillName;
  ability: AbilityScore;
  /** Byl aktér ve skillu proficient (proficiency bonus se započítal)? */
  proficient: boolean;
}

/**
 * Hodí ability check (d20 + skillModifier vs DC). `success = total >= dc`.
 * Deterministické přes předaný `SeededRng` (stejný seed → stejný výsledek).
 */
export function skillCheck(
  actor: CombatActor,
  rng: SeededRng,
  skill: SkillName,
  dc: number,
): SkillCheckResult {
  const proficient = isProficientInSkill(actor, skill);
  const save = rollSave(rng, skillModifier(actor, skill), dc);
  return { ...save, skill, ability: SKILL_ABILITY[skill], proficient };
}
