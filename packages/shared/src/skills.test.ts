import { describe, expect, it } from 'vitest';
import { deriveCombatProfile, type CombatActor } from './combat';
import { baseStatsFor, proficiencyBonus } from './character';
import { EMPTY_PROGRESSION } from './levelup';
import { SeededRng } from './rng';
import {
  ALL_SKILLS,
  isProficientInSkill,
  skillCheck,
  skillModifier,
  SKILL_ABILITY,
} from './skills';

function bard(level: number, skillProficiencies?: readonly string[]): CombatActor {
  return deriveCombatProfile({
    name: 'Lyric',
    level,
    klass: 'bard',
    primary: baseStatsFor('half_elf', 'bard', level),
    equipment: {},
    progression: EMPTY_PROGRESSION,
    skillProficiencies,
  });
}

describe('SKILL_ABILITY map', () => {
  it('covers all 18 D&D skills, each mapped to a valid ability', () => {
    expect(ALL_SKILLS).toHaveLength(18);
    for (const skill of ALL_SKILLS) {
      expect(['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma']).toContain(
        SKILL_ABILITY[skill],
      );
    }
  });
});

describe('skillModifier', () => {
  it('adds proficiency bonus only when proficient in the skill', () => {
    const proficient = bard(5, ['Persuasion']);
    const untrained = bard(5, []);
    const abilityMod = proficient.saveMods?.charisma ?? 0;
    expect(skillModifier(untrained, 'Persuasion')).toBe(abilityMod);
    expect(skillModifier(proficient, 'Persuasion')).toBe(abilityMod + proficiencyBonus(5));
    expect(isProficientInSkill(proficient, 'Persuasion')).toBe(true);
    expect(isProficientInSkill(proficient, 'Stealth')).toBe(false);
  });

  it('is graceful when the actor carries no skill proficiencies', () => {
    const a = bard(3);
    expect(() => skillModifier(a, 'Arcana')).not.toThrow();
    expect(skillModifier(a, 'Arcana')).toBe(a.saveMods?.intelligence ?? 0);
  });
});

describe('skillCheck', () => {
  it('is deterministic for a given seed and reports the roll detail', () => {
    const a = bard(5, ['Persuasion']);
    const r1 = skillCheck(a, new SeededRng(42), 'Persuasion', 13);
    const r2 = skillCheck(a, new SeededRng(42), 'Persuasion', 13);
    expect(r1).toEqual(r2);
    expect(r1.skill).toBe('Persuasion');
    expect(r1.ability).toBe('charisma');
    expect(r1.proficient).toBe(true);
    expect(r1.total).toBe(r1.natural + skillModifier(a, 'Persuasion'));
    expect(r1.success).toBe(r1.total >= 13);
  });

  it('a proficient, high-ability character beats a low DC more often than an untrained one', () => {
    const expert = bard(9, ['Persuasion']);
    const novice = deriveCombatProfile({
      name: 'Brute',
      level: 9,
      klass: 'barbarian',
      primary: baseStatsFor('half_orc', 'barbarian', 9),
      equipment: {},
      progression: EMPTY_PROGRESSION,
    });
    let expertWins = 0;
    let noviceWins = 0;
    for (let seed = 0; seed < 200; seed++) {
      if (skillCheck(expert, new SeededRng(seed), 'Persuasion', 12).success) expertWins++;
      if (skillCheck(novice, new SeededRng(seed), 'Persuasion', 12).success) noviceWins++;
    }
    expect(expertWins).toBeGreaterThan(noviceWins);
  });
});
