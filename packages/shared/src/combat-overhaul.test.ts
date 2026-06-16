import { describe, expect, it } from 'vitest';
import {
  aggregateTalentEffects,
  applyAbsorb,
  baseStatsFor,
  deriveCombatProfile,
  deriveRaidActor,
  simulatePvpDuel,
  simulateRaidRun,
  type CombatActor,
  type RaidActor,
} from './index';

function profile(klass: Parameters<typeof aggregateTalentEffects>[0], allocations: Record<string, number>, level = 50): CombatActor {
  return deriveCombatProfile({
    name: `${klass}-hero`,
    level,
    klass,
    primary: baseStatsFor('human', klass, level),
    equipment: { attack_power: 60, stamina: 60, armor: 100 },
    talents: aggregateTalentEffects(klass, allocations),
  });
}

/** Tanky boss s vysokým HP, aby boj trval dost dlouho na proběhnutí mechanik. */
function tankyBoss(name = 'Test Boss'): CombatActor {
  return {
    name,
    maxHealth: 4000,
    attackPower: 40,
    swingInterval: 2.2,
    critChance: 0.05,
    critMultiplier: 2,
    armor: 0,
    lifesteal: 0,
    shield: 0,
    signatureAbilities: [],
    isBoss: true,
  };
}

describe('shield derivation (absorb)', () => {
  it('shield talent grants an absorb pool; without it shield is 0', () => {
    const withBarrier = profile('mage', { 'mage.frost.ice_barrier': 1 });
    const without = profile('mage', {});
    expect(withBarrier.shield).toBeGreaterThan(0);
    expect(without.shield).toBe(0);
  });
});

describe('applyAbsorb', () => {
  it('absorbs up to the shield, leaving the remainder as damage', () => {
    expect(applyAbsorb(100, 30)).toEqual({ netDamage: 70, absorbed: 30, shieldRemaining: 0 });
    expect(applyAbsorb(20, 50)).toEqual({ netDamage: 0, absorbed: 20, shieldRemaining: 30 });
    expect(applyAbsorb(50, 0)).toEqual({ netDamage: 50, absorbed: 0, shieldRemaining: 0 });
  });
});

describe('ability kinds', () => {
  it('capstone talents map to abilities with the right kind', () => {
    const warlock = profile('warlock', { 'warlock.aff.unstable_affliction': 1 });
    const ua = warlock.signatureAbilities.find((a) => a.id === 'unstable_affliction');
    expect(ua?.kind).toBe('dot');

    const warrior = profile('warrior', { 'warrior.fury.bloodthirst': 1 });
    const bt = warrior.signatureAbilities.find((a) => a.id === 'bloodthirst');
    expect(bt?.kind).toBe('drain');
  });
});

describe('rich combat log (raid/dungeon engine)', () => {
  const boss = [tankyBoss()];

  it('lifesteal dps produces drain events', () => {
    const party: RaidActor[] = [
      deriveRaidActor(profile('warrior', {}), 'tank'),
      deriveRaidActor(profile('priest', {}, 50), 'healer'),
      deriveRaidActor(profile('warrior', { 'warrior.fury.bloodthirst': 1, 'warrior.fury.cruelty': 5 }), 'dps'),
    ];
    const r = simulateRaidRun(party, boss, 4242);
    expect(r.events.some((e) => e.type === 'drain')).toBe(true);
  });

  it('a dot caster produces dot tick events', () => {
    const party: RaidActor[] = [
      deriveRaidActor(profile('warrior', {}), 'tank'),
      deriveRaidActor(profile('priest', {}, 50), 'healer'),
      deriveRaidActor(profile('warlock', { 'warlock.aff.unstable_affliction': 1 }), 'dps'),
    ];
    const r = simulateRaidRun(party, boss, 13);
    expect(r.events.some((e) => e.type === 'dot')).toBe(true);
  });

  it('a shielded tank produces absorb events', () => {
    const party: RaidActor[] = [
      deriveRaidActor(profile('mage', { 'mage.frost.ice_barrier': 1 }), 'tank'),
      deriveRaidActor(profile('priest', {}, 50), 'healer'),
      deriveRaidActor(profile('warrior', {}), 'dps'),
    ];
    const r = simulateRaidRun(party, boss, 77);
    expect(r.events.some((e) => e.type === 'absorb')).toBe(true);
  });

  it('stays deterministic with the new mechanics', () => {
    const make = (): RaidActor[] => [
      deriveRaidActor(profile('mage', { 'mage.frost.ice_barrier': 1 }), 'tank'),
      deriveRaidActor(profile('priest', {}, 50), 'healer'),
      deriveRaidActor(profile('warlock', { 'warlock.aff.unstable_affliction': 1 }), 'dps'),
      deriveRaidActor(profile('warrior', { 'warrior.fury.bloodthirst': 1 }), 'dps'),
    ];
    const a = simulateRaidRun(make(), boss, 9001);
    const b = simulateRaidRun(make(), boss, 9001);
    expect(a.events.length).toBe(b.events.length);
    expect(a.events).toEqual(b.events);
  });
});

describe('rich combat log (pvp)', () => {
  it('lifesteal duelist produces drain events', () => {
    const drainer = profile('warrior', { 'warrior.fury.bloodthirst': 1 }, 50);
    const dummy = profile('warrior', {}, 50);
    const r = simulatePvpDuel(drainer, dummy, 5);
    expect(r.events.some((e) => e.type === 'drain')).toBe(true);
  });
});
