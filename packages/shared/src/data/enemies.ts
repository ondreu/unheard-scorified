/**
 * D&D bestiář (MR-7). Jediný zdroj pravdy pro katalog nestvůr: creature type,
 * Challenge Rating, damage typ útoku, **resistance / vulnerability / immunity** a
 * unikátní ability. Rozšiřuje dice-roll combat z MR-5 (`combat.ts`) o typové
 * poškození a obrany.
 *
 * Čistá data + builder (`buildBestiaryEnemy`) → `EnemyStats`; herní logika žije
 * v `combat.ts`. Konkrétní staty se odvozují z CR (DMG, `crStatGuide`) a smí je
 * šablona přepsat. Balanc (přiřazení CR existujícímu obsahu) = MR-10.
 *
 * Type-only import `EnemyStats` z `../combat` → žádný runtime cyklus (combat.ts
 * z bestiáře importuje jen za běhu, my z něj jen typ).
 */
import type { AbilityScore } from '../character';
import type { EnemyStats } from '../combat';
import {
  crStatGuide,
  type ChallengeRating,
  type CreatureType,
  type DamageType,
} from './damage';

// ── Ability nestvůry ─────────────────────────────────────────────────────────

/** Speciální útok / schopnost nestvůry (idle: cooldown-based, flavor + damage). */
export interface EnemyAbility {
  id: string;
  /** Anglický název (game language = EN). */
  name: string;
  /** Násobek poškození vůči základnímu útoku nestvůry. */
  damageMult: number;
  /** Typ poškození této ability (může se lišit od základního útoku). */
  damageType: DamageType;
  /** Cooldown ve vteřinách (idle recharge). */
  cooldownSec: number;
  /** Hráči viditelný popis (anglicky). */
  description: string;
  /** Volitelný saving throw efekt (cíl si hází proti save DC nestvůry). */
  save?: { ability: AbilityScore; description: string };
}

// ── Šablona nestvůry ─────────────────────────────────────────────────────────

/** Statická šablona nestvůry v bestiáři. */
export interface EnemyTemplate {
  id: string;
  /** Anglický název (game language = EN). */
  name: string;
  /** Flavor popis (anglicky). */
  description: string;
  /** Rodina nestvůry (D&D creature type). */
  creatureType: CreatureType;
  /** Challenge Rating (řídí doporučené staty + XP). */
  cr: ChallengeRating;
  /** Typ poškození základního útoku. */
  attackType: DamageType;
  /** Resistance (poloviční poškození). */
  resistances?: readonly DamageType[];
  /** Vulnerability (dvojnásobné poškození). */
  vulnerabilities?: readonly DamageType[];
  /** Immunity (nulové poškození). */
  immunities?: readonly DamageType[];
  /** Unikátní ability nestvůry. */
  abilities?: readonly EnemyAbility[];
  /** Boss flag (epické nestvůry). */
  isBoss?: boolean;
  /** Přepis doporučeného HP (jinak ze CR). */
  maxHealth?: number;
  /** Přepis doporučeného poškození na úder (jinak ze CR `damagePerRound`). */
  attackPower?: number;
  /** Přepis swing intervalu (vteřiny). Default 2.4. */
  swingInterval?: number;
}

/** Default swing interval nestvůry (vteřiny), sjednocený s player baseline. */
const DEFAULT_SWING = 2.4;

// ── Katalog ──────────────────────────────────────────────────────────────────

/**
 * Bestiář — reprezentativní D&D nestvůry napříč creature typy a CR. Demonstruje
 * resistance/vulnerability/immunity a unikátní ability. Existující dungeon/raid
 * obsah ho zatím nepoužívá (přemapování = MR-10); slouží jako znovupoužitelná
 * datová vrstva combat enginu a budoucího content authoringu.
 */
const TEMPLATES: readonly EnemyTemplate[] = [
  // ── Undead ─────────────────────────────────────────────────────────────────
  {
    id: 'skeleton_warrior',
    name: 'Skeleton Warrior',
    description: 'Animated bones held together by dark magic, brittle but tireless.',
    creatureType: 'undead',
    cr: 0.25,
    attackType: 'slashing',
    vulnerabilities: ['bludgeoning'],
    immunities: ['poison'],
    resistances: ['necrotic'],
  },
  {
    id: 'rotting_zombie',
    name: 'Rotting Zombie',
    description: 'A shambling corpse that keeps coming long after it should fall.',
    creatureType: 'undead',
    cr: 0.25,
    attackType: 'bludgeoning',
    immunities: ['poison'],
    resistances: ['necrotic'],
    vulnerabilities: ['radiant'],
  },
  {
    id: 'grave_wraith',
    name: 'Grave Wraith',
    description: 'A malevolent spirit that drains the life from the living.',
    creatureType: 'undead',
    cr: 5,
    attackType: 'necrotic',
    resistances: ['cold', 'lightning', 'bludgeoning', 'piercing', 'slashing'],
    immunities: ['necrotic', 'poison'],
    vulnerabilities: ['radiant'],
    abilities: [
      {
        id: 'life_drain',
        name: 'Life Drain',
        damageMult: 1.8,
        damageType: 'necrotic',
        cooldownSec: 12,
        description: 'Drains vitality, healing the wraith for the damage dealt.',
        save: { ability: 'constitution', description: 'CON save or max HP is reduced.' },
      },
    ],
  },

  // ── Humanoid ───────────────────────────────────────────────────────────────
  {
    id: 'goblin_cutter',
    name: 'Goblin Cutter',
    description: 'A small, vicious raider that strikes from the shadows.',
    creatureType: 'humanoid',
    cr: 0.25,
    attackType: 'slashing',
    abilities: [
      {
        id: 'nasty_jab',
        name: 'Nasty Jab',
        damageMult: 1.5,
        damageType: 'piercing',
        cooldownSec: 8,
        description: 'A sudden stab aimed at a weak point.',
      },
    ],
  },
  {
    id: 'cultist_pyromancer',
    name: 'Cultist Pyromancer',
    description: 'A robed zealot channeling profane flame.',
    creatureType: 'humanoid',
    cr: 2,
    attackType: 'fire',
    resistances: ['fire'],
    abilities: [
      {
        id: 'scorching_ray',
        name: 'Scorching Ray',
        damageMult: 1.7,
        damageType: 'fire',
        cooldownSec: 10,
        description: 'Hurls searing bolts of flame.',
        save: { ability: 'dexterity', description: 'DEX save for half damage.' },
      },
    ],
  },

  // ── Beast ──────────────────────────────────────────────────────────────────
  {
    id: 'dire_wolf',
    name: 'Dire Wolf',
    description: 'An enormous pack hunter with bone-crushing jaws.',
    creatureType: 'beast',
    cr: 1,
    attackType: 'piercing',
    abilities: [
      {
        id: 'pack_takedown',
        name: 'Pack Takedown',
        damageMult: 1.6,
        damageType: 'piercing',
        cooldownSec: 9,
        description: 'Lunges to knock the target prone.',
        save: { ability: 'strength', description: 'STR save or be knocked prone.' },
      },
    ],
  },

  // ── Giant ──────────────────────────────────────────────────────────────────
  {
    id: 'hill_ogre',
    name: 'Hill Ogre',
    description: 'A hulking brute swinging a tree-trunk club.',
    creatureType: 'giant',
    cr: 2,
    attackType: 'bludgeoning',
    abilities: [
      {
        id: 'crushing_swing',
        name: 'Crushing Swing',
        damageMult: 2,
        damageType: 'bludgeoning',
        cooldownSec: 11,
        description: 'A wide, devastating club swing.',
      },
    ],
  },

  // ── Elemental ──────────────────────────────────────────────────────────────
  {
    id: 'fire_elemental',
    name: 'Fire Elemental',
    description: 'A roaring vortex of living flame.',
    creatureType: 'elemental',
    cr: 5,
    attackType: 'fire',
    immunities: ['fire', 'poison'],
    vulnerabilities: ['cold'],
    resistances: ['bludgeoning', 'piercing', 'slashing'],
    abilities: [
      {
        id: 'fire_burst',
        name: 'Fire Burst',
        damageMult: 1.8,
        damageType: 'fire',
        cooldownSec: 10,
        description: 'Erupts in a burst of flame, igniting everything nearby.',
        save: { ability: 'dexterity', description: 'DEX save for half damage.' },
      },
    ],
  },
  {
    id: 'frost_elemental',
    name: 'Frost Elemental',
    description: 'A shard-bodied creature radiating numbing cold.',
    creatureType: 'elemental',
    cr: 5,
    attackType: 'cold',
    immunities: ['cold', 'poison'],
    vulnerabilities: ['fire'],
    resistances: ['bludgeoning', 'piercing', 'slashing'],
    abilities: [
      {
        id: 'frost_nova',
        name: 'Frost Nova',
        damageMult: 1.6,
        damageType: 'cold',
        cooldownSec: 10,
        description: 'A wave of frost that slows everything it touches.',
        save: { ability: 'constitution', description: 'CON save or be slowed.' },
      },
    ],
  },

  // ── Construct ──────────────────────────────────────────────────────────────
  {
    id: 'stone_golem',
    name: 'Stone Golem',
    description: 'A massive automaton of carved granite.',
    creatureType: 'construct',
    cr: 10,
    attackType: 'bludgeoning',
    immunities: ['poison', 'psychic'],
    resistances: ['necrotic'],
    abilities: [
      {
        id: 'slam',
        name: 'Earthshaking Slam',
        damageMult: 2,
        damageType: 'bludgeoning',
        cooldownSec: 12,
        description: 'A ground-pounding slam that staggers all nearby.',
        save: { ability: 'strength', description: 'STR save or be knocked prone.' },
      },
    ],
  },

  // ── Plant ──────────────────────────────────────────────────────────────────
  {
    id: 'ancient_treant',
    name: 'Ancient Treant',
    description: 'A towering, wrathful tree-guardian of the deep wood.',
    creatureType: 'plant',
    cr: 9,
    attackType: 'bludgeoning',
    resistances: ['bludgeoning', 'piercing'],
    vulnerabilities: ['fire'],
    abilities: [
      {
        id: 'rooting_grasp',
        name: 'Rooting Grasp',
        damageMult: 1.5,
        damageType: 'bludgeoning',
        cooldownSec: 13,
        description: 'Roots erupt to ensnare the target.',
        save: { ability: 'strength', description: 'STR save or be restrained.' },
      },
    ],
  },

  // ── Fiend ──────────────────────────────────────────────────────────────────
  {
    id: 'pit_fiend_spawn',
    name: 'Abyssal Marauder',
    description: 'A lesser fiend wreathed in hellish fire.',
    creatureType: 'fiend',
    cr: 6,
    attackType: 'slashing',
    resistances: ['cold', 'lightning', 'bludgeoning', 'piercing', 'slashing'],
    immunities: ['fire', 'poison'],
    abilities: [
      {
        id: 'hellfire_lash',
        name: 'Hellfire Lash',
        damageMult: 1.9,
        damageType: 'fire',
        cooldownSec: 11,
        description: 'A whip of fire that sears flesh and soul alike.',
        save: { ability: 'dexterity', description: 'DEX save for half damage.' },
      },
    ],
  },

  // ── Dragon (boss) ──────────────────────────────────────────────────────────
  {
    id: 'young_red_dragon',
    name: 'Young Red Dragon',
    description: 'A prideful wyrm whose breath turns stone to slag.',
    creatureType: 'dragon',
    cr: 10,
    attackType: 'piercing',
    immunities: ['fire'],
    isBoss: true,
    abilities: [
      {
        id: 'fire_breath',
        name: 'Fire Breath',
        damageMult: 2.6,
        damageType: 'fire',
        cooldownSec: 16,
        description: 'A cone of roaring flame engulfing all before it.',
        save: { ability: 'dexterity', description: 'DEX save for half damage.' },
      },
    ],
  },

  // ── Aberration (boss) ──────────────────────────────────────────────────────
  {
    id: 'mind_devourer',
    name: 'Mind Devourer',
    description: 'A floating horror of tentacles and psychic hunger.',
    creatureType: 'aberration',
    cr: 8,
    attackType: 'psychic',
    resistances: ['psychic'],
    abilities: [
      {
        id: 'mind_blast',
        name: 'Mind Blast',
        damageMult: 2,
        damageType: 'psychic',
        cooldownSec: 14,
        description: 'A cone of psychic energy that stuns the weak-willed.',
        save: { ability: 'intelligence', description: 'INT save or be stunned.' },
      },
    ],
  },
];

/** Bestiář indexovaný podle id. */
export const BESTIARY: Record<string, EnemyTemplate> = Object.fromEntries(
  TEMPLATES.map((t) => [t.id, t]),
);

export const BESTIARY_IDS: readonly string[] = TEMPLATES.map((t) => t.id);

/** Šablona nestvůry podle id (nebo `undefined`). */
export function getEnemyTemplate(id: string): EnemyTemplate | undefined {
  return BESTIARY[id];
}

/** Nestvůry daného creature typu. */
export function enemiesByCreatureType(type: CreatureType): EnemyTemplate[] {
  return TEMPLATES.filter((t) => t.creatureType === type);
}

/** Nestvůry daného CR. */
export function enemiesByChallengeRating(cr: ChallengeRating): EnemyTemplate[] {
  return TEMPLATES.filter((t) => t.cr === cr);
}

// ── Builder → EnemyStats (combat) ────────────────────────────────────────────

/** Volitelný přepis statů při instanciaci (např. scale pro idle balanc). */
export interface BestiaryEnemyOverrides {
  maxHealth?: number;
  attackPower?: number;
  swingInterval?: number;
  isBoss?: boolean;
}

/**
 * Postaví `EnemyStats` ze šablony bestiáře: HP/poškození z CR doporučení (DMG)
 * nebo z přepisu šablony, AC / attackBonus / spell save DC z `crStatGuide`,
 * damage typ + resistance/vulnerability/immunity propsané do combat aktéra.
 * Boss dostane +2 AC (drobné zpřísnění, plný balanc = MR-10).
 */
export function buildBestiaryEnemy(
  template: EnemyTemplate,
  overrides: BestiaryEnemyOverrides = {},
): EnemyStats & { id: string } {
  const guide = crStatGuide(template.cr);
  const isBoss = overrides.isBoss ?? template.isBoss ?? false;
  return {
    id: template.id,
    name: template.name,
    maxHealth: overrides.maxHealth ?? template.maxHealth ?? guide.hitPoints,
    attackPower: overrides.attackPower ?? template.attackPower ?? guide.damagePerRound,
    swingInterval: overrides.swingInterval ?? template.swingInterval ?? DEFAULT_SWING,
    isBoss,
    armorClass: guide.armorClass + (isBoss ? 2 : 0),
    attackBonus: guide.attackBonus,
    spellSaveDc: guide.saveDc,
    damageType: template.attackType,
    resistances: template.resistances,
    vulnerabilities: template.vulnerabilities,
    immunities: template.immunities,
  };
}

/** Postaví `EnemyStats` přímo z id bestiáře (nebo `undefined`, když id neexistuje). */
export function bestiaryEnemyById(
  id: string,
  overrides?: BestiaryEnemyOverrides,
): (EnemyStats & { id: string }) | undefined {
  const template = BESTIARY[id];
  return template ? buildBestiaryEnemy(template, overrides) : undefined;
}
