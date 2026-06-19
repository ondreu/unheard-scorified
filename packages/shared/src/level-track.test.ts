import { describe, it, expect } from 'vitest';
import { buildLevelTrack } from './level-track';
import { CLASSES } from './data/classes';
import { proficiencyBonus, dndMaxHp } from './character';
import { spellSlotsFor } from './data/spell-slots';

describe('buildLevelTrack', () => {
  it('vždy vrátí 20 záznamů (level 1..20)', () => {
    const track = buildLevelTrack('fighter', null, 5);
    expect(track.entries).toHaveLength(20);
    expect(track.entries.map((e) => e.level)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
    ]);
  });

  it('označí dosažené levely podle currentLevel', () => {
    const track = buildLevelTrack('wizard', null, 7);
    expect(track.entries.filter((e) => e.reached).map((e) => e.level)).toEqual([
      1, 2, 3, 4, 5, 6, 7,
    ]);
    expect(track.entries.find((e) => e.level === 8)?.reached).toBe(false);
  });

  it('HP gain a totalHp sedí na D&D hit dice', () => {
    const conMod = 2;
    const track = buildLevelTrack('barbarian', null, 20, conMod);
    const hitDie = CLASSES.barbarian.hitDie; // d12
    const lvl1 = track.entries[0]!;
    expect(lvl1.hpGain).toBe(dndMaxHp(hitDie, 1, conMod));
    expect(lvl1.totalHp).toBe(dndMaxHp(hitDie, 1, conMod));
    const lvl2 = track.entries[1]!;
    expect(lvl2.hpGain).toBe(dndMaxHp(hitDie, 2, conMod) - dndMaxHp(hitDie, 1, conMod));
    // Suma přírůstků = celkové HP na capu.
    const sumGains = track.entries.reduce((s, e) => s + e.hpGain, 0);
    expect(sumGains).toBe(dndMaxHp(hitDie, 20, conMod));
  });

  it('proficiency bonus roste na 5/9/13/17', () => {
    const track = buildLevelTrack('rogue', null, 20);
    const increased = track.entries.filter((e) => e.proficiencyIncreased).map((e) => e.level);
    expect(increased).toEqual([5, 9, 13, 17]);
    expect(track.entries.find((e) => e.level === 5)?.proficiencyBonus).toBe(proficiencyBonus(5));
  });

  it('full caster dostane 1. tier slot už na lvl 1', () => {
    const track = buildLevelTrack('wizard', null, 3);
    const lvl1 = track.entries[0]!;
    expect(lvl1.newSpellSlots).toContainEqual({ tier: 1, gained: 2, total: 2 });
    // lvl 3 odemkne 2. tier.
    const lvl3 = track.entries[2]!;
    expect(lvl3.newSpellSlots.some((s) => s.tier === 2)).toBe(true);
  });

  it('martial classa nemá spell sloty ani nová kouzla', () => {
    const track = buildLevelTrack('fighter', null, 20);
    expect(track.casterType).toBe('none');
    expect(track.entries.every((e) => e.newSpellSlots.length === 0)).toBe(true);
    expect(track.entries.every((e) => e.newSpells.length === 0)).toBe(true);
    // Slot suma odpovídá prázdné tabulce.
    expect(spellSlotsFor('fighter', 20)).toEqual({});
  });

  it('milníkové volby: subclass na subclassLevel, ASI/Feat na 4/8/12/16/19', () => {
    const track = buildLevelTrack('fighter', null, 20);
    const subLevel = CLASSES.fighter.subclassLevel; // 3
    expect(track.entries.find((e) => e.level === subLevel)?.choices).toContain('subclass');
    const asiLevels = track.entries
      .filter((e) => e.choices.includes('asi_or_feat'))
      .map((e) => e.level);
    expect(asiLevels).toEqual([4, 8, 12, 16, 19]);
  });

  it('subclass signature feature se objeví na svém unlock levelu, jen když je subclass zvolená', () => {
    const withSub = buildLevelTrack('fighter', 'champion', 20);
    const hasFeature = withSub.entries.some((e) =>
      e.newFeatures.some((f) => f.id === 'champion_heroic_surge'),
    );
    expect(hasFeature).toBe(true);
    expect(withSub.subclassName).toBe('Champion');

    const withoutSub = buildLevelTrack('fighter', null, 20);
    expect(
      withoutSub.entries.some((e) => e.newFeatures.some((f) => f.id === 'champion_heroic_surge')),
    ).toBe(false);
  });

  it('každý odemčený spell se na track objeví právě jednou', () => {
    const track = buildLevelTrack('wizard', 'school_of_evocation', 20);
    const ids = track.entries.flatMap((e) => e.newSpells.map((s) => s.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});
