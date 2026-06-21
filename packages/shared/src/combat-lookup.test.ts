import { describe, expect, it } from 'vitest';
import { findAbilityById, findAbilityByName, findEnemyByName } from './combat-lookup';
import { CLASS_BASELINE_ABILITIES, EXTRA_SPELLS, SUBCLASS_ABILITIES } from './data/abilities';
import { BESTIARY, BESTIARY_IDS } from './data/enemies';

describe('findAbilityById', () => {
  it('resolves a concrete catalog id with its spell tier intact', () => {
    // Wizard Fireball baseline carries spellTier 3 (unlike the name-based draft-pool
    // variant which lacks it) — id lookup must hit the concrete catalog entry.
    const fb = findAbilityById('wiz_fireball');
    expect(fb).toBeDefined();
    expect(fb!.name).toBe('Fireball');
    expect(fb!.spellTier).toBe(3);
    expect(fb!.dice).toEqual({ count: 8, sides: 6, bonus: 0 });
  });

  it('returns undefined for an unknown id', () => {
    expect(findAbilityById('does_not_exist')).toBeUndefined();
  });

  it('every baseline ability id is resolvable by id', () => {
    for (const list of Object.values(CLASS_BASELINE_ABILITIES)) {
      for (const ab of list) {
        expect(findAbilityById(ab.id)?.id).toBe(ab.id);
      }
    }
  });

  it('name lookup still works (combat-log path)', () => {
    expect(findAbilityByName('Fireball')?.name).toBe('Fireball');
  });

  it('name lookup covers prepared-pool, subclass and enemy abilities (every cast has a card)', () => {
    // Bug fix: combat log only iterated baseline + signature → EXTRA_SPELLS,
    // subclass and enemy casts had no clickable card.
    const sampleExtra = Object.values(EXTRA_SPELLS).flat()[0];
    if (sampleExtra) expect(findAbilityByName(sampleExtra.name)?.name).toBe(sampleExtra.name);
    const sampleSubclass = Object.values(SUBCLASS_ABILITIES)[0];
    if (sampleSubclass) expect(findAbilityByName(sampleSubclass.name)?.name).toBe(sampleSubclass.name);
    const enemyAbility = BESTIARY_IDS.flatMap((id) => BESTIARY[id]?.abilities ?? [])[0];
    if (enemyAbility) expect(findAbilityByName(enemyAbility.name)?.name).toBe(enemyAbility.name);
  });
});

describe('findEnemyByName (NPC inspect card)', () => {
  it('exposes AC and a bestiary stat-block for catalog enemies', () => {
    // Pick a catalog template that appears in the bestiary (gauntlet/quest fallback).
    const template = BESTIARY[BESTIARY_IDS[0]!]!;
    const npc = findEnemyByName(template.name);
    expect(npc).toBeDefined();
    expect(npc!.armorClass).toBeGreaterThan(0);
    expect(npc!.bestiary?.templateId).toBe(template.id);
    expect(npc!.bestiary?.creatureType).toBe(template.creatureType);
  });

  it('returns undefined for an unknown enemy name', () => {
    expect(findEnemyByName('Definitely Not An Enemy')).toBeUndefined();
  });
});
