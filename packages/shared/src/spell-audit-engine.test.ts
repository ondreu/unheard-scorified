import { describe, expect, it } from 'vitest';
import {
  actorProficiency,
  actorSpellMod,
  bonusDiceSpec,
  deriveCombatProfile,
  healDiceSpec,
  resolveAttack,
  type CombatActor,
} from './index';
import { baseStatsFor } from './character';
import { EMPTY_PROGRESSION } from './levelup';
import type { SignatureAbility } from './data/abilities';
import { SeededRng } from './rng';

// ── Slice A — engine cesty pro „Fix kouzla" (ADR 0036) ───────────────────────
// Bonus kostky na weapon hit, literal heal dice, spellcasting mod, advantage.
// Konverze konkrétních abilit (B–F) ladí balanc; tady jen primitiva.

function caster(overrides: Partial<CombatActor> = {}): CombatActor {
  return {
    name: 'Mage',
    level: 5,
    maxHealth: 40,
    attackPower: 20,
    swingInterval: 3,
    critChance: 0,
    critMultiplier: 2,
    armor: 0,
    lifesteal: 0,
    shield: 0,
    spellSaveDc: 15, // 8 + prof(3 @lvl5) + mod(4)
    signatureAbilities: [],
    ...overrides,
  };
}

describe('actorProficiency (D&D 5e)', () => {
  it('follows 2 + floor((level-1)/4)', () => {
    expect([1, 4, 5, 8, 9, 13, 17, 20].map((level) => actorProficiency(caster({ level })))).toEqual([
      2, 2, 3, 3, 4, 5, 6, 6,
    ]);
  });
});

describe('actorSpellMod', () => {
  it('derives spellcasting mod from spell save DC (DC - 8 - prof)', () => {
    expect(actorSpellMod(caster({ level: 5, spellSaveDc: 15 }))).toBe(4); // 15-8-3
    expect(actorSpellMod(caster({ level: 1, spellSaveDc: 13 }))).toBe(3); // 13-8-2
  });

  it('falls back to damageBonus when no spell DC (martial/enemy)', () => {
    expect(actorSpellMod(caster({ spellSaveDc: undefined, damageBonus: 5 }))).toBe(5);
    expect(actorSpellMod(caster({ spellSaveDc: undefined, damageBonus: undefined }))).toBe(0);
  });
});

describe('healDiceSpec (literal D&D heals)', () => {
  const cureWounds: SignatureAbility = {
    id: 'cw',
    name: 'Cure Wounds',
    kind: 'heal',
    cooldownSec: 6,
    damageMult: 0,
    spellTier: 1,
    dice: { count: 1, sides: 8, bonus: 0 },
    dicePerSlotAbove: 1,
  };

  it('adds spellcasting mod to the heal bonus', () => {
    // 1d8 + spellMod(4) at base tier
    expect(healDiceSpec(cureWounds, 1, caster())).toEqual({ count: 1, sides: 8, bonus: 4 });
  });

  it('upcasts dice per slot above base tier', () => {
    // cast with a 3rd-level slot: 1d8 + 2 upcast = 3d8 (+ mod)
    expect(healDiceSpec(cureWounds, 3, caster())).toEqual({ count: 3, sides: 8, bonus: 4 });
  });

  it('returns undefined for heals without literal dice (legacy attackPower path)', () => {
    const layOnHands: SignatureAbility = { id: 'loh', name: 'Lay on Hands', kind: 'heal', cooldownSec: 6, damageMult: 2 };
    expect(healDiceSpec(layOnHands, null, caster())).toBeUndefined();
  });
});

describe('bonusDiceSpec (weapon-hit rider dice)', () => {
  it('scales Sneak Attack as ceil(level/2) d6', () => {
    const sneak: SignatureAbility = {
      id: 'sa', name: 'Sneak Attack', kind: 'strike', cooldownSec: 4, damageMult: 1,
      bonusDice: { count: 1, sides: 6, bonus: 0 }, bonusDicePerLevels: 2,
    };
    expect(bonusDiceSpec(sneak, null, 1)).toEqual({ count: 1, sides: 6, bonus: 0 });
    expect(bonusDiceSpec(sneak, null, 9)).toEqual({ count: 5, sides: 6, bonus: 0 });
    expect(bonusDiceSpec(sneak, null, 19)).toEqual({ count: 10, sides: 6, bonus: 0 });
  });

  it('upcasts Divine Smite +1d8 per slot above base', () => {
    const smite: SignatureAbility = {
      id: 'ds', name: 'Divine Smite', kind: 'strike', cooldownSec: 5, damageMult: 1,
      spellTier: 1, bonusDice: { count: 2, sides: 8, bonus: 0 }, dicePerSlotAbove: 1,
    };
    expect(bonusDiceSpec(smite, 1, 5)).toEqual({ count: 2, sides: 8, bonus: 0 });
    expect(bonusDiceSpec(smite, 3, 5)).toEqual({ count: 4, sides: 8, bonus: 0 });
  });

  it('returns undefined without bonusDice (plain attack / dice spell)', () => {
    const plain: SignatureAbility = { id: 'p', name: 'Strike', kind: 'strike', cooldownSec: 4, damageMult: 1 };
    expect(bonusDiceSpec(plain, null, 5)).toBeUndefined();
  });
});

describe('concentration buff rider (Hunter\'s Mark / Hex, ADR 0036)', () => {
  it('ranger / warlock get a passive +1d6 rider; martial fighter does not', () => {
    const mk = (klass: 'ranger' | 'warlock' | 'fighter') =>
      deriveCombatProfile({
        name: 'X', level: 6, klass,
        primary: baseStatsFor('human', klass, 6),
        equipment: {}, progression: EMPTY_PROGRESSION,
      });
    expect(mk('ranger').weaponRiderDice).toEqual({ count: 1, sides: 6, bonus: 0 });
    expect(mk('warlock').weaponRiderDice).toEqual({ count: 1, sides: 6, bonus: 0 });
    expect(mk('fighter').weaponRiderDice).toBeUndefined();
  });

  it('rider adds damage to every hit vs the same seed without it', () => {
    const target: CombatActor = {
      name: 'D', maxHealth: 9999, attackPower: 1, swingInterval: 3, critChance: 0,
      critMultiplier: 2, armor: 0, lifesteal: 0, shield: 0, armorClass: 1, signatureAbilities: [],
    };
    const base = caster({ attackPower: 10, attackBonus: 8, attackDie: 8 });
    const withRider: CombatActor = { ...base, weaponRiderDice: { count: 1, sides: 6, bonus: 0 } };
    let withSum = 0;
    let withoutSum = 0;
    for (let s = 0; s < 200; s++) {
      withSum += resolveAttack(withRider, target, new SeededRng(s)).amount;
      withoutSum += resolveAttack(base, target, new SeededRng(s)).amount;
    }
    expect(withSum).toBeGreaterThan(withoutSum);
  });
});

describe('resolveAttack — bonusDice + advantage wiring', () => {
  const target: CombatActor = {
    name: 'Dummy', maxHealth: 1000, attackPower: 1, swingInterval: 3, critChance: 0,
    critMultiplier: 2, armor: 0, lifesteal: 0, shield: 0, armorClass: 1, signatureAbilities: [],
  };
  const attacker = caster({ attackPower: 10, attackBonus: 8, attackDie: 8 });

  it('bonusDice increases damage vs the same seed without it', () => {
    const seed = 11;
    const withBonus = resolveAttack(attacker, target, new SeededRng(seed), {
      bonusDice: { count: 4, sides: 8, bonus: 0 },
    });
    const without = resolveAttack(attacker, target, new SeededRng(seed), {});
    expect(withBonus.hit).toBe(true);
    expect(without.hit).toBe(true);
    expect(withBonus.amount).toBeGreaterThan(without.amount);
    expect(withBonus.damageNotation).toContain('+ 4d8');
  });

  it('advantage never produces a worse hit chance over many seeds', () => {
    const tough: CombatActor = { ...target, armorClass: 18 };
    let advHits = 0;
    let normHits = 0;
    for (let s = 0; s < 300; s++) {
      if (resolveAttack(attacker, tough, new SeededRng(s), { advantage: 'advantage' }).hit) advHits++;
      if (resolveAttack(attacker, tough, new SeededRng(s), {}).hit) normHits++;
    }
    expect(advHits).toBeGreaterThan(normHits);
  });
});
