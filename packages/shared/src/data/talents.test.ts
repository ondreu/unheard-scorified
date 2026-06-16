import { describe, expect, it } from 'vitest';
import {
  CLASS_TALENTS,
  COMBAT_TAG_EFFECTS,
  SHIELD_TAGS,
  SIGNATURE_ABILITIES,
  talentPointsForLevel,
  treeCapacity,
  type ClassId,
} from '../index';

const CLASSES = Object.keys(CLASS_TALENTS) as ClassId[];

describe('talent overhaul — tree capacity & 1.75-tree budget', () => {
  it('grants 59 talent points at level 60', () => {
    expect(talentPointsForLevel(60)).toBe(59);
    expect(talentPointsForLevel(1)).toBe(0);
  });

  it('every tree holds ~34 points (so all three cannot be maxed)', () => {
    for (const klass of CLASSES) {
      for (const tree of CLASS_TALENTS[klass]) {
        const cap = treeCapacity(tree);
        expect(cap, `${klass}/${tree.name}`).toBeGreaterThanOrEqual(32);
        expect(cap, `${klass}/${tree.name}`).toBeLessThanOrEqual(36);
      }
    }
  });

  it('59 points fills roughly 1 and 3/4 trees', () => {
    for (const klass of CLASS_TALENTS ? CLASSES : []) {
      const caps = CLASS_TALENTS[klass].map(treeCapacity);
      const avg = caps.reduce((a, b) => a + b, 0) / caps.length;
      const trees = 59 / avg;
      expect(trees, klass).toBeGreaterThan(1.6);
      expect(trees, klass).toBeLessThan(1.9);
    }
  });
});

describe('talent overhaul — structure & no dead talents', () => {
  it('each class has 3 trees with a capstone at tier 28', () => {
    for (const klass of CLASSES) {
      const trees = CLASS_TALENTS[klass];
      expect(trees).toHaveLength(3);
      for (const tree of trees) {
        const last = tree.nodes[tree.nodes.length - 1]!;
        expect(last.tierRequirement, `${klass}/${tree.name} capstone`).toBe(28);
        expect(last.maxRanks).toBe(1);
      }
    }
  });

  it('every combat tag maps to a real effect (no dead talents)', () => {
    for (const klass of CLASSES) {
      for (const tree of CLASS_TALENTS[klass]) {
        for (const node of tree.nodes) {
          for (const tag of node.effect.combatTags ?? []) {
            const known =
              tag in SIGNATURE_ABILITIES || tag in COMBAT_TAG_EFFECTS || tag in SHIELD_TAGS;
            expect(known, `${node.id} → ${tag}`).toBe(true);
          }
        }
      }
    }
  });

  it('every capstone unlocks a real ability', () => {
    for (const klass of CLASSES) {
      for (const tree of CLASS_TALENTS[klass]) {
        const cap = tree.nodes[tree.nodes.length - 1]!;
        const tag = cap.effect.combatTags?.[0] ?? '';
        expect(tag in SIGNATURE_ABILITIES, `${klass}/${tree.name}`).toBe(true);
      }
    }
  });

  it('tier requirements are non-decreasing within a tree', () => {
    for (const klass of CLASSES) {
      for (const tree of CLASS_TALENTS[klass]) {
        for (let i = 1; i < tree.nodes.length; i++) {
          expect(tree.nodes[i]!.tierRequirement).toBeGreaterThanOrEqual(
            tree.nodes[i - 1]!.tierRequirement,
          );
        }
      }
    }
  });
});
