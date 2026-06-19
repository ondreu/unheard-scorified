import { describe, expect, it } from 'vitest';
import {
  CLASS_FEATURE_GROUPS,
  featureGroupsForClass,
  featureChoiceCount,
  featureSlotUnlockLevel,
  classFeatureSlotsFor,
  findFeatureOption,
} from './class-features';
import { COMBAT_TAG_EFFECTS } from '../combat';
import { SHIELD_TAGS } from './abilities';

describe('class-features data integrita', () => {
  it('všechny tagy voleb zná engine (COMBAT_TAG_EFFECTS / SHIELD_TAGS)', () => {
    for (const g of CLASS_FEATURE_GROUPS) {
      for (const o of g.options) {
        for (const { tag } of o.effect.combatTags ?? []) {
          expect(tag in COMBAT_TAG_EFFECTS || tag in SHIELD_TAGS, `tag ${tag} (${g.id}/${o.id})`).toBe(true);
        }
      }
    }
  });

  it('skupina má aspoň tolik voleb, kolik je max pick v rozvrhu', () => {
    for (const g of CLASS_FEATURE_GROUPS) {
      const maxCount = Math.max(...g.schedule.map((s) => s.count));
      expect(g.options.length, `${g.id}`).toBeGreaterThanOrEqual(maxCount);
    }
  });

  it('option id jsou v rámci skupiny unikátní', () => {
    for (const g of CLASS_FEATURE_GROUPS) {
      const ids = g.options.map((o) => o.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

describe('featureChoiceCount / unlock level', () => {
  const meta = CLASS_FEATURE_GROUPS.find((g) => g.id === 'sorcerer_metamagic')!;

  it('kumulativní počet roste dle rozvrhu', () => {
    expect(featureChoiceCount(meta, 1)).toBe(0);
    expect(featureChoiceCount(meta, 3)).toBe(2);
    expect(featureChoiceCount(meta, 10)).toBe(3);
    expect(featureChoiceCount(meta, 20)).toBe(4);
  });

  it('unlock level n-té volby', () => {
    expect(featureSlotUnlockLevel(meta, 1)).toBe(3);
    expect(featureSlotUnlockLevel(meta, 2)).toBe(3);
    expect(featureSlotUnlockLevel(meta, 3)).toBe(10);
    expect(featureSlotUnlockLevel(meta, 4)).toBe(17);
  });
});

describe('featureGroupsForClass (subclass gating)', () => {
  it('fighter bez subclassi nevidí manévry, s battle_master ano', () => {
    expect(featureGroupsForClass('fighter').some((g) => g.id === 'fighter_maneuvers')).toBe(false);
    expect(
      featureGroupsForClass('fighter', 'battle_master').some((g) => g.id === 'fighter_maneuvers'),
    ).toBe(true);
    // Fighting Style je vždy
    expect(featureGroupsForClass('fighter').some((g) => g.id === 'fighter_fighting_style')).toBe(true);
  });

  it('classa bez class-feature skupin (barbarian) → prázdné', () => {
    expect(featureGroupsForClass('barbarian')).toHaveLength(0);
    expect(classFeatureSlotsFor('barbarian', 20)).toHaveLength(0);
  });
});

describe('findFeatureOption', () => {
  it('najde volbu ve skupině', () => {
    expect(findFeatureOption('fighter_fighting_style', 'archery')?.name).toBe('Archery');
    expect(findFeatureOption('fighter_fighting_style', 'nope')).toBeUndefined();
    expect(findFeatureOption('nope', 'archery')).toBeUndefined();
  });
});
