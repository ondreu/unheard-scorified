import { describe, expect, it } from 'vitest';
import {
  activeSeasonAt,
  applyRatingChange,
  ARENA_SEASONS,
  expectedScore,
  ratingTier,
  ratingTierProgress,
  seasonById,
  seasonRewardGold,
  simulatePvpDuel,
  STARTING_RATING,
  type CombatActor,
} from './index';

function actor(name: string, overrides: Partial<CombatActor> = {}): CombatActor {
  return {
    name,
    maxHealth: 500,
    attackPower: 40,
    swingInterval: 2,
    critChance: 0.05,
    critMultiplier: 2,
    armor: 0,
    lifesteal: 0,
    signatureAbilities: [],
    ...overrides,
  };
}

describe('simulatePvpDuel', () => {
  it('je deterministický pro stejný seed', () => {
    const a = actor('Alice');
    const b = actor('Bob');
    const r1 = simulatePvpDuel(a, b, 12345);
    const r2 = simulatePvpDuel(a, b, 12345);
    expect(r2).toEqual(r1);
  });

  it('silnější aktér spolehlivě vyhraje', () => {
    const strong = actor('Strong', { attackPower: 120, maxHealth: 800 });
    const weak = actor('Weak', { attackPower: 20, maxHealth: 300 });
    const result = simulatePvpDuel(strong, weak, 42);
    expect(result.winner).toBe('a');
    expect(result.events.at(-1)?.type).toBe('victory');
    expect(result.events.at(-1)?.source).toBe('Strong');
  });

  it('vždy určí vítěze a má smysluplnou délku', () => {
    // I dva tanci s lifestealem skončí (rampage eskalace).
    const a = actor('Tank A', { maxHealth: 2000, attackPower: 15, armor: 300, lifesteal: 0.2 });
    const b = actor('Tank B', { maxHealth: 2000, attackPower: 15, armor: 300, lifesteal: 0.2 });
    const result = simulatePvpDuel(a, b, 7);
    expect(['a', 'b']).toContain(result.winner);
    expect(result.durationSec).toBeGreaterThanOrEqual(5);
    expect(result.events.filter((e) => e.type === 'victory')).toHaveLength(1);
  });

  it('timeline je seřazený podle času', () => {
    const result = simulatePvpDuel(actor('A'), actor('B'), 99);
    for (let i = 1; i < result.events.length; i++) {
      expect(result.events[i]!.t).toBeGreaterThanOrEqual(result.events[i - 1]!.t);
    }
  });

  it('používá signature abilities, pokud je aktér má', () => {
    const caster = actor('Caster', {
      attackPower: 60,
      signatureAbilities: [{ id: 'pyroblast_mastery', name: 'Pyroblast', cooldownSec: 5, damageMult: 2.5 }],
    });
    const result = simulatePvpDuel(caster, actor('Dummy', { maxHealth: 1500 }), 3);
    expect(result.events.some((e) => e.ability === 'Pyroblast')).toBe(true);
  });
});

describe('Elo rating', () => {
  it('rovní soupeři mají očekávané skóre 0.5', () => {
    expect(expectedScore(1500, 1500)).toBeCloseTo(0.5, 5);
  });

  it('výhra favorita dá málo, výhra outsidera hodně', () => {
    const favoriteWins = applyRatingChange(1800, 1400);
    const underdogWins = applyRatingChange(1400, 1800);
    expect(favoriteWins.winnerDelta).toBeGreaterThan(0);
    expect(underdogWins.winnerDelta).toBeGreaterThan(favoriteWins.winnerDelta);
  });

  it('součet delt je přibližně nulový (Elo je zero-sum)', () => {
    const c = applyRatingChange(1550, 1480);
    expect(c.winnerDelta + c.loserDelta).toBe(0);
  });

  it('rating neklesne pod nulu', () => {
    const c = applyRatingChange(10, 5);
    expect(c.loser).toBeGreaterThanOrEqual(0);
  });
});

describe('tiery a sezóny', () => {
  it('startovní rating je Combatant', () => {
    expect(ratingTier(STARTING_RATING).tier).toBe('combatant');
  });

  it('tier roste s ratingem', () => {
    expect(ratingTier(1000).tier).toBe('unranked');
    expect(ratingTier(1700).tier).toBe('rival');
    expect(ratingTier(2500).tier).toBe('gladiator');
  });

  it('odměna roste s tierem', () => {
    expect(seasonRewardGold(1000)).toBe(0);
    expect(seasonRewardGold(2500)).toBeGreaterThan(seasonRewardGold(1500));
  });

  it('nextMin je null na nejvyšším tieru', () => {
    expect(ratingTierProgress(3000).nextMin).toBeNull();
    expect(ratingTierProgress(1500).nextMin).toBe(1600);
  });

  it('activeSeasonAt vybere sezónu pokrývající čas', () => {
    const s1 = ARENA_SEASONS[0]!;
    expect(activeSeasonAt(s1.startsAt + 1000).id).toBe(s1.id);
    // Po poslední sezóně se vrací poslední.
    const last = ARENA_SEASONS[ARENA_SEASONS.length - 1]!;
    expect(activeSeasonAt(last.endsAt + 1_000_000).id).toBe(last.id);
  });

  it('seasonById najde definici', () => {
    expect(seasonById('season-1')?.name).toContain('Season 1');
    expect(seasonById('nope')).toBeUndefined();
  });
});
