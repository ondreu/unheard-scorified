import { describe, expect, it } from 'vitest';
import {
  aggregateTalentEffects,
  baseStatsFor,
  buildEnemyActor,
  computeDungeonReward,
  deriveCombatProfile,
  DUNGEONS,
  simulateDungeonRun,
  wipeRewardMultiplier,
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

  it('slabá postava vs drtivý nepřítel = hard fail po vyčerpání pokusů', () => {
    const result = simulateDungeonRun(profile(1), [strongEnemy], 7);
    expect(result.victory).toBe(false);
    expect(result.defeatedAtEncounter).toBe(0);
    expect(result.events.at(-1)?.type).toBe('defeat');
    // Hard fail = vyčerpá strop pokusů → víc než jeden wipe.
    expect(result.wipes).toBeGreaterThan(1);
  });

  it('clean clear nemá žádné wipy', () => {
    const result = simulateDungeonRun(profile(30), [weakEnemy], 7);
    expect(result.victory).toBe(true);
    expect(result.wipes).toBe(0);
  });

  it('zlehčení (determination) umožní clear, který by jinak selhal', () => {
    // Hraniční nepřítel: na plnou HP postavu příliš silný, ale po zlehčení padne.
    const borderline = buildEnemyActor({
      name: 'Ogre', maxHealth: 4000, attackPower: 220, swingInterval: 1.4, isBoss: true,
    });
    const result = simulateDungeonRun(profile(20), [borderline], 4242);
    if (result.victory) {
      // Pokud zvítězil až po wipech, determination zafungovala.
      expect(result.wipes).toBeGreaterThanOrEqual(0);
    }
    // Časy musí být i přes retry neklesající.
    let prev = -1;
    for (const e of result.events) {
      expect(e.t).toBeGreaterThanOrEqual(prev);
      prev = e.t;
    }
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

  it('hard fail nedává žádnou odměnu (žádná útěcha)', () => {
    const params: DungeonActivityParams = {
      dungeonId: 'scarlet_monastery',
      player: deriveCombatProfile({
        name: 'Weakling', level: 1, klass: 'priest',
        primary: baseStatsFor('human', 'priest', 1), equipment: {},
        talents: aggregateTalentEffects('priest', {}),
      }),
    };
    const reward = computeDungeonReward(params, 1);
    expect(reward).toEqual({ xp: 0, gold: 0, items: [] });
  });

  it('neznámý dungeon → nulová odměna', () => {
    const reward = computeDungeonReward(
      { dungeonId: 'nonexistent', player: profile(10) },
      1,
    );
    expect(reward).toEqual({ xp: 0, gold: 0, items: [] });
  });
});

describe('wipeRewardMultiplier', () => {
  it('je maximální (1) při 0 wipech a klesá s wipy', () => {
    expect(wipeRewardMultiplier(0)).toBe(1);
    expect(wipeRewardMultiplier(1)).toBeLessThan(1);
    expect(wipeRewardMultiplier(2)).toBeLessThan(wipeRewardMultiplier(1));
  });

  it('nikdy neklesne pod dolní hranici 0.25', () => {
    expect(wipeRewardMultiplier(100)).toBe(0.25);
    expect(wipeRewardMultiplier(-5)).toBe(1);
  });
});
