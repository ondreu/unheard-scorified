/**
 * D&D feat katalog (MR-2, nahrazuje WoW talenty). Feat = volba při level-upu
 * (alternativa k ASI). Efekty recyklují combat-tag mechaniku z `combat.ts`
 * (`COMBAT_TAG_EFFECTS`) + štíty (`SHIELD_TAGS`) — jediný zdroj pravdy pro „jak
 * volba mění postavu". Homebrew výběr inspirovaný D&D 5e featy.
 */
import type { AbilityScore } from '../character';

export type FeatId =
  | 'great_weapon_master'
  | 'sharpshooter'
  | 'savage_attacker'
  | 'tough'
  | 'dual_wielder'
  | 'lucky'
  | 'spell_sniper'
  | 'defensive_duelist'
  | 'athlete'
  | 'resilient'
  | 'war_caster'
  | 'mage_slayer'
  | 'blood_drinker';

export interface FeatEffect {
  /** Flat bonus k atributu (jako poloviční ASI). */
  statBonus?: Partial<Record<AbilityScore, number>>;
  /** Flat HP bonus. */
  healthBonus?: number;
  /** Combat tagy (mapují se na `COMBAT_TAG_EFFECTS`/`SHIELD_TAGS` v enginu). */
  combatTags?: { tag: string; ranks: number }[];
}

export interface FeatDef {
  id: FeatId;
  name: string;
  description: string;
  effect: FeatEffect;
}

export const FEATS: Record<FeatId, FeatDef> = {
  great_weapon_master: {
    id: 'great_weapon_master',
    name: 'Great Weapon Master',
    description: 'Heavy swings hit harder. +Damage.',
    effect: { combatTags: [{ tag: 'dmg_major', ranks: 3 }] },
  },
  sharpshooter: {
    id: 'sharpshooter',
    name: 'Sharpshooter',
    description: 'Precise ranged attacks ignore the odds. +Crit, +Damage.',
    effect: { combatTags: [{ tag: 'crit_minor', ranks: 3 }, { tag: 'dmg_minor', ranks: 2 }] },
  },
  savage_attacker: {
    id: 'savage_attacker',
    name: 'Savage Attacker',
    description: 'You wring the most damage from every blow. +Damage.',
    effect: { combatTags: [{ tag: 'dmg_minor', ranks: 4 }] },
  },
  tough: {
    id: 'tough',
    name: 'Tough',
    description: 'Hardier than most. +Health.',
    effect: { healthBonus: 40, combatTags: [{ tag: 'hp_minor', ranks: 3 }] },
  },
  dual_wielder: {
    id: 'dual_wielder',
    name: 'Dual Wielder',
    description: 'A blade in each hand. +Attack speed.',
    effect: { combatTags: [{ tag: 'haste_minor', ranks: 3 }] },
  },
  lucky: {
    id: 'lucky',
    name: 'Lucky',
    description: 'Fortune favors you. +Crit.',
    effect: { combatTags: [{ tag: 'crit_minor', ranks: 4 }] },
  },
  spell_sniper: {
    id: 'spell_sniper',
    name: 'Spell Sniper',
    description: 'Your spells find the mark. +Crit, +Damage.',
    effect: { combatTags: [{ tag: 'crit_minor', ranks: 2 }, { tag: 'dmg_minor', ranks: 2 }] },
  },
  defensive_duelist: {
    id: 'defensive_duelist',
    name: 'Defensive Duelist',
    description: 'Parry incoming blows. Absorb shield.',
    effect: { combatTags: [{ tag: 'shield_minor', ranks: 2 }] },
  },
  athlete: {
    id: 'athlete',
    name: 'Athlete',
    description: 'Peak physical conditioning. +1 STR or DEX.',
    effect: { statBonus: { strength: 1 } },
  },
  resilient: {
    id: 'resilient',
    name: 'Resilient (Constitution)',
    description: 'Tougher constitution. +1 CON, +Health.',
    effect: { statBonus: { constitution: 1 }, healthBonus: 20 },
  },
  war_caster: {
    id: 'war_caster',
    name: 'War Caster',
    description: 'Cast amid the fray. +Damage, absorb shield.',
    effect: { combatTags: [{ tag: 'dmg_minor', ranks: 2 }, { tag: 'shield_minor', ranks: 1 }] },
  },
  mage_slayer: {
    id: 'mage_slayer',
    name: 'Mage Slayer',
    description: 'Punish casters with relentless strikes. +Attack speed, +Damage.',
    effect: { combatTags: [{ tag: 'haste_minor', ranks: 2 }, { tag: 'dmg_minor', ranks: 1 }] },
  },
  blood_drinker: {
    id: 'blood_drinker',
    name: 'Blood Drinker',
    description: 'Your strikes leech vitality. Lifesteal.',
    effect: { combatTags: [{ tag: 'lifesteal_minor', ranks: 3 }] },
  },
};

export const FEAT_IDS = Object.keys(FEATS) as FeatId[];

export function isFeatId(value: string): value is FeatId {
  return value in FEATS;
}
