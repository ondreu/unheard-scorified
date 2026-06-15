import { describe, expect, it } from 'vitest';
import {
  aggregateTalentEffects,
  baseStatsFor,
  buildEnemyActor,
  computeDungeonReward,
  deriveCombatProfile,
  DUNGEONS,
  simulateDungeonRun,
  type CombatActor,
  type DungeonActivityParams,
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

describe('simulateDungeonRun', () => {
  const weakEnemy = buildEnemyActor({ name: 'Rat', maxHealth: 20, attackPower: 1, swingInterval: 3 });
  const strongEnemy = buildEnemyActor({
    name: 'Dragon', maxHealth: 100000, attackPower: 9999, swingInterval: 0.5, isBoss: true,
  });

  it('je deterministický (stejný seed → identický timeline)', () => {
    const p = profile(15);
    const a = simulateDungeonRun(p, [weakEnemy], 12345);
    const b = simulateDungeonRun(p, [weakEnemy], 12345);
    expect(a).toEqual(b);
  });

  it('silná postava vs slabý nepřítel = vítězství', () => {
    const result = simulateDungeonRun(profile(30), [weakEnemy], 7);
    expect(result.victory).toBe(true);
    expect(result.events.at(-1)?.type).toBe('victory');
    expect(result.durationSec).toBeGreaterThanOrEqual(5);
  });

  it('slabá postava vs drtivý nepřítel = prohra', () => {
    const result = simulateDungeonRun(profile(1), [strongEnemy], 7);
    expect(result.victory).toBe(false);
    expect(result.defeatedAtEncounter).toBe(0);
    expect(result.events.at(-1)?.type).toBe('defeat');
  });

  it('timeline má neklesající čas a hlášky', () => {
    const result = simulateDungeonRun(profile(20), [weakEnemy], 99);
    let prev = -1;
    for (const e of result.events) {
      expect(e.t).toBeGreaterThanOrEqual(prev);
      expect(e.message.length).toBeGreaterThan(0);
      prev = e.t;
    }
  });
});

describe('computeDungeonReward', () => {
  function paramsFor(level: number): DungeonActivityParams {
    return {
      dungeonId: 'ragefire_chasm',
      player: deriveCombatProfile({
        name: 'Hero', level, klass: 'warrior',
        primary: baseStatsFor('orc', 'warrior', level),
        equipment: { strength: 30, stamina: 40, attack_power: 30, armor: 80 },
        talents: aggregateTalentEffects('warrior', {}),
      }),
    };
  }

  it('vítězství dává plné XP a může dropnout loot', () => {
    const reward = computeDungeonReward(paramsFor(40), 42);
    expect(reward.xp).toBe(DUNGEONS.ragefire_chasm!.baseXp);
    expect(reward.gold).toBeGreaterThan(0);
  });

  it('prohra dává jen útěchu (žádný loot ani zlato)', () => {
    const params: DungeonActivityParams = {
      dungeonId: 'scarlet_monastery',
      player: deriveCombatProfile({
        name: 'Weakling', level: 1, klass: 'priest',
        primary: baseStatsFor('human', 'priest', 1), equipment: {},
        talents: aggregateTalentEffects('priest', {}),
      }),
    };
    const reward = computeDungeonReward(params, 1);
    expect(reward.gold).toBe(0);
    expect(reward.items).toHaveLength(0);
    expect(reward.xp).toBeGreaterThan(0);
  });

  it('neznámý dungeon → nulová odměna', () => {
    const reward = computeDungeonReward(
      { dungeonId: 'nonexistent', player: profile(10) },
      1,
    );
    expect(reward).toEqual({ xp: 0, gold: 0, items: [] });
  });
});
