import { describe, expect, it } from 'vitest';
import { allCompendiumSpells, spellTierLabel } from './spell-compendium';
import { buildSpellCard } from './spell-card';

describe('spellTierLabel', () => {
  it('labels cantrips and tiers', () => {
    expect(spellTierLabel(0)).toBe('Cantrip');
    expect(spellTierLabel(3)).toBe('Tier 3');
  });
});

describe('allCompendiumSpells', () => {
  const spells = allCompendiumSpells();

  it('contains only spells (every entry has a spell tier 0..9)', () => {
    expect(spells.length).toBeGreaterThan(0);
    for (const s of spells) {
      expect(s.spellTier).toBeGreaterThanOrEqual(0);
      expect(s.spellTier).toBeLessThanOrEqual(9);
      expect(s.ability.spellTier).toBe(s.spellTier);
    }
  });

  it('excludes martial techniques (no spell tier)', () => {
    // Weapon Strike / Sneak Attack / Action Surge nemají spellTier → nepatří sem.
    const names = spells.map((s) => s.name);
    expect(names).not.toContain('Weapon Strike');
    expect(names).not.toContain('Sneak Attack');
    expect(names).not.toContain('Action Surge');
  });

  it('is deduplicated by name and sorted by tier then name', () => {
    const names = spells.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
    const sorted = [...spells].sort((a, b) => a.spellTier - b.spellTier || a.name.localeCompare(b.name));
    expect(spells).toEqual(sorted);
  });

  it('merges same-named spells across classes', () => {
    const fireball = spells.find((s) => s.name === 'Fireball');
    expect(fireball).toBeDefined();
    // Fireball je v sorcerer i wizard kitu.
    expect(fireball!.classes).toEqual(expect.arrayContaining(['sorcerer', 'wizard']));
    expect(fireball!.classNames.length).toBe(fireball!.classes.length);
  });

  it('surfaces cantrips, save and condition metadata', () => {
    expect(spells.some((s) => s.isCantrip)).toBe(true);
    expect(spells.some((s) => s.saveAbility)).toBe(true);
    expect(spells.some((s) => s.condition)).toBe(true);
  });

  it('every entry renders a spell card (no engine drift)', () => {
    for (const s of spells) {
      const card = buildSpellCard(s.ability);
      expect(card.name).toBe(s.name);
      expect(card.isMartial).toBe(false);
    }
  });
});
