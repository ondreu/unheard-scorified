import { describe, expect, it } from 'vitest';
import {
  ABILITY_SCORES,
  abilityModifier,
  abilityModifiers,
  baseStatsFor,
  buildCharacterSheet,
  deriveStats,
  proficiencyBonus,
  spellcastingAbility,
  type AbilityScore,
} from './character';

describe('abilityModifier (D&D)', () => {
  it.each([
    [1, -5],
    [8, -1],
    [9, -1],
    [10, 0],
    [11, 0],
    [12, 1],
    [14, 2],
    [15, 2],
    [20, 5],
    [22, 6],
  ])('score %i -> mod %i', (score, mod) => {
    expect(abilityModifier(score)).toBe(mod);
  });
});

describe('proficiencyBonus (D&D 5e)', () => {
  it.each([
    [1, 2],
    [4, 2],
    [5, 3],
    [8, 3],
    [9, 4],
    [13, 5],
    [17, 6],
    [20, 6],
  ])('level %i -> +%i', (level, prof) => {
    expect(proficiencyBonus(level)).toBe(prof);
  });
});

describe('baseStatsFor', () => {
  it('vrací všech 6 D&D atributů', () => {
    const scores = baseStatsFor('human', 'wizard', 1);
    for (const key of ABILITY_SCORES) {
      expect(typeof scores[key]).toBe('number');
    }
  });

  it('classa zvedá svůj primární atribut (mage → intelligence +3)', () => {
    const mage = baseStatsFor('human', 'wizard', 1);
    const noBonus = 15 + 0; // human intelligence mod 0, +0 growth
    expect(mage.intelligence).toBe(noBonus + 3);
  });
});

describe('abilityModifiers', () => {
  it('mapuje všech 6 skóre na modifikátory', () => {
    const mods = abilityModifiers({
      strength: 16,
      dexterity: 10,
      constitution: 14,
      intelligence: 8,
      wisdom: 12,
      charisma: 20,
    });
    expect(mods).toEqual({
      strength: 3,
      dexterity: 0,
      constitution: 2,
      intelligence: -1,
      wisdom: 1,
      charisma: 5,
    });
  });
});

describe('spellcastingAbility', () => {
  it('caster classy mají D&D-přiměřený casting atribut', () => {
    expect(spellcastingAbility('wizard')).toBe('intelligence');
    expect(spellcastingAbility('cleric')).toBe('wisdom');
    expect(spellcastingAbility('warlock')).toBe('charisma');
    expect(spellcastingAbility('paladin')).toBe('charisma');
  });
});

describe('deriveStats (D&D derived)', () => {
  const scores: Record<AbilityScore, number> = {
    strength: 16,
    dexterity: 14,
    constitution: 12,
    intelligence: 18,
    wisdom: 10,
    charisma: 8,
  };

  it('Armor Class = 10 + DEX modifikátor', () => {
    const d = deriveStats(scores, 1, 'fighter');
    expect(d.armorClass).toBe(10 + abilityModifier(scores.dexterity));
  });

  it('initiative = DEX modifikátor', () => {
    const d = deriveStats(scores, 5, 'rogue');
    expect(d.initiative).toBe(abilityModifier(scores.dexterity));
  });

  it('spell save DC = 8 + proficiency + casting modifikátor', () => {
    const d = deriveStats(scores, 5, 'wizard'); // casting = intelligence (18 → +4), prof@5 = +3
    expect(d.spellSaveDc).toBe(8 + 3 + 4);
    expect(d.spellAttackBonus).toBe(3 + 4);
  });

  it('attack bonus = proficiency + lepší z STR/DEX modifikátoru', () => {
    const d = deriveStats(scores, 1, 'fighter'); // STR 16 (+3) > DEX 14 (+2), prof +2
    expect(d.attackBonus).toBe(2 + 3);
  });

  it('saving throws odpovídají modifikátorům', () => {
    const d = deriveStats(scores, 1, 'fighter');
    expect(d.savingThrows).toEqual(abilityModifiers(scores));
  });
});

describe('buildCharacterSheet vystaví D&D odvozené staty', () => {
  it('sheet má modifiers, AC i proficiency', () => {
    const sheet = buildCharacterSheet('human', 'wizard', 0);
    expect(sheet.derived.proficiencyBonus).toBe(2);
    expect(sheet.derived.armorClass).toBeGreaterThan(0);
    expect(ABILITY_SCORES.every((k) => typeof sheet.derived.modifiers[k] === 'number')).toBe(true);
  });
});
