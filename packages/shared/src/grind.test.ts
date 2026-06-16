import { describe, expect, it } from 'vitest';
import { computeGrindReward, type GrindActivityParams } from './activity';
import { questingZoneForLevel, simulateGrindRun } from './grind';
import { referenceXpPerHour } from './leveling';
import { deriveCombatProfile, type CombatActor } from './combat';
import { baseStatsFor } from './character';
import { aggregateTalentEffects } from './data/talents';

function makeProfile(level: number): CombatActor {
  return deriveCombatProfile({
    name: 'Hero',
    level,
    klass: 'warrior',
    primary: baseStatsFor('human', 'warrior', level),
    equipment: {},
    talents: aggregateTalentEffects('warrior', {}),
  });
}

describe('questingZoneForLevel', () => {
  it('vybere zónu frakce dle levelu (a jen své frakce)', () => {
    expect(questingZoneForLevel('alliance', 1)).toBe('northshire');
    expect(questingZoneForLevel('alliance', 30)).toBe('duskwood');
    expect(questingZoneForLevel('alliance', 55)).toBe('eastern_plaguelands');
    expect(questingZoneForLevel('horde', 5)).toBe('durotar');
    expect(questingZoneForLevel('horde', 20)).toBe('barrens');
    expect(questingZoneForLevel('horde', 50)).toBe('felwood');
  });

  it('level nad rozsah → nejvyšší zóna frakce', () => {
    expect(questingZoneForLevel('alliance', 60)).toBe('eastern_plaguelands');
    expect(questingZoneForLevel('horde', 60)).toBe('felwood');
  });
});

describe('computeGrindReward', () => {
  const params: GrindActivityParams = { zoneId: 'westfall', level: 15 };

  it('XP roste s délkou běhu (≈ referenční rychlost × čas)', () => {
    const short = computeGrindReward(params, 900, 1); // 15 min
    const long = computeGrindReward(params, 7200, 1); // 2 h
    expect(long.xp).toBeGreaterThan(short.xp);
    // 2h běh ≈ referenceXpPerHour(15) × 2 × efektivita (mírně < 2×)
    const ceiling = referenceXpPerHour(15) * 2;
    expect(long.xp).toBeLessThanOrEqual(ceiling);
    expect(long.xp).toBeGreaterThan(ceiling * 0.7);
  });

  it('je deterministický pro stejný seed', () => {
    const a = computeGrindReward(params, 3600, 42);
    const b = computeGrindReward(params, 3600, 42);
    expect(a).toEqual(b);
  });

  it('delší běh dá víc loot rollů (≥ kratší), zlato je nezáporné', () => {
    const short = computeGrindReward(params, 600, 7); // < lootRollSec → 1 roll
    const long = computeGrindReward(params, 10800, 7); // 3 h → víc rollů
    expect(long.items.length).toBeGreaterThanOrEqual(short.items.length);
    expect(short.gold).toBeGreaterThanOrEqual(0);
    expect(long.gold).toBeGreaterThanOrEqual(0);
  });

  it('vyšší zakotvený level dává víc XP než nižší (stejná délka)', () => {
    const lo = computeGrindReward({ zoneId: 'northshire', level: 5 }, 3600, 1);
    const hi = computeGrindReward({ zoneId: 'eastern_plaguelands', level: 55 }, 3600, 1);
    expect(hi.xp).toBeGreaterThan(lo.xp);
  });
});

describe('simulateGrindRun', () => {
  const params: GrindActivityParams = { zoneId: 'durotar', level: 5 };

  it('má úvod, souboje (no-fail) a závěr', () => {
    const run = simulateGrindRun(params, makeProfile(5), 3600, 1);
    expect(run.steps[0]!.kind).toBe('narrative');
    expect(run.steps.at(-1)!.kind).toBe('narrative');
    const combats = run.steps.filter((s) => s.kind === 'combat');
    expect(combats.length).toBeGreaterThan(0);
    for (const c of combats) {
      expect(c.enemyName).toBeTruthy();
      expect(c.events!.at(-1)!.type).toBe('enemy_defeated'); // nelze prohrát
    }
  });

  it('delší běh = víc soubojů', () => {
    const shortCombats = simulateGrindRun(params, makeProfile(5), 1200, 1).steps.filter(
      (s) => s.kind === 'combat',
    ).length;
    const longCombats = simulateGrindRun(params, makeProfile(5), 10800, 1).steps.filter(
      (s) => s.kind === 'combat',
    ).length;
    expect(longCombats).toBeGreaterThan(shortCombats);
  });

  it('je deterministický pro stejný seed', () => {
    const a = simulateGrindRun(params, makeProfile(5), 3600, 77);
    const b = simulateGrindRun(params, makeProfile(5), 3600, 77);
    expect(a.steps.map((s) => s.text)).toEqual(b.steps.map((s) => s.text));
  });
});
