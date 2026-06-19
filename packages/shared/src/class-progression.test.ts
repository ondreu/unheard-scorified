import { describe, it, expect } from 'vitest';
import { classProgression, classProgressionAt } from './class-progression';
import { buildLevelTrack } from './level-track';
import { basicAttackDiceCount, cantripDiceMultiplier, bonusDiceSpec } from './combat';
import { CLASS_BASELINE_ABILITIES } from './data/abilities';
import { kiPointsFor, rageChargesFor, rageDamageBonus } from './data/class-resources';
import type { ClassId } from './data/classes';

const ALL: ClassId[] = [
  'barbarian', 'bard', 'cleric', 'druid', 'fighter', 'monk',
  'paladin', 'ranger', 'rogue', 'sorcerer', 'warlock', 'wizard',
];

describe('classProgression', () => {
  it('vrací jen levely 1–20 a id jsou v rámci classy unikátní', () => {
    for (const klass of ALL) {
      const ms = classProgression(klass);
      expect(ms.every((m) => m.level >= 1 && m.level <= 20)).toBe(true);
      expect(new Set(ms.map((m) => m.id)).size).toBe(ms.length);
      // Seřazeno vzestupně dle levelu.
      const levels = ms.map((m) => m.level);
      expect(levels).toEqual([...levels].sort((a, b) => a - b));
    }
  });

  it('martial dostane Extra Attack na 5/11/20 (odvozeno z basicAttackDiceCount)', () => {
    const fighter = classProgression('fighter');
    const ea = fighter.filter((m) => m.name.includes('Extra Attack')).map((m) => m.level);
    expect(ea).toEqual([5, 11, 20]);
    // Magnituda v popisu sedí na engine.
    const at5 = classProgressionAt('fighter', 5).find((m) => m.name === 'Extra Attack');
    expect(at5?.description).toContain(String(basicAttackDiceCount(5, false)));
  });

  it('full/pact caster dostane Improved Cantrips na 5/11/17 (ne Extra Attack)', () => {
    const wiz = classProgression('wizard');
    const cantrip = wiz.filter((m) => m.name === 'Improved Cantrips').map((m) => m.level);
    expect(cantrip).toEqual([5, 11, 17]);
    expect(wiz.some((m) => m.name.includes('Extra Attack'))).toBe(false);
    const at11 = classProgressionAt('wizard', 11).find((m) => m.name === 'Improved Cantrips');
    expect(at11?.description).toContain(String(cantripDiceMultiplier(11)));
    // Warlock je pact → caster větev.
    expect(classProgression('warlock').some((m) => m.name === 'Improved Cantrips')).toBe(true);
  });

  it('half-caster (paladin/ranger) je martial větev → Extra Attack', () => {
    for (const klass of ['paladin', 'ranger'] as ClassId[]) {
      expect(classProgression(klass).some((m) => m.name.includes('Extra Attack'))).toBe(true);
      expect(classProgression(klass).some((m) => m.name === 'Improved Cantrips')).toBe(false);
    }
  });

  it('Barbarian Rage: uses i damage škálují přesně dle class-resources', () => {
    const barb = classProgression('barbarian');
    expect(barb.some((m) => m.id === 'prog_rage@1')).toBe(true);
    // Uses rostou tam, kde rageChargesFor vzroste.
    const useLevels = barb.filter((m) => m.id.startsWith('prog_rage_uses@')).map((m) => m.level);
    const expectedUses: number[] = [];
    for (let l = 2; l <= 20; l++) if (rageChargesFor('barbarian', l) > rageChargesFor('barbarian', l - 1)) expectedUses.push(l);
    expect(useLevels).toEqual(expectedUses);
    // Damage bonus roste na 9/16.
    const dmgLevels = barb.filter((m) => m.id.startsWith('prog_rage_dmg@')).map((m) => m.level);
    const expectedDmg: number[] = [];
    for (let l = 2; l <= 20; l++) if (rageDamageBonus(l) > rageDamageBonus(l - 1)) expectedDmg.push(l);
    expect(dmgLevels).toEqual(expectedDmg);
  });

  it('Monk Ki je na lvl 1 a popis sedí na kiPointsFor', () => {
    const ki = classProgressionAt('monk', 1).find((m) => m.id === 'prog_ki@1');
    expect(ki).toBeDefined();
    expect(ki?.description).toContain(String(kiPointsFor('monk', 1)));
  });

  it('Rogue Sneak Attack scaling sedí na bonusDiceSpec enginu', () => {
    const rogue = classProgression('rogue');
    const sneak = CLASS_BASELINE_ABILITIES.rogue.find((a) => a.bonusDicePerLevels);
    expect(sneak).toBeDefined();
    // Pro každý scaling milestone musí počet kostek v popisu odpovídat enginu.
    for (const m of rogue.filter((x) => x.id.startsWith(`prog_${sneak!.id}_scale@`))) {
      const engineDice = bonusDiceSpec(sneak as never, null, m.level)!;
      expect(m.description).toContain(`${engineDice.count}d${engineDice.sides}`);
    }
    // Na lvl 19 = 10d6 (D&D Sneak Attack cap).
    const at19 = rogue.find((m) => m.id === `prog_${sneak!.id}_scale@19`);
    expect(at19?.description).toContain('10d6');
  });

  it('level track přebírá classFeatures přesně na jejich levelu', () => {
    const track = buildLevelTrack('barbarian', null, 20);
    const onTrack = track.entries.flatMap((e) => e.classFeatures.map((f) => f.id));
    const fromProgression = classProgression('barbarian').map((m) => m.id);
    expect(new Set(onTrack)).toEqual(new Set(fromProgression));
    // Rage na lvl 1 je v entry levelu 1.
    expect(track.entries[0]!.classFeatures.some((f) => f.id === 'prog_rage@1')).toBe(true);
    // Extra Attack na lvl 5.
    expect(track.entries[4]!.classFeatures.some((f) => f.name === 'Extra Attack')).toBe(true);
  });
});
