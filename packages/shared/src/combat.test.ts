import { describe, expect, it } from 'vitest';
import {
  abilityDamageSpec,
  aggregateProgression,
  baseStatsFor,
  buildEnemyActor,
  cantripDiceMultiplier,
  crStatGuide,
  deriveCombatProfile,
  wipeRewardMultiplier,
  EMPTY_PROGRESSION,
  type FeatId,
  type ProgressionEffects,
  type CombatActor,
} from './index';
import type { SignatureAbility } from './data/abilities';

describe('cantrip scaling (Fix kouzla)', () => {
  it('cantripDiceMultiplier follows D&D 1→2→3→4 at 5/11/17', () => {
    expect([1, 4, 5, 10, 11, 16, 17, 20].map(cantripDiceMultiplier)).toEqual([1, 1, 2, 2, 3, 3, 4, 4]);
  });

  const fireBolt: SignatureAbility = {
    id: 'fb',
    name: 'Fire Bolt',
    kind: 'strike',
    cooldownSec: 4,
    damageMult: 1,
    spellTier: 0,
    dice: { count: 1, sides: 10, bonus: 0 },
  };

  it('cantrip dice count scales with level, bonus/sides unchanged', () => {
    expect(abilityDamageSpec(fireBolt, null, 1)).toEqual({ count: 1, sides: 10, bonus: 0 });
    expect(abilityDamageSpec(fireBolt, null, 11)).toEqual({ count: 3, sides: 10, bonus: 0 });
    expect(abilityDamageSpec(fireBolt, null, 20)).toEqual({ count: 4, sides: 10, bonus: 0 });
  });

  it('leveled spell ignores cantrip scaling, uses upcast from slot tier', () => {
    const fireball: SignatureAbility = {
      id: 'fireball',
      name: 'Fireball',
      kind: 'strike',
      cooldownSec: 9,
      damageMult: 2.2,
      spellTier: 3,
      dice: { count: 8, sides: 6, bonus: 0 },
      dicePerSlotAbove: 1,
    };
    // Žádné cantrip scaling u tier ≥ 1, i na vysokém levelu.
    expect(abilityDamageSpec(fireball, 3, 20)).toEqual({ count: 8, sides: 6, bonus: 0 });
    // Upcast 6. slotem = +3 kostky.
    expect(abilityDamageSpec(fireball, 6, 20)).toEqual({ count: 11, sides: 6, bonus: 0 });
  });
});

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
    primary: baseStatsFor('half_orc', 'fighter', level),
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
      primary: baseStatsFor('half_orc', 'fighter', 20), equipment: {},
      progression: EMPTY_PROGRESSION,
    });
    expect(p.signatureAbilities.map((a) => a.id)).toContain('champion_heroic_surge');
  });

  it('gear staty zvyšují HP a attack power', () => {
    const naked = deriveCombatProfile({
      name: 'A', level: 10, klass: 'fighter',
      primary: baseStatsFor('half_orc', 'fighter', 10), equipment: {},
      progression: EMPTY_PROGRESSION,
    });
    const geared = deriveCombatProfile({
      name: 'A', level: 10, klass: 'fighter',
      primary: baseStatsFor('half_orc', 'fighter', 10),
      equipment: { strength: 20, constitution: 20, attack_power: 15, armor: 50 },
      progression: EMPTY_PROGRESSION,
    });
    expect(geared.maxHealth).toBeGreaterThan(naked.maxHealth);
    expect(geared.attackPower).toBeGreaterThan(naked.attackPower);
    expect(geared.armor).toBe(50);
  });
});

describe('buildEnemyActor — CR-based stats (MR-10)', () => {
  it('derives AC / attackBonus / save DC from content level via the CR table', () => {
    const e = buildEnemyActor({ name: 'Brigand', maxHealth: 100, attackPower: 10, swingInterval: 2.4, level: 5 });
    const guide = crStatGuide(5);
    expect(e.armorClass).toBe(guide.armorClass);
    expect(e.attackBonus).toBe(guide.attackBonus);
    expect(e.spellSaveDc).toBe(guide.saveDc);
  });

  it('bumps a boss to a higher CR (+2)', () => {
    const trash = buildEnemyActor({ name: 'Mook', maxHealth: 100, attackPower: 10, swingInterval: 2.4, level: 10 });
    const boss = buildEnemyActor({ name: 'Warlord', maxHealth: 100, attackPower: 10, swingInterval: 2.4, level: 10, isBoss: true });
    expect(boss.armorClass!).toBeGreaterThanOrEqual(trash.armorClass!);
    expect(boss.armorClass).toBe(crStatGuide(12).armorClass);
  });

  it('an explicit challengeRating overrides level', () => {
    const e = buildEnemyActor({ name: 'Wyrm', maxHealth: 100, attackPower: 10, swingInterval: 2.4, level: 1, challengeRating: 17 });
    expect(e.armorClass).toBe(crStatGuide(17).armorClass);
  });

  it('explicit AC / attackBonus still win over CR derivation', () => {
    const e = buildEnemyActor({ name: 'Custom', maxHealth: 100, attackPower: 10, swingInterval: 2.4, level: 20, armorClass: 11, attackBonus: 1 });
    expect(e.armorClass).toBe(11);
    expect(e.attackBonus).toBe(1);
  });

  it('falls back to a sane default (CR 5) for legacy data without level', () => {
    const e = buildEnemyActor({ name: 'Legacy', maxHealth: 100, attackPower: 10, swingInterval: 2.4 });
    expect(e.armorClass).toBe(crStatGuide(5).armorClass);
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
