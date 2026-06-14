/**
 * Definice vanilla-style class. Statická herní data — jediný zdroj pravdy
 * pro API i web. Balanc (přesné hodnoty) se ladí zde.
 */
import type { PrimaryStat } from '../character';

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
  /** Primární atribut classy (škáluje hlavní výkon). */
  primaryStat: PrimaryStat;
  resource: ResourceType;
  /** Role, které classa ve vanilla typicky plní. */
  roles: Role[];
}

export const CLASSES: Record<ClassId, ClassDef> = {
  warrior: {
    id: 'warrior',
    name: 'Warrior',
    primaryStat: 'strength',
    resource: 'rage',
    roles: ['tank', 'dps'],
  },
  paladin: {
    id: 'paladin',
    name: 'Paladin',
    primaryStat: 'strength',
    resource: 'mana',
    roles: ['tank', 'healer', 'dps'],
  },
  hunter: {
    id: 'hunter',
    name: 'Hunter',
    primaryStat: 'agility',
    resource: 'mana',
    roles: ['dps'],
  },
  rogue: { id: 'rogue', name: 'Rogue', primaryStat: 'agility', resource: 'energy', roles: ['dps'] },
  priest: {
    id: 'priest',
    name: 'Priest',
    primaryStat: 'intellect',
    resource: 'mana',
    roles: ['healer', 'dps'],
  },
  shaman: {
    id: 'shaman',
    name: 'Shaman',
    primaryStat: 'intellect',
    resource: 'mana',
    roles: ['healer', 'dps'],
  },
  mage: { id: 'mage', name: 'Mage', primaryStat: 'intellect', resource: 'mana', roles: ['dps'] },
  warlock: {
    id: 'warlock',
    name: 'Warlock',
    primaryStat: 'intellect',
    resource: 'mana',
    roles: ['dps'],
  },
  druid: {
    id: 'druid',
    name: 'Druid',
    primaryStat: 'intellect',
    resource: 'mana',
    roles: ['tank', 'healer', 'dps'],
  },
};

export const CLASS_IDS = Object.keys(CLASSES) as ClassId[];

export function isClassId(value: string): value is ClassId {
  return value in CLASSES;
}
