/**
 * D&D 5e damage typy, creature typy a Challenge Rating (MR-7). Čistá data + math,
 * **žádný import z `combat.ts`** → žádný runtime cyklus (bestiář i combat engine
 * z toho jen čtou). Jediný zdroj pravdy pro:
 *  - druhy poškození (fyzické + elementální/magické),
 *  - resistance / vulnerability / immunity interakci (×0.5 / ×2 / ×0),
 *  - CR tabulky: CR → XP, CR → proficiency bonus, CR → doporučené staty (DMG).
 *
 * Konkrétní čísla (CR doporučení) jsou D&D 5e SRD; herní balanc (přiřazení CR
 * obsahu, finální XP křivka) se dolaďuje v MR-10/MR-11.
 */

// ── Damage typy (D&D 5e) ─────────────────────────────────────────────────────

/** Fyzické typy poškození (zbraně). */
export type PhysicalDamageType = 'slashing' | 'piercing' | 'bludgeoning';

/** Elementální / magické typy poškození. */
export type MagicalDamageType =
  | 'fire'
  | 'cold'
  | 'lightning'
  | 'thunder'
  | 'acid'
  | 'poison'
  | 'necrotic'
  | 'radiant'
  | 'force'
  | 'psychic';

/** Všechny D&D 5e damage typy. */
export type DamageType = PhysicalDamageType | MagicalDamageType;

export const PHYSICAL_DAMAGE_TYPES: readonly PhysicalDamageType[] = [
  'slashing',
  'piercing',
  'bludgeoning',
];

export const MAGICAL_DAMAGE_TYPES: readonly MagicalDamageType[] = [
  'fire',
  'cold',
  'lightning',
  'thunder',
  'acid',
  'poison',
  'necrotic',
  'radiant',
  'force',
  'psychic',
];

export const DAMAGE_TYPES: readonly DamageType[] = [
  ...PHYSICAL_DAMAGE_TYPES,
  ...MAGICAL_DAMAGE_TYPES,
];

const PHYSICAL_SET = new Set<DamageType>(PHYSICAL_DAMAGE_TYPES);

/** Je damage typ fyzický (slashing/piercing/bludgeoning)? */
export function isPhysicalDamage(type: DamageType): boolean {
  return PHYSICAL_SET.has(type);
}

// ── Resistance / vulnerability / immunity ────────────────────────────────────

/** Jak cíl reaguje na daný typ poškození. */
export type DamageInteraction = 'normal' | 'resistant' | 'vulnerable' | 'immune';

/** Obranný profil cíle vůči typům poškození (D&D resistances/vulnerabilities/immunities). */
export interface DamageDefenses {
  /** Poloviční poškození (×0.5, zaokrouhleno dolů). */
  resistances?: readonly DamageType[];
  /** Dvojnásobné poškození (×2). */
  vulnerabilities?: readonly DamageType[];
  /** Nulové poškození (×0). */
  immunities?: readonly DamageType[];
}

/**
 * Určí interakci typu poškození s obranami cíle (D&D priorita: immunity > zbytek;
 * resistance i vulnerability na stejný typ se ruší → normal).
 */
export function damageInteraction(type: DamageType, defenses: DamageDefenses): DamageInteraction {
  if (defenses.immunities?.includes(type)) return 'immune';
  const resistant = defenses.resistances?.includes(type) ?? false;
  const vulnerable = defenses.vulnerabilities?.includes(type) ?? false;
  if (resistant && vulnerable) return 'normal';
  if (resistant) return 'resistant';
  if (vulnerable) return 'vulnerable';
  return 'normal';
}

/**
 * Aplikuje interakci na hrubé poškození (D&D 5e): immune ×0, resistant ×0.5
 * (zaokrouhleno dolů), vulnerable ×2, normal beze změny. Nezajišťuje minimum —
 * to řeší combat engine (chip damage).
 */
export function applyDamageInteraction(amount: number, interaction: DamageInteraction): number {
  switch (interaction) {
    case 'immune':
      return 0;
    case 'resistant':
      return Math.floor(amount / 2);
    case 'vulnerable':
      return amount * 2;
    case 'normal':
      return amount;
  }
}

/** Krátký anglický štítek interakce pro combat log (`normal` → prázdné). */
export function damageInteractionNote(interaction: DamageInteraction): string {
  switch (interaction) {
    case 'immune':
      return ' (immune)';
    case 'resistant':
      return ' (resisted)';
    case 'vulnerable':
      return ' (vulnerable!)';
    case 'normal':
      return '';
  }
}

// ── Creature typy (D&D 5e) ───────────────────────────────────────────────────

/** D&D 5e creature typy (rodina nestvůry) — flavor + budoucí tag-based mechaniky. */
export type CreatureType =
  | 'aberration'
  | 'beast'
  | 'celestial'
  | 'construct'
  | 'dragon'
  | 'elemental'
  | 'fey'
  | 'fiend'
  | 'giant'
  | 'humanoid'
  | 'monstrosity'
  | 'ooze'
  | 'plant'
  | 'undead';

export const CREATURE_TYPES: readonly CreatureType[] = [
  'aberration',
  'beast',
  'celestial',
  'construct',
  'dragon',
  'elemental',
  'fey',
  'fiend',
  'giant',
  'humanoid',
  'monstrosity',
  'ooze',
  'plant',
  'undead',
];

// ── Challenge Rating ─────────────────────────────────────────────────────────

/**
 * Challenge Rating (D&D 5e). Zlomkové CR pod 1 (1/8, 1/4, 1/2) reprezentujeme
 * desetinně (0.125, 0.25, 0.5). Hra cílí cap lvl 20, ale tabulka je kompletní 0–30.
 */
export type ChallengeRating = number;

/** Doporučené staty nestvůry dle CR (DMG „Monster Statistics by Challenge Rating"). */
export interface CrStatGuide {
  /** Proficiency bonus nestvůry. */
  proficiency: number;
  /** Doporučená Armor Class. */
  armorClass: number;
  /** Doporučené HP (střed pásma). */
  hitPoints: number;
  /** Doporučený útočný bonus. */
  attackBonus: number;
  /** Doporučené poškození za kolo (~ damage na úder pro idle model). */
  damagePerRound: number;
  /** Doporučené spell save DC. */
  saveDc: number;
  /** XP odměna za poražení (D&D 5e). */
  xp: number;
}

/**
 * Tabulka CR → staty (DMG). Klíč = CR jako string (`'0.125'` pro 1/8). Hodnoty
 * jsou střední doporučení; bestiář je smí přepsat (unikátní nestvůry). HP =
 * střed pásma z DMG, damagePerRound = střed pásma.
 */
const CR_TABLE: Record<string, CrStatGuide> = {
  '0': { proficiency: 2, armorClass: 13, hitPoints: 3, attackBonus: 3, damagePerRound: 1, saveDc: 13, xp: 10 },
  '0.125': { proficiency: 2, armorClass: 13, hitPoints: 21, attackBonus: 3, damagePerRound: 2, saveDc: 13, xp: 25 },
  '0.25': { proficiency: 2, armorClass: 13, hitPoints: 42, attackBonus: 3, damagePerRound: 4, saveDc: 13, xp: 50 },
  '0.5': { proficiency: 2, armorClass: 13, hitPoints: 60, attackBonus: 3, damagePerRound: 7, saveDc: 13, xp: 100 },
  '1': { proficiency: 2, armorClass: 13, hitPoints: 78, attackBonus: 3, damagePerRound: 11, saveDc: 13, xp: 200 },
  '2': { proficiency: 2, armorClass: 13, hitPoints: 93, attackBonus: 3, damagePerRound: 17, saveDc: 13, xp: 450 },
  '3': { proficiency: 2, armorClass: 13, hitPoints: 108, attackBonus: 4, damagePerRound: 23, saveDc: 13, xp: 700 },
  '4': { proficiency: 2, armorClass: 14, hitPoints: 123, attackBonus: 5, damagePerRound: 29, saveDc: 14, xp: 1100 },
  '5': { proficiency: 3, armorClass: 15, hitPoints: 138, attackBonus: 6, damagePerRound: 35, saveDc: 15, xp: 1800 },
  '6': { proficiency: 3, armorClass: 15, hitPoints: 153, attackBonus: 6, damagePerRound: 41, saveDc: 15, xp: 2300 },
  '7': { proficiency: 3, armorClass: 15, hitPoints: 168, attackBonus: 6, damagePerRound: 47, saveDc: 15, xp: 2900 },
  '8': { proficiency: 3, armorClass: 16, hitPoints: 183, attackBonus: 7, damagePerRound: 53, saveDc: 16, xp: 3900 },
  '9': { proficiency: 4, armorClass: 16, hitPoints: 198, attackBonus: 7, damagePerRound: 59, saveDc: 16, xp: 5000 },
  '10': { proficiency: 4, armorClass: 17, hitPoints: 213, attackBonus: 7, damagePerRound: 65, saveDc: 16, xp: 5900 },
  '11': { proficiency: 4, armorClass: 17, hitPoints: 228, attackBonus: 8, damagePerRound: 71, saveDc: 17, xp: 7200 },
  '12': { proficiency: 4, armorClass: 17, hitPoints: 243, attackBonus: 8, damagePerRound: 77, saveDc: 17, xp: 8400 },
  '13': { proficiency: 5, armorClass: 18, hitPoints: 258, attackBonus: 8, damagePerRound: 83, saveDc: 18, xp: 10000 },
  '14': { proficiency: 5, armorClass: 18, hitPoints: 273, attackBonus: 8, damagePerRound: 89, saveDc: 18, xp: 11500 },
  '15': { proficiency: 5, armorClass: 18, hitPoints: 288, attackBonus: 8, damagePerRound: 95, saveDc: 18, xp: 13000 },
  '16': { proficiency: 5, armorClass: 18, hitPoints: 303, attackBonus: 9, damagePerRound: 101, saveDc: 18, xp: 15000 },
  '17': { proficiency: 6, armorClass: 19, hitPoints: 318, attackBonus: 10, damagePerRound: 107, saveDc: 19, xp: 18000 },
  '18': { proficiency: 6, armorClass: 19, hitPoints: 333, attackBonus: 10, damagePerRound: 113, saveDc: 19, xp: 20000 },
  '19': { proficiency: 6, armorClass: 19, hitPoints: 348, attackBonus: 10, damagePerRound: 119, saveDc: 19, xp: 22000 },
  '20': { proficiency: 6, armorClass: 19, hitPoints: 378, attackBonus: 10, damagePerRound: 131, saveDc: 19, xp: 25000 },
  '21': { proficiency: 7, armorClass: 19, hitPoints: 423, attackBonus: 11, damagePerRound: 149, saveDc: 20, xp: 33000 },
  '22': { proficiency: 7, armorClass: 19, hitPoints: 468, attackBonus: 11, damagePerRound: 167, saveDc: 20, xp: 41000 },
  '23': { proficiency: 7, armorClass: 19, hitPoints: 513, attackBonus: 11, damagePerRound: 185, saveDc: 20, xp: 50000 },
  '24': { proficiency: 7, armorClass: 19, hitPoints: 558, attackBonus: 12, damagePerRound: 203, saveDc: 21, xp: 62000 },
  '25': { proficiency: 8, armorClass: 19, hitPoints: 603, attackBonus: 12, damagePerRound: 221, saveDc: 21, xp: 75000 },
  '26': { proficiency: 8, armorClass: 19, hitPoints: 648, attackBonus: 12, damagePerRound: 239, saveDc: 21, xp: 90000 },
  '27': { proficiency: 8, armorClass: 19, hitPoints: 693, attackBonus: 13, damagePerRound: 257, saveDc: 22, xp: 105000 },
  '28': { proficiency: 8, armorClass: 19, hitPoints: 738, attackBonus: 13, damagePerRound: 275, saveDc: 22, xp: 120000 },
  '29': { proficiency: 9, armorClass: 19, hitPoints: 783, attackBonus: 13, damagePerRound: 293, saveDc: 22, xp: 135000 },
  '30': { proficiency: 9, armorClass: 19, hitPoints: 828, attackBonus: 14, damagePerRound: 311, saveDc: 23, xp: 155000 },
};

/** Normalizuje CR na klíč tabulky (zlomky → `'0.125'`/`'0.25'`/`'0.5'`). */
function crKey(cr: ChallengeRating): string {
  if (cr === 0.125) return '0.125';
  if (cr === 0.25) return '0.25';
  if (cr === 0.5) return '0.5';
  return String(Math.round(cr));
}

/** Všechna podporovaná CR (vzestupně). */
export const CHALLENGE_RATINGS: readonly ChallengeRating[] = [
  0, 0.125, 0.25, 0.5,
  ...Array.from({ length: 30 }, (_, i) => i + 1),
];

/** Doporučené staty pro dané CR (DMG). Mimo rozsah → nejbližší podporované CR. */
export function crStatGuide(cr: ChallengeRating): CrStatGuide {
  const guide = CR_TABLE[crKey(cr)];
  if (guide) return guide;
  // Mimo 0–30: clampni na nejbližší okraj.
  return cr < 0 ? CR_TABLE['0']! : CR_TABLE['30']!;
}

/** XP odměna za poražení nestvůry daného CR (D&D 5e). */
export function xpForChallengeRating(cr: ChallengeRating): number {
  return crStatGuide(cr).xp;
}

/** Proficiency bonus nestvůry daného CR (D&D 5e). */
export function proficiencyForChallengeRating(cr: ChallengeRating): number {
  return crStatGuide(cr).proficiency;
}

/** Lidsky čitelná CR notace: `1/8`, `1/4`, `1/2`, jinak celé číslo. */
export function formatChallengeRating(cr: ChallengeRating): string {
  if (cr === 0.125) return '1/8';
  if (cr === 0.25) return '1/4';
  if (cr === 0.5) return '1/2';
  return String(cr);
}
