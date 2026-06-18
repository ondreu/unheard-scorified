import { describe, expect, it } from 'vitest';
import {
  CHALLENGE_RATINGS,
  CREATURE_TYPES,
  DAMAGE_TYPES,
  MAGICAL_DAMAGE_TYPES,
  PHYSICAL_DAMAGE_TYPES,
  applyDamageInteraction,
  crForContentLevel,
  crStatGuide,
  damageInteraction,
  damageInteractionNote,
  formatChallengeRating,
  isPhysicalDamage,
  proficiencyForChallengeRating,
  xpForChallengeRating,
} from './damage';

describe('damage types', () => {
  it('has 13 distinct D&D damage types (3 physical + 10 magical)', () => {
    expect(PHYSICAL_DAMAGE_TYPES).toHaveLength(3);
    expect(MAGICAL_DAMAGE_TYPES).toHaveLength(10);
    expect(DAMAGE_TYPES).toHaveLength(13);
    expect(new Set(DAMAGE_TYPES).size).toBe(13);
  });

  it('classifies physical vs magical', () => {
    expect(isPhysicalDamage('slashing')).toBe(true);
    expect(isPhysicalDamage('bludgeoning')).toBe(true);
    expect(isPhysicalDamage('fire')).toBe(false);
    expect(isPhysicalDamage('necrotic')).toBe(false);
  });

  it('lists 14 creature types', () => {
    expect(CREATURE_TYPES).toHaveLength(14);
    expect(CREATURE_TYPES).toContain('undead');
    expect(CREATURE_TYPES).toContain('dragon');
  });
});

describe('damage interaction', () => {
  it('immunity beats everything', () => {
    expect(damageInteraction('fire', { immunities: ['fire'], vulnerabilities: ['fire'] })).toBe(
      'immune',
    );
  });

  it('resistance and vulnerability on same type cancel out', () => {
    expect(
      damageInteraction('cold', { resistances: ['cold'], vulnerabilities: ['cold'] }),
    ).toBe('normal');
  });

  it('detects plain resistance / vulnerability / normal', () => {
    expect(damageInteraction('fire', { resistances: ['fire'] })).toBe('resistant');
    expect(damageInteraction('fire', { vulnerabilities: ['fire'] })).toBe('vulnerable');
    expect(damageInteraction('fire', {})).toBe('normal');
  });

  it('applies the multipliers (resist rounds down, immune zeroes, vuln doubles)', () => {
    expect(applyDamageInteraction(11, 'resistant')).toBe(5);
    expect(applyDamageInteraction(11, 'vulnerable')).toBe(22);
    expect(applyDamageInteraction(11, 'immune')).toBe(0);
    expect(applyDamageInteraction(11, 'normal')).toBe(11);
  });

  it('annotates non-normal interactions for the log', () => {
    expect(damageInteractionNote('normal')).toBe('');
    expect(damageInteractionNote('resistant')).toBe(' (resisted)');
    expect(damageInteractionNote('vulnerable')).toBe(' (vulnerable!)');
    expect(damageInteractionNote('immune')).toBe(' (immune)');
  });
});

describe('challenge rating', () => {
  it('covers 0, 1/8, 1/4, 1/2 and 1..30', () => {
    expect(CHALLENGE_RATINGS).toHaveLength(34);
    expect(CHALLENGE_RATINGS.slice(0, 4)).toEqual([0, 0.125, 0.25, 0.5]);
  });

  it('maps CR to D&D 5e XP values', () => {
    expect(xpForChallengeRating(0.125)).toBe(25);
    expect(xpForChallengeRating(0.5)).toBe(100);
    expect(xpForChallengeRating(1)).toBe(200);
    expect(xpForChallengeRating(5)).toBe(1800);
    expect(xpForChallengeRating(10)).toBe(5900);
    expect(xpForChallengeRating(20)).toBe(25000);
    expect(xpForChallengeRating(30)).toBe(155000);
  });

  it('maps CR to monster proficiency bonus', () => {
    expect(proficiencyForChallengeRating(1)).toBe(2);
    expect(proficiencyForChallengeRating(5)).toBe(3);
    expect(proficiencyForChallengeRating(9)).toBe(4);
    expect(proficiencyForChallengeRating(13)).toBe(5);
    expect(proficiencyForChallengeRating(17)).toBe(6);
  });

  it('AC and HP grow monotonically with CR', () => {
    let prevAc = 0;
    let prevHp = 0;
    for (const cr of CHALLENGE_RATINGS) {
      const guide = crStatGuide(cr);
      expect(guide.armorClass).toBeGreaterThanOrEqual(prevAc);
      expect(guide.hitPoints).toBeGreaterThanOrEqual(prevHp);
      prevAc = guide.armorClass;
      prevHp = guide.hitPoints;
    }
  });

  it('clamps out-of-range CR to the nearest edge', () => {
    expect(crStatGuide(-5)).toEqual(crStatGuide(0));
    expect(crStatGuide(99)).toEqual(crStatGuide(30));
  });

  it('formats fractional CR as fractions', () => {
    expect(formatChallengeRating(0.125)).toBe('1/8');
    expect(formatChallengeRating(0.25)).toBe('1/4');
    expect(formatChallengeRating(0.5)).toBe('1/2');
    expect(formatChallengeRating(7)).toBe('7');
  });
});

describe('crForContentLevel (MR-10)', () => {
  it('maps content level directly to CR for trash', () => {
    expect(crForContentLevel(1)).toBe(1);
    expect(crForContentLevel(10)).toBe(10);
    expect(crForContentLevel(20)).toBe(20);
  });

  it('bumps bosses by +2 CR', () => {
    expect(crForContentLevel(5, true)).toBe(7);
    expect(crForContentLevel(18, true)).toBe(20);
  });

  it('clamps to the supported 0..30 range (e.g. Gauntlet effective levels)', () => {
    expect(crForContentLevel(-3)).toBe(0);
    expect(crForContentLevel(40)).toBe(30);
    expect(crForContentLevel(30, true)).toBe(30);
  });

  it('rounds fractional levels', () => {
    expect(crForContentLevel(4.4)).toBe(4);
    expect(crForContentLevel(4.6)).toBe(5);
  });

  it('yields D&D CR-table combat stats via crStatGuide', () => {
    // Level 5 boss → CR 7 → DMG row.
    const guide = crStatGuide(crForContentLevel(5, true));
    expect(guide).toEqual(crStatGuide(7));
    expect(guide.armorClass).toBe(15);
    expect(guide.attackBonus).toBe(6);
  });
});
