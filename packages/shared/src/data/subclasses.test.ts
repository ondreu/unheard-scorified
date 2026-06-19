import { describe, expect, it } from 'vitest';
import { CLASSES, CLASS_IDS, SUBCLASSES, isSubclassOf } from './classes';
import { SUBCLASS_ABILITIES, resolveAbilities } from './abilities';

describe('subclasses (B3 — 2 per classa)', () => {
  it('každá classa má aspoň 2 subclassy s unikátními id', () => {
    for (const c of CLASS_IDS) {
      const subs = CLASSES[c].subclasses;
      expect(subs.length, `${c} má mít ≥2 subclassy`).toBeGreaterThanOrEqual(2);
      const ids = subs.map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('všechna subclass id v SUBCLASSES patří právě jedné class (isSubclassOf)', () => {
    for (const id of Object.keys(SUBCLASSES)) {
      const owners = CLASS_IDS.filter((c) =>
        isSubclassOf(c, id as keyof typeof SUBCLASSES),
      );
      expect(owners.length, `${id} musí patřit právě jedné class`).toBe(1);
    }
  });

  it('každá subclass má signature ability v SUBCLASS_ABILITIES', () => {
    for (const id of Object.keys(SUBCLASSES)) {
      expect(SUBCLASS_ABILITIES[id as keyof typeof SUBCLASSES]).toBeDefined();
    }
  });

  it('signature ability je živá v resolveAbilities na cap levelu', () => {
    for (const c of CLASS_IDS) {
      for (const sub of CLASSES[c].subclasses) {
        const abilities = resolveAbilities(c, sub.id, 20);
        const sig = SUBCLASS_ABILITIES[sub.id];
        expect(
          abilities.some((a) => a.id === sig.id),
          `${c}/${sub.id}: signature ${sig.id} má být v kitu na lvl 20`,
        ).toBe(true);
      }
    }
  });

  it('nová subclass se před subclassLevel neaktivuje', () => {
    // Champion/Battle Master se volí na lvl 3 → na lvl 1 nejsou v kitu.
    const lvl1 = resolveAbilities('fighter', 'battle_master', 1);
    expect(lvl1.some((a) => a.id === 'battlemaster_maneuver')).toBe(false);
  });
});
