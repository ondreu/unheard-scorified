import { describe, expect, it } from 'vitest';
import {
  baseStatsFor,
  buildCharacterSheet,
  deriveStats,
  isValidCharacterName,
  isValidRaceClass,
} from './character';
import { RACES, RACE_IDS } from './data/races';
import { CLASSES } from './data/classes';

describe('isValidRaceClass', () => {
  it('povolí libovolnou kombinaci (D&D race-class matice bez omezení)', () => {
    expect(isValidRaceClass('elf', 'druid')).toBe(true);
    expect(isValidRaceClass('human', 'druid')).toBe(true);
    expect(isValidRaceClass('gnome', 'barbarian')).toBe(true);
  });

  it('každá rasa má jen povolené classy odkazující na existující class', () => {
    for (const race of RACE_IDS) {
      for (const klass of RACES[race].allowedClasses) {
        expect(CLASSES[klass]).toBeDefined();
      }
    }
  });
});

describe('baseStatsFor', () => {
  it('aplikuje rasové i class modifikátory', () => {
    const dragonbornFighter = baseStatsFor('dragonborn', 'fighter', 1);
    // baseline 15 + dragonborn STR +2 + fighter primary +3 = 20
    expect(dragonbornFighter.strength).toBe(20);
  });

  it('roste s levelem', () => {
    const l1 = baseStatsFor('human', 'wizard', 1);
    const l10 = baseStatsFor('human', 'wizard', 10);
    expect(l10.intelligence).toBeGreaterThan(l1.intelligence);
  });
});

describe('deriveStats', () => {
  it('mana classa má manu odvozenou z intellectu', () => {
    const primary = baseStatsFor('gnome', 'wizard', 1);
    const d = deriveStats(primary, 1, 'wizard');
    expect(d.resource.type).toBe('mana');
    expect(d.resource.max).toBeGreaterThan(100);
  });

  it('barbarian používá rage (fixní 100)', () => {
    const primary = baseStatsFor('half_orc', 'barbarian', 1);
    expect(deriveStats(primary, 1, 'barbarian').resource).toEqual({ type: 'rage', max: 100 });
  });
});

describe('buildCharacterSheet', () => {
  it('0 XP = level 1 a konzistentní sheet', () => {
    const sheet = buildCharacterSheet('half_orc', 'druid', 0);
    expect(sheet.level).toBe(1);
    expect(sheet.derived.health).toBeGreaterThan(0);
  });
});

describe('isValidCharacterName', () => {
  it.each([
    ['Aragorn', true],
    ['Al', true],
    ['A', false],
    ['ThisNameIsWayTooLong', false],
    ['Bad1Name', false],
    ['has space', false],
  ])('%s -> %s', (name, expected) => {
    expect(isValidCharacterName(name)).toBe(expected);
  });
});
