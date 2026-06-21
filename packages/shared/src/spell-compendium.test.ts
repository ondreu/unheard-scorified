import { describe, expect, it } from 'vitest';
import { allCompendiumSpells, spellTierLabel } from './spell-compendium';
import { buildSpellCard } from './spell-card';

describe('spellTierLabel', () => {
  it('labels cantrips, tiers and the tier-less draft pool', () => {
    expect(spellTierLabel(0)).toBe('Cantrip');
    expect(spellTierLabel(3)).toBe('Tier 3');
    expect(spellTierLabel(undefined)).toBe('Gauntlet draft');
  });
});

describe('allCompendiumSpells', () => {
  const spells = allCompendiumSpells();

  it('only contains spells — tiered class spells or Gauntlet-draft spells', () => {
    expect(spells.length).toBeGreaterThan(0);
    for (const s of spells) {
      // Buď má platný spell tier (class kit), nebo je to tier-less draft kouzlo.
      const tiered = s.spellTier != null && s.spellTier >= 0 && s.spellTier <= 9;
      expect(tiered || s.gauntletDraft).toBe(true);
      if (s.spellTier != null) expect(s.ability.spellTier).toBe(s.spellTier);
    }
  });

  it('excludes martial techniques (no spell tier, not in the draft pool)', () => {
    const names = spells.map((s) => s.name);
    expect(names).not.toContain('Weapon Strike');
    expect(names).not.toContain('Sneak Attack');
    expect(names).not.toContain('Action Surge');
  });

  it('is deduplicated by name and sorted by tier (tier-less last) then name', () => {
    const names = spells.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
    const key = (t: number | undefined): number => t ?? 99;
    const sorted = [...spells].sort(
      (a, b) => key(a.spellTier) - key(b.spellTier) || a.name.localeCompare(b.name),
    );
    expect(spells).toEqual(sorted);
  });

  it('merges same-named spells across classes', () => {
    const fireball = spells.find((s) => s.name === 'Fireball');
    expect(fireball).toBeDefined();
    expect(fireball!.classes).toEqual(expect.arrayContaining(['sorcerer', 'wizard']));
    expect(fireball!.classNames.length).toBe(fireball!.classes.length);
    // Fireball je i v Gauntlet draft poolu.
    expect(fireball!.gauntletDraft).toBe(true);
  });

  it('includes Gauntlet draft-only spells (no class) and flags them', () => {
    // Flame Blade je jen v draft poolu — žádná třída ho v kitu nemá.
    const fb = spells.find((s) => s.name === 'Flame Blade');
    expect(fb).toBeDefined();
    expect(fb!.classes).toEqual([]);
    expect(fb!.gauntletDraft).toBe(true);
    // …a je tier-less → patří do „Gauntlet draft" grupy.
    expect(fb!.spellTier).toBeUndefined();
  });

  it('class-only spells are not flagged as draft', () => {
    const cure = spells.find((s) => s.name === 'Cure Wounds');
    expect(cure).toBeDefined();
    expect(cure!.classes.length).toBeGreaterThan(0);
    expect(cure!.gauntletDraft).toBe(false);
  });

  it('surfaces cantrips, save and condition metadata', () => {
    expect(spells.some((s) => s.isCantrip)).toBe(true);
    expect(spells.some((s) => s.saveAbility)).toBe(true);
    expect(spells.some((s) => s.condition)).toBe(true);
  });

  it('every entry renders a spell card matching its name (no engine drift)', () => {
    for (const s of spells) {
      const card = buildSpellCard(s.ability);
      expect(card.name).toBe(s.name);
    }
  });
});
