import { describe, expect, it } from 'vitest';
import {
  ITEMS,
  ARMOR_SLOT_TYPES,
  CLASS_ARMOR_PROFICIENCY,
  canEquipArmor,
  itemArmorClass,
  CLASS_IDS,
  type ArmorClass,
} from '../index';

/** M10 armor types — typ brnění + class proficiency gating. */
describe('armor types', () => {
  it('všechny armor-slot kusy mají přiřazený armorClass', () => {
    for (const item of Object.values(ITEMS)) {
      if (ARMOR_SLOT_TYPES.has(item.slot)) {
        expect(item.armorClass, `${item.id} (${item.slot}) postrádá armorClass`).toBeDefined();
      }
    }
  });

  it('ne-armor kusy (zbraně/šperky/plášť/off-hand) armorClass nemají', () => {
    for (const item of Object.values(ITEMS)) {
      if (!ARMOR_SLOT_TYPES.has(item.slot)) {
        expect(item.armorClass, `${item.id} nemá být typované`).toBeUndefined();
      }
    }
  });

  it('plate classy unesou všechny typy, cloth classy jen cloth', () => {
    expect(CLASS_ARMOR_PROFICIENCY.warrior).toEqual(['cloth', 'leather', 'mail', 'plate']);
    expect(CLASS_ARMOR_PROFICIENCY.mage).toEqual(['cloth']);
    expect(CLASS_ARMOR_PROFICIENCY.priest).toEqual(['cloth']);
    expect(CLASS_ARMOR_PROFICIENCY.warlock).toEqual(['cloth']);
  });

  it('canEquipArmor respektuje proficiency', () => {
    // warlord_plate je plate
    expect(itemArmorClass('warlord_plate')).toBe('plate');
    expect(canEquipArmor('warrior', 'warlord_plate')).toBe(true);
    expect(canEquipArmor('mage', 'warlord_plate')).toBe(false);

    // arcane_robes je cloth → unese kdokoli
    expect(itemArmorClass('arcane_robes')).toBe('cloth');
    expect(canEquipArmor('mage', 'arcane_robes')).toBe(true);
    expect(canEquipArmor('warrior', 'arcane_robes')).toBe(true);
  });

  it('zbraně a šperky může nosit každá classa (žádné armor omezení)', () => {
    for (const klass of CLASS_IDS) {
      expect(canEquipArmor(klass, 'iron_shortsword')).toBe(true); // main_hand
      expect(canEquipArmor(klass, 'adventurer_ring')).toBe(true); // finger
      expect(canEquipArmor(klass, 'initiate_cloak')).toBe(true); // back
    }
  });

  it('každá cloth-only classa má cloth výbavu napříč klíčovými sloty', () => {
    const clothSlots = new Set(
      Object.values(ITEMS)
        .filter((i) => i.armorClass === ('cloth' satisfies ArmorClass))
        .map((i) => i.slot),
    );
    for (const slot of ['head', 'shoulder', 'chest', 'waist', 'legs', 'feet', 'wrist', 'hands']) {
      expect(clothSlots.has(slot as never), `chybí cloth kus pro slot ${slot}`).toBe(true);
    }
  });
});
