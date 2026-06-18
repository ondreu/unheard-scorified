/**
 * Definice ras (D&D 5e PHB). Statická data = jediný zdroj pravdy.
 *
 * MR (deWoWčení / PHB rasy): WoW sada (8 ras) nahrazena 9 D&D PHB rasami s
 * narovnanými **ability score bonusy +2/+1** a **rasovými schopnostmi** (traits).
 * Frakce už neexistují (předchozí přírůstek). Bonusy se aplikují na atributy v
 * `character.ts` (`statMods`), traits jsou zatím popisné (UI; mechanická
 * integrace do combat enginu = follow-up, balanc čísel = MR-10).
 *
 * Mapování starých WoW race id → nové (data migrace `0039`):
 *   human→human, dwarf→dwarf, gnome→gnome, nightelf→elf, orc→half_orc,
 *   tauren→dragonborn, troll→half_elf, undead→tiefling.
 */
import type { AbilityScores } from '../character';
import { CLASS_IDS, type ClassId } from './classes';

export type RaceId =
  | 'human'
  | 'elf'
  | 'dwarf'
  | 'halfling'
  | 'gnome'
  | 'half_elf'
  | 'half_orc'
  | 'tiefling'
  | 'dragonborn';

/** Rasová schopnost (popisná; mechanická integrace = follow-up). */
export interface RaceTrait {
  name: string;
  description: string;
}

export interface RaceDef {
  id: RaceId;
  name: string;
  /** Krátký flavor popis (anglicky — game language = EN). */
  description: string;
  /** D&D ability score bonusy (+2/+1) přičtené k base atributům (viz character.ts). */
  statMods: AbilityScores;
  /** Rasové schopnosti (PHB traits). */
  traits: RaceTrait[];
  /**
   * Classy dostupné pro tuto rasu. D&D 5e race-class matice je bez omezení —
   * jakákoli rasa smí jakoukoli třídu. Pole zachováno pro případná pozdější lore
   * omezení; defaultně všechny třídy (`ALL_CLASSES`).
   */
  allowedClasses: ClassId[];
}

/** Všechny třídy — D&D race-class matice je bez omezení. */
const ALL_CLASSES: ClassId[] = [...CLASS_IDS];

/** Pomocník: ability bonusy s nulami pro neuvedené atributy. */
function mods(partial: Partial<AbilityScores>): AbilityScores {
  return {
    strength: partial.strength ?? 0,
    dexterity: partial.dexterity ?? 0,
    constitution: partial.constitution ?? 0,
    intelligence: partial.intelligence ?? 0,
    wisdom: partial.wisdom ?? 0,
    charisma: partial.charisma ?? 0,
  };
}

export const RACES: Record<RaceId, RaceDef> = {
  human: {
    id: 'human',
    name: 'Human',
    description: 'Ambitious and adaptable wanderers found in every corner of the realm.',
    statMods: mods({
      strength: 1,
      dexterity: 1,
      constitution: 1,
      intelligence: 1,
      wisdom: 1,
      charisma: 1,
    }),
    traits: [
      { name: 'Versatile', description: '+1 to all six ability scores.' },
      { name: 'Driven', description: 'Extra resolve to master any path you choose.' },
    ],
    allowedClasses: ALL_CLASSES,
  },
  elf: {
    id: 'elf',
    name: 'Elf',
    description: 'Graceful, long-lived folk with keen senses and an affinity for magic.',
    statMods: mods({ dexterity: 2, intelligence: 1 }),
    traits: [
      { name: 'Darkvision', description: 'See in dim light and darkness within 60 feet.' },
      { name: 'Keen Senses', description: 'Proficiency in Perception.' },
      { name: 'Fey Ancestry', description: 'Advantage against being charmed; magic cannot put you to sleep.' },
      { name: 'Trance', description: 'Meditate 4 hours instead of sleeping 8.' },
    ],
    allowedClasses: ALL_CLASSES,
  },
  dwarf: {
    id: 'dwarf',
    name: 'Dwarf',
    description: 'Stout and hardy mountain folk, steadfast in battle and craft.',
    statMods: mods({ constitution: 2, wisdom: 1 }),
    traits: [
      { name: 'Darkvision', description: 'See in dim light and darkness within 60 feet.' },
      { name: 'Dwarven Resilience', description: 'Advantage on saves against poison; resistance to poison damage.' },
      { name: 'Stonecunning', description: 'Expertise on History checks about stonework.' },
    ],
    allowedClasses: ALL_CLASSES,
  },
  halfling: {
    id: 'halfling',
    name: 'Halfling',
    description: 'Small, nimble and improbably lucky, cheerful even in dire straits.',
    statMods: mods({ dexterity: 2, charisma: 1 }),
    traits: [
      { name: 'Lucky', description: 'Reroll a natural 1 on attacks, ability checks and saves.' },
      { name: 'Brave', description: 'Advantage on saves against being frightened.' },
      { name: 'Halfling Nimbleness', description: 'Move through the space of larger creatures.' },
    ],
    allowedClasses: ALL_CLASSES,
  },
  gnome: {
    id: 'gnome',
    name: 'Gnome',
    description: 'Inventive, curious tinkerers with a spark of arcane brilliance.',
    statMods: mods({ intelligence: 2, constitution: 1 }),
    traits: [
      { name: 'Darkvision', description: 'See in dim light and darkness within 60 feet.' },
      { name: 'Gnome Cunning', description: 'Advantage on INT, WIS and CHA saves against magic.' },
    ],
    allowedClasses: ALL_CLASSES,
  },
  half_elf: {
    id: 'half_elf',
    name: 'Half-Elf',
    description: 'Caught between two worlds, charismatic and versatile in every company.',
    statMods: mods({ charisma: 2, dexterity: 1, constitution: 1 }),
    traits: [
      { name: 'Darkvision', description: 'See in dim light and darkness within 60 feet.' },
      { name: 'Fey Ancestry', description: 'Advantage against being charmed; magic cannot put you to sleep.' },
      { name: 'Skill Versatility', description: 'Proficiency in two skills of your choice.' },
    ],
    allowedClasses: ALL_CLASSES,
  },
  half_orc: {
    id: 'half_orc',
    name: 'Half-Orc',
    description: 'Powerful and fierce, driven by an unbreakable will to endure.',
    statMods: mods({ strength: 2, constitution: 1 }),
    traits: [
      { name: 'Darkvision', description: 'See in dim light and darkness within 60 feet.' },
      { name: 'Relentless Endurance', description: 'Drop to 1 HP instead of 0 once per long rest.' },
      { name: 'Savage Attacks', description: 'Roll an extra weapon die on a melee critical hit.' },
    ],
    allowedClasses: ALL_CLASSES,
  },
  tiefling: {
    id: 'tiefling',
    name: 'Tiefling',
    description: 'Bearers of an infernal bloodline, marked by horns and a flair for the arcane.',
    statMods: mods({ charisma: 2, intelligence: 1 }),
    traits: [
      { name: 'Darkvision', description: 'See in dim light and darkness within 60 feet.' },
      { name: 'Hellish Resistance', description: 'Resistance to fire damage.' },
      { name: 'Infernal Legacy', description: 'Know the thaumaturgy cantrip; learn hellish rebuke at higher levels.' },
    ],
    allowedClasses: ALL_CLASSES,
  },
  dragonborn: {
    id: 'dragonborn',
    name: 'Dragonborn',
    description: 'Proud, draconic warriors who exhale the fury of their ancestry.',
    statMods: mods({ strength: 2, charisma: 1 }),
    traits: [
      { name: 'Draconic Ancestry', description: 'Your lineage determines your breath weapon and resistance.' },
      { name: 'Breath Weapon', description: 'Exhale destructive energy in a line or cone.' },
      { name: 'Damage Resistance', description: 'Resistance to the damage type of your draconic ancestry.' },
    ],
    allowedClasses: ALL_CLASSES,
  },
};

export const RACE_IDS = Object.keys(RACES) as RaceId[];

export function isRaceId(value: string): value is RaceId {
  return value in RACES;
}
