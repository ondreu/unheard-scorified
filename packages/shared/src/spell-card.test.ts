import { describe, expect, it } from 'vitest';
import { classSpellCatalog, type SignatureAbility } from './data/abilities';
import { abilityDamageSpec } from './combat';
import { diceRange } from './dice';
import { buildSpellCard } from './spell-card';

/**
 * Kontrakt: spell-card builder nesmí mít vlastní damage matematiku — musí sedět
 * s enginem (`abilityDamageSpec`) a `diceRange`, jinak by se zobrazení rozešlo
 * s reálným combatem (přesně to, čemu má sjednocení zabránit).
 */
const FIREBALL: SignatureAbility = {
  id: 'test_fireball',
  name: 'Fireball',
  kind: 'strike',
  cooldownSec: 9,
  damageMult: 2.2,
  spellTier: 3,
  damageType: 'fire',
  dice: { count: 8, sides: 6, bonus: 0 },
  dicePerSlotAbove: 1,
  save: { ability: 'dexterity', effect: 'half' },
  aoe: true,
};

describe('buildSpellCard', () => {
  it('Fireball: dice/range/type/save/slot/aoe match the catalog', () => {
    const card = buildSpellCard(FIREBALL, { level: 5, spellSaveDc: 15 });

    expect(card.name).toBe('Fireball');
    expect(card.damageType).toBe('fire');
    expect(card.spellTier).toBe(3);
    expect(card.slotCost).toBe(3); // tier 3 spell consumes a 3rd-level slot
    expect(card.isCantrip).toBe(false);
    expect(card.isMartial).toBe(false);
    expect(card.aoe).toBe(true);
    expect(card.upcastPerSlot).toBe(1);

    expect(card.damage?.notation).toBe('8d6');
    expect(card.damage?.range).toBe('8–48');
    expect(card.save).toEqual({ ability: 'dexterity', effect: 'half', dc: 15 });
  });

  it('surfaces the condition rider for UI (Slice 2d)', () => {
    const stun: SignatureAbility = {
      id: 'test_stun', name: 'Stunning Strike', kind: 'strike', cooldownSec: 7, damageMult: 1,
      save: { ability: 'constitution', effect: 'none' }, condition: { type: 'stunned', durationTurns: 1 },
    };
    const card = buildSpellCard(stun, { spellSaveDc: 16 });
    expect(card.condition).toEqual({ type: 'stunned', durationTurns: 1 });
    expect(card.save).toEqual({ ability: 'constitution', effect: 'none', dc: 16 });
    // Ability bez conditiony ji na kartě nemá.
    expect(buildSpellCard(FIREBALL, {}).condition).toBeUndefined();
  });

  it('upcast preview scales damage with the slot tier (engine-derived)', () => {
    const card = buildSpellCard(FIREBALL, { level: 5, slotTier: 5 });
    // tier 5 slot = +2d6 upcast → 10d6
    const expected = abilityDamageSpec(FIREBALL, 5, 5)!;
    expect(card.damage?.notation).toBe('10d6');
    expect(card.damage?.range).toBe(diceRange(expected));
  });

  it('cantrip is free and scales dice with character level (matches engine)', () => {
    const firebolt: SignatureAbility = {
      id: 'test_firebolt',
      name: 'Fire Bolt',
      kind: 'strike',
      cooldownSec: 0,
      damageMult: 1,
      spellTier: 0,
      damageType: 'fire',
      dice: { count: 1, sides: 10, bonus: 0 },
    };
    const low = buildSpellCard(firebolt, { level: 1 });
    const high = buildSpellCard(firebolt, { level: 17 });
    expect(low.isCantrip).toBe(true);
    expect(low.slotCost).toBeUndefined(); // cantrip = free
    expect(low.damage?.notation).toBe('1d10');
    expect(high.damage?.notation).toBe('4d10'); // 4× dice at level 17
  });

  it('martial technique has no spell tier / slot cost', () => {
    const sneak: SignatureAbility = {
      id: 'test_sneak',
      name: 'Sneak Attack',
      kind: 'strike',
      cooldownSec: 0,
      damageMult: 1,
      bonusDice: { count: 1, sides: 6, bonus: 0 },
      bonusDicePerLevels: 2,
    };
    const card = buildSpellCard(sneak, { level: 10 });
    expect(card.isMartial).toBe(true);
    expect(card.slotCost).toBeUndefined();
    expect(card.damage).toBeUndefined(); // no literal dice; scales via attackPower
    expect(card.bonusDamage?.notation).toBe('5d6'); // ceil(10/2) = 5 dice
  });

  it('real catalog Fireball (wizard) builds a consistent card', () => {
    const fireball = classSpellCatalog('wizard').find((a) => a.name === 'Fireball');
    expect(fireball).toBeDefined();
    const card = buildSpellCard(fireball!, { level: 9, spellSaveDc: 16 });
    expect(card.slotCost).toBe(3);
    expect(card.damage?.notation).toBe('8d6');
    expect(card.save?.dc).toBe(16);
  });
});
