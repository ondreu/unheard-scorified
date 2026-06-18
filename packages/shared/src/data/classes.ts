/**
 * Definice class — D&D 5e (MR-2). 12 tříd, každá s jednou subclass volbou v MVP
 * (další subclassy přidáme postupně). Statická herní data — jediný zdroj pravdy
 * pro API i web. Homebrew D&D setting (rozhodnutí PM).
 *
 * - `primaryStat` — atribut škálující hlavní bojový výkon (combat engine).
 * - `spellcastingAbility` — D&D atribut pro spell save DC / spell attack.
 * - `resource` — zjednodušený zdroj (rage/energy/mana); plné D&D spell sloty +
 *   class resources (Ki, Rage charges, Pact Magic…) přijdou v MR-4/MR-15.
 * - `hitDie` — D&D kostka životů (HP per level).
 * - `subclass` — volby subclass + level, na kterém se volí (D&D subclass level).
 */
import type { AbilityScore } from '../character';
import type { DamageType } from './damage';

export type ClassId =
  | 'barbarian'
  | 'bard'
  | 'cleric'
  | 'druid'
  | 'fighter'
  | 'monk'
  | 'paladin'
  | 'ranger'
  | 'rogue'
  | 'sorcerer'
  | 'warlock'
  | 'wizard';

/** Subclass identifikátory (1 per třída v MVP — D&D Remaster). */
export type SubclassId =
  | 'path_of_the_berserker'
  | 'college_of_lore'
  | 'life_domain'
  | 'circle_of_the_moon'
  | 'champion'
  | 'way_of_the_open_hand'
  | 'oath_of_devotion'
  | 'hunter'
  | 'thief'
  | 'draconic_bloodline'
  | 'the_fiend'
  | 'school_of_evocation';

/** Zjednodušený typ zdroje (resource). Plné D&D resources v MR-4/MR-15. */
export type ResourceType = 'rage' | 'energy' | 'mana';

export type Role = 'tank' | 'healer' | 'dps';

export interface SubclassDef {
  id: SubclassId;
  name: string;
  description: string;
}

export interface ClassDef {
  id: ClassId;
  name: string;
  /** Primární atribut classy (škáluje hlavní bojový výkon). */
  primaryStat: AbilityScore;
  /** D&D spellcasting atribut (spell save DC, spell attack bonus). */
  spellcastingAbility: AbilityScore;
  resource: ResourceType;
  /** D&D kostka životů (HP per level). */
  hitDie: number;
  /**
   * Strana kostky poškození základního útoku (D&D zbraň/cantrip): d6/d8/d10/d12.
   * Řídí *tvar* damage dice (`weaponDamageSpec`) — magnitudu drží `attackPower`,
   * takže větší kostka = méně kostek + vyšší variance, ne víc poškození (MR-10b).
   */
  attackDie: number;
  /**
   * Typ poškození základního útoku/kouzla classy (D&D). Aktivuje resistance/
   * vulnerability/immunity (MR-7) i pro hráčské útoky. Martial = fyzické
   * (slashing/piercing/bludgeoning), casteři = signature element (MR-10b).
   */
  attackDamageType: DamageType;
  /** Role, které classa typicky plní. */
  roles: Role[];
  /** Level, na kterém si hráč volí subclass (D&D subclass level). */
  subclassLevel: number;
  /** Dostupné subclassy (1 v MVP). */
  subclasses: SubclassDef[];
}

export const CLASSES: Record<ClassId, ClassDef> = {
  barbarian: {
    id: 'barbarian',
    name: 'Barbarian',
    primaryStat: 'strength',
    spellcastingAbility: 'strength',
    resource: 'rage',
    hitDie: 12,
    attackDie: 12,
    attackDamageType: 'slashing',
    roles: ['tank', 'dps'],
    subclassLevel: 3,
    subclasses: [
      {
        id: 'path_of_the_berserker',
        name: 'Path of the Berserker',
        description: 'Channel rage into a relentless Frenzy of extra attacks.',
      },
    ],
  },
  bard: {
    id: 'bard',
    name: 'Bard',
    primaryStat: 'charisma',
    spellcastingAbility: 'charisma',
    resource: 'mana',
    hitDie: 8,
    attackDie: 8,
    attackDamageType: 'piercing',
    roles: ['healer', 'dps'],
    subclassLevel: 3,
    subclasses: [
      {
        id: 'college_of_lore',
        name: 'College of Lore',
        description: 'Cutting Words and a broad repertoire of magical secrets.',
      },
    ],
  },
  cleric: {
    id: 'cleric',
    name: 'Cleric',
    primaryStat: 'wisdom',
    spellcastingAbility: 'wisdom',
    resource: 'mana',
    hitDie: 8,
    attackDie: 6,
    attackDamageType: 'radiant',
    roles: ['healer', 'tank', 'dps'],
    subclassLevel: 1,
    subclasses: [
      {
        id: 'life_domain',
        name: 'Life Domain',
        description: 'Disciple of life — your healing surges with divine power.',
      },
    ],
  },
  druid: {
    id: 'druid',
    name: 'Druid',
    primaryStat: 'wisdom',
    spellcastingAbility: 'wisdom',
    resource: 'mana',
    hitDie: 8,
    attackDie: 6,
    attackDamageType: 'bludgeoning',
    roles: ['healer', 'tank', 'dps'],
    subclassLevel: 2,
    subclasses: [
      {
        id: 'circle_of_the_moon',
        name: 'Circle of the Moon',
        description: 'Wild Shape into mighty beasts to tank and tear.',
      },
    ],
  },
  fighter: {
    id: 'fighter',
    name: 'Fighter',
    primaryStat: 'strength',
    spellcastingAbility: 'intelligence',
    resource: 'energy',
    hitDie: 10,
    attackDie: 8,
    attackDamageType: 'slashing',
    roles: ['tank', 'dps'],
    subclassLevel: 3,
    subclasses: [
      {
        id: 'champion',
        name: 'Champion',
        description: 'Improved Critical and raw martial superiority.',
      },
    ],
  },
  monk: {
    id: 'monk',
    name: 'Monk',
    primaryStat: 'dexterity',
    spellcastingAbility: 'wisdom',
    resource: 'energy',
    hitDie: 8,
    attackDie: 6,
    attackDamageType: 'bludgeoning',
    roles: ['dps', 'tank'],
    subclassLevel: 3,
    subclasses: [
      {
        id: 'way_of_the_open_hand',
        name: 'Way of the Open Hand',
        description: 'Flurry of Blows that staggers and strikes vital points.',
      },
    ],
  },
  paladin: {
    id: 'paladin',
    name: 'Paladin',
    primaryStat: 'strength',
    spellcastingAbility: 'charisma',
    resource: 'mana',
    hitDie: 10,
    attackDie: 8,
    attackDamageType: 'radiant',
    roles: ['tank', 'healer', 'dps'],
    subclassLevel: 3,
    subclasses: [
      {
        id: 'oath_of_devotion',
        name: 'Oath of Devotion',
        description: 'Sacred Weapon and radiant Divine Smites.',
      },
    ],
  },
  ranger: {
    id: 'ranger',
    name: 'Ranger',
    primaryStat: 'dexterity',
    spellcastingAbility: 'wisdom',
    resource: 'mana',
    hitDie: 10,
    attackDie: 8,
    attackDamageType: 'piercing',
    roles: ['dps'],
    subclassLevel: 3,
    subclasses: [
      {
        id: 'hunter',
        name: 'Hunter',
        description: "Hunter's Mark and focused fire on a single prey.",
      },
    ],
  },
  rogue: {
    id: 'rogue',
    name: 'Rogue',
    primaryStat: 'dexterity',
    spellcastingAbility: 'intelligence',
    resource: 'energy',
    hitDie: 8,
    attackDie: 6,
    attackDamageType: 'piercing',
    roles: ['dps'],
    subclassLevel: 3,
    subclasses: [
      {
        id: 'thief',
        name: 'Thief',
        description: 'Fast Hands and devastating Sneak Attacks from the shadows.',
      },
    ],
  },
  sorcerer: {
    id: 'sorcerer',
    name: 'Sorcerer',
    primaryStat: 'charisma',
    spellcastingAbility: 'charisma',
    resource: 'mana',
    hitDie: 6,
    attackDie: 10,
    attackDamageType: 'fire',
    roles: ['dps'],
    subclassLevel: 1,
    subclasses: [
      {
        id: 'draconic_bloodline',
        name: 'Draconic Bloodline',
        description: 'Draconic heritage empowers your elemental sorcery.',
      },
    ],
  },
  warlock: {
    id: 'warlock',
    name: 'Warlock',
    primaryStat: 'charisma',
    spellcastingAbility: 'charisma',
    resource: 'mana',
    hitDie: 8,
    attackDie: 10,
    attackDamageType: 'force',
    roles: ['dps'],
    subclassLevel: 1,
    subclasses: [
      {
        id: 'the_fiend',
        name: 'The Fiend',
        description: 'A fiendish patron fuels relentless Eldritch Blasts.',
      },
    ],
  },
  wizard: {
    id: 'wizard',
    name: 'Wizard',
    primaryStat: 'intelligence',
    spellcastingAbility: 'intelligence',
    resource: 'mana',
    hitDie: 6,
    attackDie: 10,
    attackDamageType: 'fire',
    roles: ['dps'],
    subclassLevel: 2,
    subclasses: [
      {
        id: 'school_of_evocation',
        name: 'School of Evocation',
        description: 'Sculpt Spells and overwhelming arcane firepower.',
      },
    ],
  },
};

export const CLASS_IDS = Object.keys(CLASSES) as ClassId[];

export function isClassId(value: string): value is ClassId {
  return value in CLASSES;
}

/** Subclass id → definice (napříč všemi třídami). */
export const SUBCLASSES: Record<SubclassId, SubclassDef> = Object.fromEntries(
  CLASS_IDS.flatMap((c) => CLASSES[c].subclasses.map((s) => [s.id, s])),
) as Record<SubclassId, SubclassDef>;

export function isSubclassId(value: string): value is SubclassId {
  return value in SUBCLASSES;
}

/** Patří subclass dané třídě? */
export function isSubclassOf(klass: ClassId, subclass: SubclassId): boolean {
  return CLASSES[klass]?.subclasses.some((s) => s.id === subclass) ?? false;
}
