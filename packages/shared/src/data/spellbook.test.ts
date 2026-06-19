import { describe, expect, it } from 'vitest';
import {
  defaultPreparedSpellIds,
  isValidPreparedSelection,
  preparedLimits,
  resolvePreparedAbilities,
  spellPoolFor,
} from './spell-slots';
import { resolveAbilities, classSpellCatalog } from './abilities';
import { CLASS_IDS } from './classes';
import { isCaster } from './spell-slots';

describe('preparedLimits', () => {
  it('non-caster má 0/0', () => {
    expect(preparedLimits('fighter', 20)).toEqual({ cantrips: 0, leveled: 0 });
    expect(preparedLimits('rogue', 20)).toEqual({ cantrips: 0, leveled: 0 });
  });

  it('full caster roste cantripy 2→3→4 a leveled s úrovní', () => {
    expect(preparedLimits('wizard', 1).cantrips).toBe(2);
    expect(preparedLimits('wizard', 4).cantrips).toBe(3);
    expect(preparedLimits('wizard', 10).cantrips).toBe(4);
    expect(preparedLimits('wizard', 1).leveled).toBeLessThan(preparedLimits('wizard', 20).leveled);
  });

  it('half caster (paladin) nemá cantripy', () => {
    expect(preparedLimits('paladin', 20).cantrips).toBe(0);
    expect(preparedLimits('paladin', 20).leveled).toBeGreaterThan(0);
  });
});

describe('spellPoolFor', () => {
  it('vrací jen kouzla classy do levelu (gated unlockLevel), bez subclass', () => {
    const lowL = spellPoolFor('wizard', 1);
    const highL = spellPoolFor('wizard', 20);
    expect(highL.leveled.length).toBeGreaterThan(lowL.leveled.length);
    // žádné kouzlo nad aktuální level
    const catalog = classSpellCatalog('wizard');
    for (const e of [...lowL.cantrips, ...lowL.leveled]) {
      const ab = catalog.find((a) => a.id === e.id)!;
      expect(ab.unlockLevel).toBeLessThanOrEqual(1);
    }
  });

  it('cantripy mají tier 0, leveled tier ≥ 1', () => {
    const pool = spellPoolFor('cleric', 20);
    expect(pool.cantrips.every((s) => s.spellTier === 0)).toBe(true);
    expect(pool.leveled.every((s) => s.spellTier >= 1)).toBe(true);
  });

  it('martial classa má prázdný pool', () => {
    const pool = spellPoolFor('barbarian', 20);
    expect(pool.cantrips).toHaveLength(0);
    expect(pool.leveled).toHaveLength(0);
  });
});

describe('isValidPreparedSelection', () => {
  it('akceptuje výběr v limitu z poolu', () => {
    const pool = spellPoolFor('wizard', 20);
    const limits = preparedLimits('wizard', 20);
    const ids = [
      ...pool.cantrips.slice(0, limits.cantrips).map((s) => s.id),
      ...pool.leveled.slice(0, limits.leveled).map((s) => s.id),
    ];
    expect(isValidPreparedSelection('wizard', 20, ids)).toBe(true);
  });

  it('odmítne neznámé id', () => {
    expect(isValidPreparedSelection('wizard', 20, ['not_a_spell'])).toBe(false);
  });

  it('odmítne kouzlo nad aktuální level', () => {
    const fireball = 'wiz_fireball'; // unlock 14
    expect(isValidPreparedSelection('wizard', 5, [fireball])).toBe(false);
  });

  it('odmítne překročení leveled limitu', () => {
    const pool = spellPoolFor('wizard', 20);
    const limits = preparedLimits('wizard', 20);
    const tooMany = pool.leveled.slice(0, limits.leveled + 1).map((s) => s.id);
    // jen pokud pool má dost kouzel na překročení
    if (tooMany.length > limits.leveled) {
      expect(isValidPreparedSelection('wizard', 20, tooMany)).toBe(false);
    }
  });

  it('odmítne duplicity', () => {
    const pool = spellPoolFor('wizard', 20);
    const id = pool.leveled[0]!.id;
    expect(isValidPreparedSelection('wizard', 20, [id, id])).toBe(false);
  });
});

describe('resolvePreparedAbilities', () => {
  it('defaultPreparedSpellIds = baseline spell ids (legacy), validní výběr', () => {
    const ids = defaultPreparedSpellIds('wizard', 20);
    expect(ids.length).toBeGreaterThan(0);
    expect(isValidPreparedSelection('wizard', 20, ids)).toBe(true);
  });

  it('null prepared = legacy baseline kit (zpětná kompatibilita)', () => {
    for (const klass of CLASS_IDS) {
      const legacy = resolveAbilities(klass, null, 20).map((a) => a.id).sort();
      const resolved = resolvePreparedAbilities(klass, null, 20, null)
        .map((a) => a.id)
        .sort();
      expect(resolved).toEqual(legacy);
    }
  });

  it('martial classa není ovlivněna výběrem (vždy plný kit)', () => {
    const legacy = resolveAbilities('rogue', 'thief', 14).map((a) => a.id).sort();
    const resolved = resolvePreparedAbilities('rogue', 'thief', 14, [])
      .map((a) => a.id)
      .sort();
    expect(resolved).toEqual(legacy);
  });

  it('caster s výběrem dostane always-on + zvolená kouzla', () => {
    const pool = spellPoolFor('wizard', 20);
    const chosen = [pool.leveled[0]!.id];
    const resolved = resolvePreparedAbilities('wizard', 'school_of_evocation', 20, chosen);
    const ids = resolved.map((a) => a.id);
    // zvolené kouzlo je tam
    expect(ids).toContain(chosen[0]);
    // subclass signature (always-on) je tam
    expect(ids).toContain('evocation_overchannel');
    // nezvolené leveled kouzlo NENÍ v setu
    const notChosen = pool.leveled.find((s) => s.id !== chosen[0]);
    if (notChosen) expect(ids).not.toContain(notChosen.id);
  });

  it('respektuje limit (defenzivní clamp) i když prepared obsahuje víc', () => {
    const all = spellPoolFor('wizard', 20).leveled.map((s) => s.id);
    const limit = preparedLimits('wizard', 20).leveled;
    const resolved = resolvePreparedAbilities('wizard', null, 20, all);
    const leveledCount = resolved.filter((a) => (a.spellTier ?? 0) >= 1).length;
    expect(leveledCount).toBeLessThanOrEqual(limit);
  });
});

describe('caster catalog smoke', () => {
  it('každý caster má smysluplně velký pool (>= 6 kouzel)', () => {
    for (const klass of CLASS_IDS) {
      if (!isCaster(klass)) continue;
      const pool = spellPoolFor(klass, 20);
      expect(pool.cantrips.length + pool.leveled.length).toBeGreaterThanOrEqual(6);
    }
  });
});
