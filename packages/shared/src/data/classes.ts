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

/**
 * Subclass identifikátory (D&D Remaster). 2 per třída (ADR 0040 / B3): původní
 * MVP subclass + 1 nová tematická. Subclassy, které by udělovaly *nové* sesílání
 * (Eldritch Knight / Arcane Trickster), záměrně vynechány — spell sloty jsou
 * vázané na classu (`CASTER_TYPE`), ne subclass.
 */
export type SubclassId =
  | 'path_of_the_berserker'
  | 'path_of_the_totem_warrior'
  | 'college_of_lore'
  | 'college_of_valor'
  | 'life_domain'
  | 'war_domain'
  | 'circle_of_the_moon'
  | 'circle_of_the_land'
  | 'champion'
  | 'battle_master'
  | 'way_of_the_open_hand'
  | 'way_of_shadow'
  | 'oath_of_devotion'
  | 'oath_of_vengeance'
  | 'hunter'
  | 'beast_master'
  | 'thief'
  | 'assassin'
  | 'draconic_bloodline'
  | 'wild_magic'
  | 'the_fiend'
  | 'the_great_old_one'
  | 'school_of_evocation'
  | 'school_of_abjuration';

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
      {
        id: 'path_of_the_totem_warrior',
        name: 'Path of the Totem Warrior',
        description: 'Bear spirit totem — shrug off blows and endure any onslaught.',
      },
    ],
  },
  bard: {
    id: 'bard',
    name: 'Bard',
    primaryStat: 'charisma',
    spellcastingAbility: 'charisma',
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
      {
        id: 'college_of_valor',
        name: 'College of Valor',
        description: 'A martial battle hymn that empowers weapon strikes.',
      },
    ],
  },
  cleric: {
    id: 'cleric',
    name: 'Cleric',
    primaryStat: 'wisdom',
    spellcastingAbility: 'wisdom',
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
      {
        id: 'war_domain',
        name: 'War Domain',
        description: 'Channel Divinity guides your weapon to strike true.',
      },
    ],
  },
  druid: {
    id: 'druid',
    name: 'Druid',
    primaryStat: 'wisdom',
    spellcastingAbility: 'wisdom',
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
      {
        id: 'circle_of_the_land',
        name: 'Circle of the Land',
        description: 'Draw on the land itself — thorns and bramble lash your foes.',
      },
    ],
  },
  fighter: {
    id: 'fighter',
    name: 'Fighter',
    primaryStat: 'strength',
    spellcastingAbility: 'intelligence',
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
      {
        id: 'battle_master',
        name: 'Battle Master',
        description: 'Superiority dice fuel precise, extra-damaging combat maneuvers.',
      },
    ],
  },
  monk: {
    id: 'monk',
    name: 'Monk',
    primaryStat: 'dexterity',
    spellcastingAbility: 'wisdom',
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
      {
        id: 'way_of_shadow',
        name: 'Way of Shadow',
        description: 'Strike from darkness with sudden, advantaged blows.',
      },
    ],
  },
  paladin: {
    id: 'paladin',
    name: 'Paladin',
    primaryStat: 'strength',
    spellcastingAbility: 'charisma',
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
      {
        id: 'oath_of_vengeance',
        name: 'Oath of Vengeance',
        description: 'Vow of Enmity — hunt a marked foe with relentless, advantaged strikes.',
      },
    ],
  },
  ranger: {
    id: 'ranger',
    name: 'Ranger',
    primaryStat: 'dexterity',
    spellcastingAbility: 'wisdom',
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
      {
        id: 'beast_master',
        name: 'Beast Master',
        description: 'A bonded beast companion that tears into your enemies.',
      },
    ],
  },
  rogue: {
    id: 'rogue',
    name: 'Rogue',
    primaryStat: 'dexterity',
    spellcastingAbility: 'intelligence',
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
      {
        id: 'assassin',
        name: 'Assassin',
        description: 'Assassinate — lethal opening strikes with advantage and full Sneak dice.',
      },
    ],
  },
  sorcerer: {
    id: 'sorcerer',
    name: 'Sorcerer',
    primaryStat: 'charisma',
    spellcastingAbility: 'charisma',
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
      {
        id: 'wild_magic',
        name: 'Wild Magic',
        description: 'Untamed chaos magic erupts in unpredictable bursts.',
      },
    ],
  },
  warlock: {
    id: 'warlock',
    name: 'Warlock',
    primaryStat: 'charisma',
    spellcastingAbility: 'charisma',
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
      {
        id: 'the_great_old_one',
        name: 'The Great Old One',
        description: 'An alien patron whispers maddening, mind-rending magic.',
      },
    ],
  },
  wizard: {
    id: 'wizard',
    name: 'Wizard',
    primaryStat: 'intelligence',
    spellcastingAbility: 'intelligence',
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
      {
        id: 'school_of_abjuration',
        name: 'School of Abjuration',
        description: 'An Arcane Ward absorbs incoming harm, shielding you in battle.',
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
