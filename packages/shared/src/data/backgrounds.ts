/**
 * D&D Backgrounds (MR-3). Background = původ postavy → skill proficiencies + lore.
 * Veřejně viditelný na profilu (inspect). Homebrew výběr z D&D 5e PHB. Statická
 * data = jediný zdroj pravdy pro API i web.
 */

export type BackgroundId =
  | 'acolyte'
  | 'charlatan'
  | 'criminal'
  | 'entertainer'
  | 'folk_hero'
  | 'guild_artisan'
  | 'hermit'
  | 'noble'
  | 'outlander'
  | 'sage'
  | 'sailor'
  | 'soldier';

export interface BackgroundDef {
  id: BackgroundId;
  name: string;
  /** Krátký lore popis (EN = jazyk hry). */
  description: string;
  /** Skill proficiencies, které background dává (D&D 5e). */
  skillProficiencies: string[];
}

export const BACKGROUNDS: Record<BackgroundId, BackgroundDef> = {
  acolyte: {
    id: 'acolyte',
    name: 'Acolyte',
    description: 'You have spent your life in service to a temple, versed in rites and prayer.',
    skillProficiencies: ['Insight', 'Religion'],
  },
  charlatan: {
    id: 'charlatan',
    name: 'Charlatan',
    description: 'You have always had a way with people, bending them to your schemes.',
    skillProficiencies: ['Deception', 'Sleight of Hand'],
  },
  criminal: {
    id: 'criminal',
    name: 'Criminal',
    description: 'You are an experienced criminal with a history of breaking the law.',
    skillProficiencies: ['Deception', 'Stealth'],
  },
  entertainer: {
    id: 'entertainer',
    name: 'Entertainer',
    description: 'You thrive in front of an audience, knowing how to entrance and inspire.',
    skillProficiencies: ['Acrobatics', 'Performance'],
  },
  folk_hero: {
    id: 'folk_hero',
    name: 'Folk Hero',
    description: 'You come from humble origins, but you are destined for so much more.',
    skillProficiencies: ['Animal Handling', 'Survival'],
  },
  guild_artisan: {
    id: 'guild_artisan',
    name: 'Guild Artisan',
    description: 'You are a member of an artisan guild, skilled in a particular craft.',
    skillProficiencies: ['Insight', 'Persuasion'],
  },
  hermit: {
    id: 'hermit',
    name: 'Hermit',
    description: 'You lived in seclusion, seeking a truth hidden from the world.',
    skillProficiencies: ['Medicine', 'Religion'],
  },
  noble: {
    id: 'noble',
    name: 'Noble',
    description: 'You understand wealth, power, and privilege — born to a life of high society.',
    skillProficiencies: ['History', 'Persuasion'],
  },
  outlander: {
    id: 'outlander',
    name: 'Outlander',
    description: 'You grew up in the wilds, far from civilization and its comforts.',
    skillProficiencies: ['Athletics', 'Survival'],
  },
  sage: {
    id: 'sage',
    name: 'Sage',
    description: 'You spent years learning the lore of the multiverse, poring over old tomes.',
    skillProficiencies: ['Arcana', 'History'],
  },
  sailor: {
    id: 'sailor',
    name: 'Sailor',
    description: 'You sailed on a seagoing vessel for years, weathering storms and battle alike.',
    skillProficiencies: ['Athletics', 'Perception'],
  },
  soldier: {
    id: 'soldier',
    name: 'Soldier',
    description: 'War has been your life. You trained, fought, and bled for your cause.',
    skillProficiencies: ['Athletics', 'Intimidation'],
  },
};

export const BACKGROUND_IDS = Object.keys(BACKGROUNDS) as BackgroundId[];

export function isBackgroundId(value: string): value is BackgroundId {
  return value in BACKGROUNDS;
}

/** Maximální délka volné backstory (veřejně na profilu). */
export const BACKSTORY_MAX_LENGTH = 500;
