import { describe, expect, it } from 'vitest';
import {
  CLASS_BASELINE_ABILITIES,
  EXTRA_SPELLS,
  SIGNATURE_ABILITIES,
  SUBCLASS_ABILITIES,
  type SignatureAbility,
} from './data/abilities';

/**
 * Audit cooldownů spellů — regresní kontrakt (viz `docs/systems/spell-cooldown-audit.md`).
 *
 * Cíl: zamknout invarianty, na kterých audit stojí, ať se katalog nerozejde s
 * D&D modelem (slot = zdroj, cooldown = pacing) ani sám se sebou. Bandy/výjimky
 * jsou **úmyslně mírné** — kontrakt hlídá hrubé regrese (překlep cd, nekonzistentní
 * cooldown stejného kouzla), ne přesné balanc číslo (to je rozhodnutí PM / ADR).
 */

// Tahové simulátory převádějí cooldownSec → tahy přes round(cd / TURN_SEC).
// Stejná konstanta v dungeon-run / dungeon-party / gauntlet (záměrně duplikovaná
// tady jako kotva — pokud se TURN_SEC změní, tenhle test upozorní na dopad).
const TURN_SEC = 3;
const cooldownTurns = (cd: number): number => (cd <= 0 ? 0 : Math.max(1, Math.round(cd / TURN_SEC)));

/** Plochý seznam abilit z class poolů (baseline + extra) — to, co reálně sesílá hráč. */
function classPoolAbilities(): { klass: string; ability: SignatureAbility }[] {
  const out: { klass: string; ability: SignatureAbility }[] = [];
  for (const [klass, list] of Object.entries(CLASS_BASELINE_ABILITIES)) {
    for (const ability of list) out.push({ klass, ability });
  }
  for (const [klass, list] of Object.entries(EXTRA_SPELLS)) {
    for (const ability of list) out.push({ klass, ability });
  }
  return out;
}

/** Úplně všechny ability napříč všemi pooly (vč. subclass + Gauntlet draft). */
function allAbilities(): SignatureAbility[] {
  return [
    ...classPoolAbilities().map((r) => r.ability),
    ...Object.values(SUBCLASS_ABILITIES),
    ...Object.values(SIGNATURE_ABILITIES).map((a, i) => ({ id: `sig_${i}`, ...a })),
  ];
}

describe('spell cooldown audit — sanity', () => {
  it('every cooldown is a finite, non-negative number', () => {
    for (const a of allAbilities()) {
      expect(Number.isFinite(a.cooldownSec), a.name).toBe(true);
      expect(a.cooldownSec, a.name).toBeGreaterThanOrEqual(0);
    }
  });

  it('a non-zero cooldown never rounds below one turn (no phantom sub-turn cooldown)', () => {
    // V tahových simech je cd < TURN_SEC/2 nerozlišitelné od 0 → mátlo by.
    for (const a of allAbilities()) {
      if (a.cooldownSec > 0) {
        expect(a.cooldownSec, `${a.name}: cd>0 musí dát ≥1 tah`).toBeGreaterThanOrEqual(TURN_SEC);
        expect(cooldownTurns(a.cooldownSec), a.name).toBeGreaterThanOrEqual(1);
      }
    }
  });
});

describe('spell cooldown audit — consistency (slot = zdroj, cooldown = pacing)', () => {
  it('the same spell name shares one cooldown across all class pools', () => {
    const byName = new Map<string, Set<number>>();
    for (const { ability } of classPoolAbilities()) {
      const set = byName.get(ability.name) ?? new Set<number>();
      set.add(ability.cooldownSec);
      byName.set(ability.name, set);
    }
    const conflicts = [...byName.entries()]
      .filter(([, set]) => set.size > 1)
      .map(([name, set]) => `${name}: ${[...set].sort((a, b) => a - b).join('/')}`);
    expect(conflicts, `Stejné kouzlo má různé cooldowny: ${conflicts.join(', ')}`).toEqual([]);
  });

  it('cantrips (at-will, tier 0) stay short — they are basic filler, not gated by slots', () => {
    for (const { ability } of classPoolAbilities()) {
      if (ability.spellTier === 0) {
        expect(ability.cooldownSec, `${ability.name} (cantrip)`).toBeLessThanOrEqual(6);
      }
    }
  });

  it('no leveled spell (tier ≥ 1) is cheaper than a cantrip — slots already gate them', () => {
    const cantripFloor = Math.min(
      ...classPoolAbilities()
        .map((r) => r.ability)
        .filter((a) => a.spellTier === 0)
        .map((a) => a.cooldownSec),
    );
    for (const { ability } of classPoolAbilities()) {
      if (ability.spellTier !== undefined && ability.spellTier >= 1) {
        expect(ability.cooldownSec, `${ability.name} (tier ${ability.spellTier})`).toBeGreaterThanOrEqual(
          cantripFloor,
        );
      }
    }
  });

  it('leveled spells stay within a sane cooldown ceiling (long-CD = no-slot abilities only)', () => {
    // Slot-gated kouzla nemají mít „big cooldown" (22–26s) — to patří jen no-slot
    // abilitám (Lay on Hands, Channel Divinity, mitigace), které spellTier nemají.
    for (const { ability } of classPoolAbilities()) {
      if (ability.spellTier !== undefined && ability.spellTier >= 1) {
        expect(ability.cooldownSec, `${ability.name} (tier ${ability.spellTier})`).toBeLessThanOrEqual(12);
      }
    }
  });
});
