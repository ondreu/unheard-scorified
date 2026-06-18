/**
 * Definice ras. Statická data = jediný zdroj pravdy.
 *
 * MR (deWoWčení): frakce (Alliance/Horda) odstraněny — hra je homebrew D&D
 * setting bez frakčního dělení. Sada ras je zatím ještě WoW-flavored (narovná se
 * na 9 PHB ras v navazujícím přírůstku); tady mizí jen frakce.
 */
import type { AbilityScores } from '../character';
import { CLASS_IDS, type ClassId } from './classes';

export type RaceId =
  | 'human'
  | 'dwarf'
  | 'nightelf'
  | 'gnome'
  | 'orc'
  | 'tauren'
  | 'troll'
  | 'undead';

export interface RaceDef {
  id: RaceId;
  name: string;
  /** Modifikátory k baseline atributů (viz character.ts). */
  statMods: AbilityScores;
  /**
   * Classy dostupné pro tuto rasu. MR-2 (D&D): bez omezení — jakákoli rasa smí
   * jakoukoli třídu (D&D 5e race-class matice). Pole zachováno pro případná
   * pozdější lore omezení; defaultně všechny třídy (`ALL_CLASSES`).
   */
  allowedClasses: ClassId[];
}

/** Všechny třídy — D&D race-class matice je bez omezení (MR-2). */
const ALL_CLASSES: ClassId[] = [...CLASS_IDS];

export const RACES: Record<RaceId, RaceDef> = {
  human: {
    id: 'human',
    name: 'Human',
    statMods: { strength: 0, dexterity: 0, constitution: 0, intelligence: 0, wisdom: 1, charisma: 1 },
    allowedClasses: ALL_CLASSES,
  },
  dwarf: {
    id: 'dwarf',
    name: 'Dwarf',
    statMods: { strength: 2, dexterity: -1, constitution: 1, intelligence: -1, wisdom: -1, charisma: 0 },
    allowedClasses: ALL_CLASSES,
  },
  nightelf: {
    id: 'nightelf',
    name: 'Night Elf',
    statMods: { strength: -1, dexterity: 3, constitution: 0, intelligence: 0, wisdom: 0, charisma: 0 },
    allowedClasses: ALL_CLASSES,
  },
  gnome: {
    id: 'gnome',
    name: 'Gnome',
    statMods: { strength: -2, dexterity: 1, constitution: -1, intelligence: 3, wisdom: -1, charisma: 0 },
    allowedClasses: ALL_CLASSES,
  },
  orc: {
    id: 'orc',
    name: 'Orc',
    statMods: { strength: 3, dexterity: -1, constitution: 1, intelligence: -2, wisdom: 1, charisma: -1 },
    allowedClasses: ALL_CLASSES,
  },
  tauren: {
    id: 'tauren',
    name: 'Tauren',
    statMods: { strength: 4, dexterity: -2, constitution: 1, intelligence: -3, wisdom: 1, charisma: -1 },
    allowedClasses: ALL_CLASSES,
  },
  troll: {
    id: 'troll',
    name: 'Troll',
    statMods: { strength: 1, dexterity: 2, constitution: 0, intelligence: -2, wisdom: -1, charisma: 0 },
    allowedClasses: ALL_CLASSES,
  },
  undead: {
    id: 'undead',
    name: 'Undead',
    statMods: { strength: -1, dexterity: 0, constitution: 0, intelligence: -1, wisdom: 3, charisma: -1 },
    allowedClasses: ALL_CLASSES,
  },
};

export const RACE_IDS = Object.keys(RACES) as RaceId[];

export function isRaceId(value: string): value is RaceId {
  return value in RACES;
}
