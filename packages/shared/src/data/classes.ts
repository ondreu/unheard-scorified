/**
 * Definice class. Statická herní data — jediný zdroj pravdy pro API i web.
 * Balanc (přesné hodnoty) se ladí zde.
 *
 * MR-1: `primaryStat` (atribut škálující bojový výkon) i `spellcastingAbility`
 * (D&D atribut pro spell save DC / spell attack) jsou nově D&D atributy
 * (`AbilityScore`). Plný D&D class redesign (12 tříd + subclassy + resources)
 * přijde v MR-2.
 */
import type { AbilityScore } from '../character';

export type ClassId =
  | 'warrior'
  | 'paladin'
  | 'hunter'
  | 'rogue'
  | 'priest'
  | 'shaman'
  | 'mage'
  | 'warlock'
  | 'druid';

/** Typ zdroje (resource) postavy. */
export type ResourceType = 'rage' | 'energy' | 'mana';

export type Role = 'tank' | 'healer' | 'dps';

export interface ClassDef {
  id: ClassId;
  name: string;
  /** Primární atribut classy (škáluje hlavní bojový výkon). */
  primaryStat: AbilityScore;
  /** D&D spellcasting atribut (spell save DC, spell attack bonus). */
  spellcastingAbility: AbilityScore;
  resource: ResourceType;
  /** Role, které classa typicky plní. */
  roles: Role[];
}

export const CLASSES: Record<ClassId, ClassDef> = {
  warrior: {
    id: 'warrior',
    name: 'Warrior',
    primaryStat: 'strength',
    spellcastingAbility: 'intelligence',
    resource: 'rage',
    roles: ['tank', 'dps'],
  },
  paladin: {
    id: 'paladin',
    name: 'Paladin',
    primaryStat: 'strength',
    spellcastingAbility: 'charisma',
    resource: 'mana',
    roles: ['tank', 'healer', 'dps'],
  },
  hunter: {
    id: 'hunter',
    name: 'Hunter',
    primaryStat: 'dexterity',
    spellcastingAbility: 'wisdom',
    resource: 'mana',
    roles: ['dps'],
  },
  rogue: {
    id: 'rogue',
    name: 'Rogue',
    primaryStat: 'dexterity',
    spellcastingAbility: 'intelligence',
    resource: 'energy',
    roles: ['dps'],
  },
  priest: {
    id: 'priest',
    name: 'Priest',
    primaryStat: 'intelligence',
    spellcastingAbility: 'wisdom',
    resource: 'mana',
    roles: ['healer', 'dps'],
  },
  shaman: {
    id: 'shaman',
    name: 'Shaman',
    primaryStat: 'intelligence',
    spellcastingAbility: 'wisdom',
    resource: 'mana',
    roles: ['healer', 'dps'],
  },
  mage: {
    id: 'mage',
    name: 'Mage',
    primaryStat: 'intelligence',
    spellcastingAbility: 'intelligence',
    resource: 'mana',
    roles: ['dps'],
  },
  warlock: {
    id: 'warlock',
    name: 'Warlock',
    primaryStat: 'intelligence',
    spellcastingAbility: 'charisma',
    resource: 'mana',
    roles: ['dps'],
  },
  druid: {
    id: 'druid',
    name: 'Druid',
    primaryStat: 'intelligence',
    spellcastingAbility: 'wisdom',
    resource: 'mana',
    roles: ['tank', 'healer', 'dps'],
  },
};

export const CLASS_IDS = Object.keys(CLASSES) as ClassId[];

export function isClassId(value: string): value is ClassId {
  return value in CLASSES;
}
