import { describe, expect, it } from 'vitest';
import { findAbilityById, findAbilityByName } from './combat-lookup';
import { CLASS_BASELINE_ABILITIES } from './data/abilities';

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
});
