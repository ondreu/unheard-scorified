import { describe, expect, it } from 'vitest';
import {
  FEATS,
  featsForClass,
  isFeatForClass,
  isHalfFeat,
  meetsFeatPrerequisites,
  isValidFeatAbilityChoice,
  featPrerequisiteLabel,
} from './feats';
import { COMBAT_TAG_EFFECTS } from '../combat';
import { SHIELD_TAGS } from './abilities';

describe('feat roster integrita', () => {
  it('všechny combat tagy featů existují v enginu (COMBAT_TAG_EFFECTS / SHIELD_TAGS)', () => {
    for (const feat of Object.values(FEATS)) {
      for (const { tag } of feat.effect.combatTags ?? []) {
        const known = tag in COMBAT_TAG_EFFECTS || tag in SHIELD_TAGS;
        expect(known, `tag ${tag} z featu ${feat.id} musí být známý enginu`).toBe(true);
      }
    }
  });

  it('half-featy mají statChoice s neprázdnými options', () => {
    for (const feat of Object.values(FEATS)) {
      if (isHalfFeat(feat)) {
        expect(feat.effect.statChoice!.options.length).toBeGreaterThan(0);
        expect(feat.effect.statChoice!.amount).toBeGreaterThan(0);
      }
    }
  });
});

describe('featsForClass (filtrování dle classy)', () => {
  it('univerzální featy vidí každá classa', () => {
    expect(featsForClass('wizard').some((f) => f.id === 'tough')).toBe(true);
    expect(featsForClass('barbarian').some((f) => f.id === 'tough')).toBe(true);
  });

  it('martial feat (Great Weapon Master) nevidí wizard, vidí ho fighter', () => {
    expect(featsForClass('fighter').some((f) => f.id === 'great_weapon_master')).toBe(true);
    expect(featsForClass('wizard').some((f) => f.id === 'great_weapon_master')).toBe(false);
    expect(isFeatForClass(FEATS.great_weapon_master, 'wizard')).toBe(false);
  });

  it('caster feat (War Caster) vidí wizard, nevidí barbarian', () => {
    expect(featsForClass('wizard').some((f) => f.id === 'war_caster')).toBe(true);
    expect(featsForClass('barbarian').some((f) => f.id === 'war_caster')).toBe(false);
  });
});

describe('meetsFeatPrerequisites', () => {
  const caster = { isCaster: true };
  const martial = { isCaster: false };

  it('feat bez prereku splní každý', () => {
    expect(meetsFeatPrerequisites(FEATS.tough, { level: 1, scores: {}, ...martial })).toBe(true);
  });

  it('atributový prerek: Great Weapon Master vyžaduje STR 13', () => {
    expect(
      meetsFeatPrerequisites(FEATS.great_weapon_master, { level: 4, scores: { strength: 12 }, ...martial }),
    ).toBe(false);
    expect(
      meetsFeatPrerequisites(FEATS.great_weapon_master, { level: 4, scores: { strength: 13 }, ...martial }),
    ).toBe(true);
  });

  it('caster prerek: War Caster vyžaduje sesilatele', () => {
    expect(meetsFeatPrerequisites(FEATS.war_caster, { level: 4, scores: {}, ...martial })).toBe(false);
    expect(meetsFeatPrerequisites(FEATS.war_caster, { level: 4, scores: {}, ...caster })).toBe(true);
  });

  it('prereq label je čitelný', () => {
    expect(featPrerequisiteLabel(FEATS.great_weapon_master)).toContain('STR 13');
    expect(featPrerequisiteLabel(FEATS.war_caster)).toContain('Spellcaster');
    expect(featPrerequisiteLabel(FEATS.tough)).toBe('');
  });
});

describe('isValidFeatAbilityChoice (half-featy)', () => {
  it('ne-half-feat ignoruje abilityChoice', () => {
    expect(isValidFeatAbilityChoice(FEATS.tough, undefined)).toBe(true);
    expect(isValidFeatAbilityChoice(FEATS.tough, 'strength')).toBe(true);
  });

  it('half-feat vyžaduje atribut z nabídky', () => {
    expect(isValidFeatAbilityChoice(FEATS.athlete, undefined)).toBe(false);
    expect(isValidFeatAbilityChoice(FEATS.athlete, 'strength')).toBe(true);
    expect(isValidFeatAbilityChoice(FEATS.athlete, 'intelligence')).toBe(false);
  });
});
