/**
 * D&D feat katalog (MR-2 → Level-up overhaul Slice B, ADR 0040). Feat = volba při
 * level-upu (alternativa k ASI). Oproti původnímu plochému seznamu je roster
 * **D&D-věrnější**:
 *  - **filtrování dle classy** (`classes` — martialové vidí bojové featy, casteři
 *    caster featy; `undefined` = univerzální),
 *  - **prerekvizity** (`prerequisites` — min level, min atribut, vyžaduje sesilatele),
 *  - **half-featy** (`effect.statChoice` — feat navíc dává **+1 do zvoleného atributu**,
 *    jako poloviční ASI; hráč vybere atribut z nabídky).
 *
 * Efekty recyklují combat-tag mechaniku z `combat.ts` (`COMBAT_TAG_EFFECTS`) +
 * štíty (`SHIELD_TAGS`) — jediný zdroj pravdy pro „jak volba mění postavu".
 * Prerek-check (`meetsFeatPrerequisites`) i class filtr (`featsForClass`) jsou
 * čisté funkce sdílené API↔web.
 */
import { ABILITY_SCORES, type AbilityScore } from '../character';
import type { ClassId } from './classes';

export type FeatId =
  | 'great_weapon_master'
  | 'sharpshooter'
  | 'savage_attacker'
  | 'tough'
  | 'dual_wielder'
  | 'lucky'
  | 'spell_sniper'
  | 'defensive_duelist'
  | 'athlete'
  | 'resilient'
  | 'war_caster'
  | 'mage_slayer'
  | 'blood_drinker'
  | 'polearm_master'
  | 'sentinel'
  | 'charger'
  | 'slasher'
  | 'fey_touched'
  | 'elemental_adept'
  | 'inspiring_leader';

/** Prerekvizity featu (D&D 5e). Splnění se počítá proti efektivním statům postavy. */
export interface FeatPrerequisite {
  /** Minimální level postavy. */
  minLevel?: number;
  /** Minimální skóre atributu (po progresi — ASI/featy se započítají). */
  minAbility?: { ability: AbilityScore; score: number };
  /** Vyžaduje sesilatele (casterType !== 'none'). */
  caster?: boolean;
}

export interface FeatEffect {
  /** Pevný bonus k atributu (poloviční ASI). */
  statBonus?: Partial<Record<AbilityScore, number>>;
  /** Half-feat: hráč zvolí +`amount` do jednoho z `options`. */
  statChoice?: { options: AbilityScore[]; amount: number };
  /** Flat HP bonus. */
  healthBonus?: number;
  /** Combat tagy (mapují se na `COMBAT_TAG_EFFECTS`/`SHIELD_TAGS` v enginu). */
  combatTags?: { tag: string; ranks: number }[];
}

export interface FeatDef {
  id: FeatId;
  name: string;
  description: string;
  /** Které classy feat nabízí (`undefined` = univerzální, vidí ho každá classa). */
  classes?: ClassId[];
  /** Prerekvizity (`undefined` = bez prereku). */
  prerequisites?: FeatPrerequisite;
  effect: FeatEffect;
}

// Skupiny class pro filtrování featů (D&D — martial vs caster, s hybridy v obou).
const STR_MARTIAL: ClassId[] = ['barbarian', 'fighter', 'paladin'];
const MARTIAL: ClassId[] = ['barbarian', 'fighter', 'monk', 'paladin', 'ranger', 'rogue'];
const RANGED_MARTIAL: ClassId[] = ['fighter', 'ranger', 'rogue'];
const FINESSE_MARTIAL: ClassId[] = ['bard', 'fighter', 'monk', 'ranger', 'rogue'];
const CASTERS: ClassId[] = [
  'bard',
  'cleric',
  'druid',
  'paladin',
  'ranger',
  'sorcerer',
  'warlock',
  'wizard',
];

export const FEATS: Record<FeatId, FeatDef> = {
  // ── Univerzální ────────────────────────────────────────────────────────────
  tough: {
    id: 'tough',
    name: 'Tough',
    description: 'Hardier than most — your hit point maximum increases. +Health.',
    effect: { healthBonus: 40, combatTags: [{ tag: 'hp_minor', ranks: 3 }] },
  },
  lucky: {
    id: 'lucky',
    name: 'Lucky',
    description: 'Fortune favors you, turning misses into hits. +Crit.',
    effect: { combatTags: [{ tag: 'crit_minor', ranks: 4 }] },
  },
  resilient: {
    id: 'resilient',
    name: 'Resilient (Constitution)',
    description: 'Toughen your body: +1 Constitution and a steadier hit point pool.',
    effect: { statBonus: { constitution: 1 }, healthBonus: 20 },
  },
  inspiring_leader: {
    id: 'inspiring_leader',
    name: 'Inspiring Leader',
    description: 'A rousing speech steels your allies (and yourself). +Health, absorb shield.',
    prerequisites: { minAbility: { ability: 'charisma', score: 13 } },
    effect: { combatTags: [{ tag: 'hp_minor', ranks: 2 }, { tag: 'shield_minor', ranks: 1 }] },
  },

  // ── Martial ──────────────────────────────────────────────────────────────
  great_weapon_master: {
    id: 'great_weapon_master',
    name: 'Great Weapon Master',
    description: 'Heavy swings cleave through foes. +Damage.',
    classes: STR_MARTIAL,
    prerequisites: { minAbility: { ability: 'strength', score: 13 } },
    effect: { combatTags: [{ tag: 'dmg_major', ranks: 3 }] },
  },
  sharpshooter: {
    id: 'sharpshooter',
    name: 'Sharpshooter',
    description: 'Precise ranged attacks ignore the odds. +Crit, +Damage.',
    classes: RANGED_MARTIAL,
    prerequisites: { minAbility: { ability: 'dexterity', score: 13 } },
    effect: { combatTags: [{ tag: 'crit_minor', ranks: 3 }, { tag: 'dmg_minor', ranks: 2 }] },
  },
  savage_attacker: {
    id: 'savage_attacker',
    name: 'Savage Attacker',
    description: 'You wring the most damage from every blow. +Damage.',
    classes: MARTIAL,
    effect: { combatTags: [{ tag: 'dmg_minor', ranks: 4 }] },
  },
  dual_wielder: {
    id: 'dual_wielder',
    name: 'Dual Wielder',
    description: 'A blade in each hand strikes more often. +Attack speed.',
    classes: MARTIAL,
    effect: { combatTags: [{ tag: 'haste_minor', ranks: 3 }] },
  },
  polearm_master: {
    id: 'polearm_master',
    name: 'Polearm Master',
    description: 'Reach weapons add a flurry of butt-end jabs. +Attack speed, +Damage.',
    classes: STR_MARTIAL,
    prerequisites: { minAbility: { ability: 'strength', score: 13 } },
    effect: { combatTags: [{ tag: 'haste_minor', ranks: 2 }, { tag: 'dmg_minor', ranks: 1 }] },
  },
  sentinel: {
    id: 'sentinel',
    name: 'Sentinel',
    description: 'You lock down foes and punish them for fighting on. +Damage, absorb shield.',
    classes: MARTIAL,
    effect: { combatTags: [{ tag: 'dmg_minor', ranks: 1 }, { tag: 'shield_minor', ranks: 2 }] },
  },
  charger: {
    id: 'charger',
    name: 'Charger',
    description: 'A running start turns your charge into a devastating hit. +Damage.',
    classes: MARTIAL,
    effect: { combatTags: [{ tag: 'dmg_major', ranks: 2 }] },
  },
  defensive_duelist: {
    id: 'defensive_duelist',
    name: 'Defensive Duelist',
    description: 'Parry incoming blows with a deft riposte. Absorb shield.',
    classes: FINESSE_MARTIAL,
    prerequisites: { minAbility: { ability: 'dexterity', score: 13 } },
    effect: { combatTags: [{ tag: 'shield_minor', ranks: 2 }] },
  },
  mage_slayer: {
    id: 'mage_slayer',
    name: 'Mage Slayer',
    description: 'Punish casters with relentless strikes. +Attack speed, +Damage.',
    classes: MARTIAL,
    effect: { combatTags: [{ tag: 'haste_minor', ranks: 2 }, { tag: 'dmg_minor', ranks: 1 }] },
  },
  blood_drinker: {
    id: 'blood_drinker',
    name: 'Blood Drinker',
    description: 'Your strikes leech vitality from the wounded. Lifesteal.',
    classes: ['barbarian', 'fighter', 'monk', 'rogue', 'warlock'],
    effect: { combatTags: [{ tag: 'lifesteal_minor', ranks: 3 }] },
  },

  // ── Half-featy (+1 do zvoleného atributu) ────────────────────────────────
  athlete: {
    id: 'athlete',
    name: 'Athlete',
    description: 'Peak physical conditioning. +1 Strength or Dexterity.',
    classes: MARTIAL,
    effect: { statChoice: { options: ['strength', 'dexterity'], amount: 1 } },
  },
  slasher: {
    id: 'slasher',
    name: 'Slasher',
    description: 'Cutting blows slow and weaken your prey. +1 Strength or Dexterity, +Damage.',
    classes: MARTIAL,
    effect: {
      statChoice: { options: ['strength', 'dexterity'], amount: 1 },
      combatTags: [{ tag: 'dmg_minor', ranks: 1 }],
    },
  },
  fey_touched: {
    id: 'fey_touched',
    name: 'Fey Touched',
    description: 'Fey magic sharpens your mind. +1 Intelligence, Wisdom, or Charisma, +Damage.',
    classes: CASTERS,
    prerequisites: { caster: true },
    effect: {
      statChoice: { options: ['intelligence', 'wisdom', 'charisma'], amount: 1 },
      combatTags: [{ tag: 'dmg_minor', ranks: 1 }],
    },
  },

  // ── Caster ─────────────────────────────────────────────────────────────────
  war_caster: {
    id: 'war_caster',
    name: 'War Caster',
    description: 'Cast amid the fray without flinching. +Damage, absorb shield.',
    classes: CASTERS,
    prerequisites: { caster: true },
    effect: { combatTags: [{ tag: 'dmg_minor', ranks: 2 }, { tag: 'shield_minor', ranks: 1 }] },
  },
  spell_sniper: {
    id: 'spell_sniper',
    name: 'Spell Sniper',
    description: 'Your attack spells find the mark. +Crit, +Damage.',
    classes: CASTERS,
    prerequisites: { caster: true },
    effect: { combatTags: [{ tag: 'crit_minor', ranks: 2 }, { tag: 'dmg_minor', ranks: 2 }] },
  },
  elemental_adept: {
    id: 'elemental_adept',
    name: 'Elemental Adept',
    description: 'Your spells punch through resistances with raw power. +Damage.',
    classes: CASTERS,
    prerequisites: { caster: true },
    effect: { combatTags: [{ tag: 'dmg_minor', ranks: 3 }] },
  },
};

export const FEAT_IDS = Object.keys(FEATS) as FeatId[];

export function isFeatId(value: string): value is FeatId {
  return value in FEATS;
}

/** Je feat nabízený dané class? (`classes` undefined = univerzální). */
export function isFeatForClass(feat: FeatDef, klass: ClassId): boolean {
  return feat.classes === undefined || feat.classes.includes(klass);
}

/** Featy nabízené dané class (univerzální + class-specific), v pořadí katalogu. */
export function featsForClass(klass: ClassId): FeatDef[] {
  return FEAT_IDS.map((id) => FEATS[id]).filter((f) => isFeatForClass(f, klass));
}

/** Je feat half-feat (dává volbu +1 do atributu)? */
export function isHalfFeat(feat: FeatDef): boolean {
  return feat.effect.statChoice !== undefined;
}

/** Kontext postavy pro vyhodnocení prereků featu. */
export interface FeatPrereqContext {
  level: number;
  /** Efektivní skóre atributů (base + ASI/feat progrese). */
  scores: Partial<Record<AbilityScore, number>>;
  /** Je postava sesilatel? */
  isCaster: boolean;
}

/** Splňuje postava prerekvizity featu? */
export function meetsFeatPrerequisites(feat: FeatDef, ctx: FeatPrereqContext): boolean {
  const pre = feat.prerequisites;
  if (!pre) return true;
  if (pre.minLevel !== undefined && ctx.level < pre.minLevel) return false;
  if (pre.caster && !ctx.isCaster) return false;
  if (pre.minAbility) {
    const score = ctx.scores[pre.minAbility.ability] ?? 0;
    if (score < pre.minAbility.score) return false;
  }
  return true;
}

/** Lidsky čitelný popis prereků (pro UI). Prázdný řetězec = bez prereku. */
export function featPrerequisiteLabel(feat: FeatDef): string {
  const pre = feat.prerequisites;
  if (!pre) return '';
  const parts: string[] = [];
  if (pre.minLevel !== undefined) parts.push(`Level ${pre.minLevel}+`);
  if (pre.minAbility) {
    const abbr = pre.minAbility.ability.slice(0, 3).toUpperCase();
    parts.push(`${abbr} ${pre.minAbility.score}+`);
  }
  if (pre.caster) parts.push('Spellcaster');
  return parts.join(', ');
}

/** Je zvolený atribut platný pro half-feat (musí být z `options`)? Pro ne-half-feat → true (volba se ignoruje). */
export function isValidFeatAbilityChoice(feat: FeatDef, ability: AbilityScore | undefined): boolean {
  const choice = feat.effect.statChoice;
  if (!choice) return true; // ne-half-feat: abilityChoice je irelevantní
  if (ability === undefined) return false;
  return choice.options.includes(ability);
}

/** Bezpečnostní guard: je `value` validní AbilityScore? */
export function isAbilityScore(value: string): value is AbilityScore {
  return (ABILITY_SCORES as readonly string[]).includes(value);
}
