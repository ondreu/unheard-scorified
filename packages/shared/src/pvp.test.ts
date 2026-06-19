import { describe, expect, it } from 'vitest';
import {
  activeSeasonAt,
  applyRatingChange,
  ARENA_SEASONS,
  bracketTeamSize,
  eloDelta,
  expectedScore,
  isTeamBracket,
  ratingTier,
  ratingTierProgress,
  seasonById,
  seasonRewardGold,
  simulatePvpDuel,
  simulateTeamFight,
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
    shield: 0,
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

  it('MR-5: combat běží na dice-roll modelu (d20 vs AC v logu, hity i miss)', () => {
    const a = actor('Alice', { attackPower: 40, armorClass: 16, attackBonus: 6 });
    const b = actor('Bob', { attackPower: 40, armorClass: 16, attackBonus: 6 });
    const joined = simulatePvpDuel(a, b, 7)
      .events.map((e) => e.message)
      .join('\n');
    expect(joined).toMatch(/vs AC \d+/);
    expect(joined).toMatch(/MISS/);
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
      signatureAbilities: [{ id: 'pyroblast_mastery', name: 'Pyroblast', kind: 'strike', cooldownSec: 5, damageMult: 2.5 }],
    });
    const result = simulatePvpDuel(caster, actor('Dummy', { maxHealth: 1500 }), 3);
    expect(result.events.some((e) => e.ability === 'Pyroblast')).toBe(true);
  });

  // Spell sloty (ADR 0034): tier ≥ 1 kouzlo čerpá per-duel rozpočet strany; když
  // dojde, postava mlátí basic údery / cantripy. Dva tankoví aktéři → dlouhý duel
  // (rampage ho ukončí), takže kouzlo na cd 4 s má mnoho příležitostí se seslat.
  const slotCaster = (slots: Record<number, number>, tier: number): CombatActor =>
    actor('Caster', {
      maxHealth: 4000,
      attackPower: 30,
      signatureAbilities: [{ id: 'spell_x', name: 'Spell X', kind: 'strike', cooldownSec: 4, damageMult: 1.5, spellTier: tier }],
      spellSlots: slots,
    });
  const duelCasts = (slots: Record<number, number>, tier: number): number =>
    simulatePvpDuel(slotCaster(slots, tier), actor('Foe', { maxHealth: 4000, attackPower: 30 }), 11)
      .events.filter((e) => e.ability === 'Spell X').length;

  it('spell sloty (ADR 0034): tier ≥ 1 kouzlo je omezené počtem slotů', () => {
    expect(duelCasts({ 1: 2 }, 1)).toBe(2);
    expect(duelCasts({}, 1)).toBe(0);
  });

  it('spell sloty (ADR 0034): cantrip (tier 0) je neomezený i bez slotů', () => {
    expect(duelCasts({}, 0)).toBeGreaterThan(2);
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

describe('brackets', () => {
  it('rozpozná týmové brackety a jejich velikost', () => {
    expect(isTeamBracket('3v3')).toBe(true);
    expect(isTeamBracket('5v5')).toBe(true);
    expect(isTeamBracket('1v1')).toBe(false);
    expect(bracketTeamSize('3v3')).toBe(3);
    expect(bracketTeamSize('5v5')).toBe(5);
    expect(bracketTeamSize('1v1')).toBe(1);
  });
});

describe('simulateTeamFight', () => {
  const team = (prefix: string, n: number, o: Partial<CombatActor> = {}): CombatActor[] =>
    Array.from({ length: n }, (_, i) => actor(`${prefix}${i + 1}`, o));

  it('je deterministický pro stejný seed', () => {
    const a = team('A', 3);
    const b = team('B', 3);
    expect(simulateTeamFight(a, b, 999)).toEqual(simulateTeamFight(a, b, 999));
  });

  it('silnější tým spolehlivě vyhraje a zápas skončí victory', () => {
    const strong = team('S', 3, { attackPower: 120, maxHealth: 800 });
    const weak = team('W', 3, { attackPower: 18, maxHealth: 280 });
    const r = simulateTeamFight(strong, weak, 5);
    expect(r.winner).toBe('a');
    expect(r.events.at(-1)?.type).toBe('victory');
    expect(r.durationSec).toBeGreaterThanOrEqual(5);
  });

  it('funguje i pro 5v5 a vždy určí vítěze', () => {
    const r = simulateTeamFight(team('A', 5), team('B', 5), 77);
    expect(['a', 'b']).toContain(r.winner);
  });
});

describe('eloDelta', () => {
  it('výhra proti rovnocennému soupeři přidá ~K/2', () => {
    const { delta } = eloDelta(1500, 1500, true);
    expect(delta).toBe(16);
  });

  it('prohra ubere a rating neklesne pod nulu', () => {
    expect(eloDelta(1500, 1500, false).delta).toBe(-16);
    // Malý rating, rovnocenný soupeř → propad pod nulu se ořízne na 0.
    expect(eloDelta(10, 10, false).rating).toBe(0);
  });

  it('výhra proti silnějšímu dá víc než proti slabšímu', () => {
    const vsStrong = eloDelta(1500, 1900, true).delta;
    const vsWeak = eloDelta(1500, 1100, true).delta;
    expect(vsStrong).toBeGreaterThan(vsWeak);
  });
});
