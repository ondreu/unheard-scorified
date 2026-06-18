/**
 * Definice vanilla-style ras. Frakce je zatím jen kosmetická (atribut rasy),
 * ne herní dělení — viz docs/adr/0003. Statická data = jediný zdroj pravdy.
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

export type Faction = 'alliance' | 'horde';

export interface RaceDef {
  id: RaceId;
  name: string;
  faction: Faction;
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
    faction: 'alliance',
    statMods: { strength: 0, dexterity: 0, constitution: 0, intelligence: 0, wisdom: 1, charisma: 1 },
    allowedClasses: ALL_CLASSES,
  },
  dwarf: {
    id: 'dwarf',
    name: 'Dwarf',
    faction: 'alliance',
    statMods: { strength: 2, dexterity: -1, constitution: 1, intelligence: -1, wisdom: -1, charisma: 0 },
    allowedClasses: ALL_CLASSES,
  },
  nightelf: {
    id: 'nightelf',
    name: 'Night Elf',
    faction: 'alliance',
    statMods: { strength: -1, dexterity: 3, constitution: 0, intelligence: 0, wisdom: 0, charisma: 0 },
    allowedClasses: ALL_CLASSES,
  },
  gnome: {
    id: 'gnome',
    name: 'Gnome',
    faction: 'alliance',
    statMods: { strength: -2, dexterity: 1, constitution: -1, intelligence: 3, wisdom: -1, charisma: 0 },
    allowedClasses: ALL_CLASSES,
  },
  orc: {
    id: 'orc',
    name: 'Orc',
    faction: 'horde',
    statMods: { strength: 3, dexterity: -1, constitution: 1, intelligence: -2, wisdom: 1, charisma: -1 },
    allowedClasses: ALL_CLASSES,
  },
  tauren: {
    id: 'tauren',
    name: 'Tauren',
    faction: 'horde',
    statMods: { strength: 4, dexterity: -2, constitution: 1, intelligence: -3, wisdom: 1, charisma: -1 },
    allowedClasses: ALL_CLASSES,
  },
  troll: {
    id: 'troll',
    name: 'Troll',
    faction: 'horde',
    statMods: { strength: 1, dexterity: 2, constitution: 0, intelligence: -2, wisdom: -1, charisma: 0 },
    allowedClasses: ALL_CLASSES,
  },
  undead: {
    id: 'undead',
    name: 'Undead',
    faction: 'horde',
    statMods: { strength: -1, dexterity: 0, constitution: 0, intelligence: -1, wisdom: 3, charisma: -1 },
    allowedClasses: ALL_CLASSES,
  },
};

export const RACE_IDS = Object.keys(RACES) as RaceId[];

export function isRaceId(value: string): value is RaceId {
  return value in RACES;
}
