import { describe, expect, it } from 'vitest';
import {
  aggregateTalentEffects,
  baseStatsFor,
  deriveCombatProfile,
  wipeRewardMultiplier,
  type CombatActor,
} from './index';

function profile(level: number, talents = aggregateTalentEffects('warrior', {})): CombatActor {
  return deriveCombatProfile({
    name: 'Hero',
    level,
    klass: 'warrior',
    primary: baseStatsFor('orc', 'warrior', level),
    equipment: {},
    talents,
  });
}

describe('deriveCombatProfile', () => {
  it('odvodí kladné bojové staty', () => {
    const p = profile(10);
    expect(p.maxHealth).toBeGreaterThan(0);
    expect(p.attackPower).toBeGreaterThan(0);
    expect(p.swingInterval).toBeGreaterThan(0);
    expect(p.critChance).toBeGreaterThanOrEqual(0.05);
  });

  it('combat tagy z talentů zvyšují crit a odemykají signature ability', () => {
    const base = profile(20);
    // Warrior Fury: cruelty (crit) + capstone bloodthirst (ability + lifesteal).
    const talents = aggregateTalentEffects('warrior', {
      'warrior.fury.cruelty': 5,
      'warrior.fury.bloodthirst': 1,
    });
    const buffed = profile(20, talents);
    expect(buffed.critChance).toBeGreaterThan(base.critChance);
    expect(buffed.lifesteal).toBeGreaterThan(0);
    expect(buffed.signatureAbilities.map((a) => a.id)).toContain('bloodthirst');
  });

  it('gear staty zvyšují HP a attack power', () => {
    const naked = deriveCombatProfile({
      name: 'A', level: 10, klass: 'warrior',
      primary: baseStatsFor('orc', 'warrior', 10), equipment: {},
      talents: aggregateTalentEffects('warrior', {}),
    });
    const geared = deriveCombatProfile({
      name: 'A', level: 10, klass: 'warrior',
      primary: baseStatsFor('orc', 'warrior', 10),
      equipment: { strength: 20, stamina: 20, attack_power: 15, armor: 50 },
      talents: aggregateTalentEffects('warrior', {}),
    });
    expect(geared.maxHealth).toBeGreaterThan(naked.maxHealth);
    expect(geared.attackPower).toBeGreaterThan(naked.attackPower);
    expect(geared.armor).toBe(50);
  });
});

describe('wipeRewardMultiplier', () => {
  it('první wipe je „zdarma" (plná odměna při 0 i 1 wipu)', () => {
    expect(wipeRewardMultiplier(0)).toBe(1);
    expect(wipeRewardMultiplier(1)).toBe(1);
  });

  it('po druhém wipu klesá monotónně až k podlaze 0.3', () => {
    expect(wipeRewardMultiplier(2)).toBeLessThan(1);
    expect(wipeRewardMultiplier(3)).toBeLessThan(wipeRewardMultiplier(2));
    // 0.75 obtížnost (6 wipů) ↔ 0.3 odměna.
    expect(wipeRewardMultiplier(6)).toBeCloseTo(0.3);
  });

  it('nikdy neklesne pod podlahu 0.3', () => {
    expect(wipeRewardMultiplier(100)).toBeCloseTo(0.3);
    expect(wipeRewardMultiplier(-5)).toBe(1);
  });
});
