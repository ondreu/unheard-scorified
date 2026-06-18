/**
 * Definice vanilla-style ras. Frakce je zatím jen kosmetická (atribut rasy),
 * ne herní dělení — viz docs/adr/0003. Statická data = jediný zdroj pravdy.
 */
import type { AbilityScores } from '../character';
import type { ClassId } from './classes';

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
  /** Classy dostupné pro tuto rasu (vanilla omezení). */
  allowedClasses: ClassId[];
}

export const RACES: Record<RaceId, RaceDef> = {
  human: {
    id: 'human',
    name: 'Human',
    faction: 'alliance',
    statMods: { strength: 0, dexterity: 0, constitution: 0, intelligence: 0, wisdom: 1, charisma: 1 },
    allowedClasses: ['warrior', 'paladin', 'rogue', 'priest', 'mage', 'warlock'],
  },
  dwarf: {
    id: 'dwarf',
    name: 'Dwarf',
    faction: 'alliance',
    statMods: { strength: 2, dexterity: -1, constitution: 1, intelligence: -1, wisdom: -1, charisma: 0 },
    allowedClasses: ['warrior', 'paladin', 'hunter', 'rogue', 'priest'],
  },
  nightelf: {
    id: 'nightelf',
    name: 'Night Elf',
    faction: 'alliance',
    statMods: { strength: -1, dexterity: 3, constitution: 0, intelligence: 0, wisdom: 0, charisma: 0 },
    allowedClasses: ['warrior', 'hunter', 'rogue', 'priest', 'druid'],
  },
  gnome: {
    id: 'gnome',
    name: 'Gnome',
    faction: 'alliance',
    statMods: { strength: -2, dexterity: 1, constitution: -1, intelligence: 3, wisdom: -1, charisma: 0 },
    allowedClasses: ['warrior', 'rogue', 'mage', 'warlock'],
  },
  orc: {
    id: 'orc',
    name: 'Orc',
    faction: 'horde',
    statMods: { strength: 3, dexterity: -1, constitution: 1, intelligence: -2, wisdom: 1, charisma: -1 },
    allowedClasses: ['warrior', 'hunter', 'rogue', 'shaman', 'warlock'],
  },
  tauren: {
    id: 'tauren',
    name: 'Tauren',
    faction: 'horde',
    statMods: { strength: 4, dexterity: -2, constitution: 1, intelligence: -3, wisdom: 1, charisma: -1 },
    allowedClasses: ['warrior', 'hunter', 'shaman', 'druid'],
  },
  troll: {
    id: 'troll',
    name: 'Troll',
    faction: 'horde',
    statMods: { strength: 1, dexterity: 2, constitution: 0, intelligence: -2, wisdom: -1, charisma: 0 },
    allowedClasses: ['warrior', 'hunter', 'rogue', 'priest', 'shaman', 'mage'],
  },
  undead: {
    id: 'undead',
    name: 'Undead',
    faction: 'horde',
    statMods: { strength: -1, dexterity: 0, constitution: 0, intelligence: -1, wisdom: 3, charisma: -1 },
    allowedClasses: ['warrior', 'rogue', 'priest', 'mage', 'warlock'],
  },
};

export const RACE_IDS = Object.keys(RACES) as RaceId[];

export function isRaceId(value: string): value is RaceId {
  return value in RACES;
}
