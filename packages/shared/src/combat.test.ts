import { describe, expect, it } from 'vitest';
import {
  aggregateProgression,
  baseStatsFor,
  deriveCombatProfile,
  wipeRewardMultiplier,
  EMPTY_PROGRESSION,
  type FeatId,
  type ProgressionEffects,
  type CombatActor,
} from './index';

function featProg(...featIds: FeatId[]): ProgressionEffects {
  return aggregateProgression(
    featIds.map((featId, i) => ({ slotId: `asi@${i}`, choice: { kind: 'feat', featId } })),
  );
}

function profile(level: number, progression: ProgressionEffects = EMPTY_PROGRESSION): CombatActor {
  return deriveCombatProfile({
    name: 'Hero',
    level,
    klass: 'fighter',
    primary: baseStatsFor('orc', 'fighter', level),
    equipment: {},
    progression,
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

  it('combat tagy z featů zvyšují crit a HP', () => {
    const base = profile(20);
    // Lucky (crit) + Tough (HP).
    const buffed = profile(20, featProg('lucky', 'tough'));
    expect(buffed.critChance).toBeGreaterThan(base.critChance);
    expect(buffed.maxHealth).toBeGreaterThan(base.maxHealth);
  });

  it('subclass odemkne signature ability', () => {
    const p = deriveCombatProfile({
      name: 'Hero', level: 20, klass: 'fighter', subclass: 'champion',
      primary: baseStatsFor('orc', 'fighter', 20), equipment: {},
      progression: EMPTY_PROGRESSION,
    });
    expect(p.signatureAbilities.map((a) => a.id)).toContain('champion_heroic_surge');
  });

  it('gear staty zvyšují HP a attack power', () => {
    const naked = deriveCombatProfile({
      name: 'A', level: 10, klass: 'fighter',
      primary: baseStatsFor('orc', 'fighter', 10), equipment: {},
      progression: EMPTY_PROGRESSION,
    });
    const geared = deriveCombatProfile({
      name: 'A', level: 10, klass: 'fighter',
      primary: baseStatsFor('orc', 'fighter', 10),
      equipment: { strength: 20, constitution: 20, attack_power: 15, armor: 50 },
      progression: EMPTY_PROGRESSION,
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
