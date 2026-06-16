/**
 * Deterministický idle combat engine (M5). Jediný zdroj pravdy pro boj —
 * server i klient počítají identicky.
 *
 * Návrh (viz ADR 0008):
 *  - `deriveCombatProfile` převede postavu (base staty + gear M4 + talent
 *    combat tagy M4) na `CombatActor` (HP, attack power, crit, haste, signature
 *    ability).
 *  - `computeHit` je sdílený per-hit vzorec; group PVE run (`simulateRaidRun`),
 *    dungeony i PVP (`simulatePvpDuel`) na něm staví — žádná duplikace.
 *  - „Živý" log je jen odhalování předpočítaného timeline podle uplynulého času
 *    (žádný per-process stav → stateless, škálovatelné).
 *
 * Veškerá náhoda jen přes `SeededRng` (anti-cheat, reprodukovatelnost).
 */
import { SeededRng } from './rng';
import type { PrimaryStat, PrimaryStats } from './character';
import { CLASSES, type ClassId } from './data/classes';
import type { ItemStats } from './data/items';
import type { AggregatedTalentEffects } from './data/talents';
import { SHIELD_TAGS, resolveAbilities, type SignatureAbility } from './data/abilities';
import type { CharacterRotation } from './rotation';

export type { AbilityKind, SignatureAbility, BaselineAbility } from './data/abilities';
export { SIGNATURE_ABILITIES, SHIELD_TAGS, CLASS_BASELINE_ABILITIES, resolveAbilities, abilityDamageMult } from './data/abilities';

// ── Bojové konstanty (laditelný balanc, vyladí se v M9) ─────────────────────

/** Základní interval mezi údery v sekundách (před haste). */
const BASE_SWING_INTERVAL = 2.4;
/** Základní crit šance (5 %). */
const BASE_CRIT_CHANCE = 0.05;
/** Crit násobek poškození. */
const CRIT_MULTIPLIER = 2;
/** Strop crit šance. */
const MAX_CRIT_CHANCE = 0.6;
/** Konstanta pro armor mitigaci: reduction = armor / (armor + K). */
const ARMOR_K = 400;

// ── Iterativní wipe/retry (M8.5-A) — sdílená křivka obtížnosti s raid enginem ─
/** Pokles obtížnosti za wipe (po prvním „zdarma" wipu) až k podlaze. */
const DETERMINATION_PER_WIPE = 0.05;
/** Dolní hranice zlehčení — nejlehčí obtížnost (podíl originálu). */
const DETERMINATION_FLOOR = 0.75;
/** Odměna na nejlehčí obtížnosti (FLOOR) — XP/zlato/loot až sem klesnou. */
const REWARD_FLOOR = 0.3;

// ── Combat tag → mechanika (kurátorováno; nenamapované tagy = no-op) ─────────

/** Dopad jednoho ranku combat tagu na bojový profil. */
interface TagEffect {
  /** Aditivní crit šance za rank. */
  critChance?: number;
  /** Aditivní damage multiplier za rank (0.03 = +3 %). */
  damageMult?: number;
  /** Aditivní haste za rank (0.05 = +5 % rychlejší údery). */
  attackSpeed?: number;
  /** Flat HP za rank. */
  healthFlat?: number;
  /** Lifesteal (podíl uděleného poškození vyléčen) za rank. */
  lifesteal?: number;
}

/** Per-rank efekty combat tagů z talentů (M4). */
export const COMBAT_TAG_EFFECTS: Record<string, TagEffect> = {
  cruelty: { critChance: 0.01 },
  malice: { critChance: 0.01 },
  lethal_shots: { critChance: 0.01 },
  devastation: { critChance: 0.01 },
  incinerate: { critChance: 0.01 },
  weapon_expertise: { damageMult: 0.02 },
  concussion: { damageMult: 0.01 },
  shadow_mastery: { damageMult: 0.02 },
  ignite: { damageMult: 0.01 },
  deep_wounds: { damageMult: 0.01 },
  improved_rend: { damageMult: 0.01 },
  vengeance: { damageMult: 0.01 },
  flurry: { attackSpeed: 0.05 },
  toughness: { healthFlat: 12 },
  bloodthirst: { lifesteal: 0.1 },
  vampiric_embrace: { lifesteal: 0.08 },
  // Generické laditelné efekty pro talent overhaul (jméno talentu = flavor,
  // tag = mechanika; sdílené napříč classami).
  crit_minor: { critChance: 0.01 },
  dmg_minor: { damageMult: 0.01 },
  dmg_major: { damageMult: 0.02 },
  haste_minor: { attackSpeed: 0.03 },
  hp_minor: { healthFlat: 12 },
  lifesteal_minor: { lifesteal: 0.04 },
};

/**
 * Lidsky čitelné názvy tagů poskytujících lifesteal — pro combat-log label
 * pasivního leeche („…and heals for N (from Bloodthirst)"). Tag id → flavor.
 */
export const LIFESTEAL_TAG_LABELS: Record<string, string> = {
  bloodthirst: 'Bloodthirst',
  vampiric_embrace: 'Vampiric Embrace',
  lifesteal_minor: 'Lifesteal',
};

// ── Typy aktérů a událostí ──────────────────────────────────────────────────

/** Bojový aktér (postava nebo nepřítel). Plně serializovatelný (snapshot). */
export interface CombatActor {
  name: string;
  maxHealth: number;
  /** Základní poškození na úder (před variancí/critem/armorem). */
  attackPower: number;
  /** Interval mezi údery v sekundách. */
  swingInterval: number;
  /** Crit šance 0..1. */
  critChance: number;
  /** Crit násobek. */
  critMultiplier: number;
  /** Armor (mitigace příchozího poškození). */
  armor: number;
  /** Lifesteal — podíl uděleného poškození, který aktéra vyléčí. */
  lifesteal: number;
  /**
   * Lidsky čitelný zdroj pasivního lifestealu (label tagu, který přispívá
   * nejvíc) — pro combat log u pasivního leeche bez named ability. `undefined`
   * = bez lifestealu nebo nepřítel.
   */
  lifestealSource?: string;
  /** Absorpční štít (pohlcuje příchozí poškození, než se vyčerpá). 0 = bez štítu. */
  shield: number;
  signatureAbilities: SignatureAbility[];
  /**
   * Deklarativní rotace (MIL) — řídí, zda/kdy se signature ability sešle.
   * `undefined` = default „always" (zpětně kompatibilní). Součást snapshotu.
   */
  rotation?: CharacterRotation;
  /** Boss flag (jen pro log label u nepřátel). */
  isBoss?: boolean;
}

export type CombatEventType =
  | 'encounter_start'
  | 'attack'
  | 'ability'
  | 'heal'
  | 'drain'
  | 'dot'
  | 'absorb'
  | 'enemy_defeated'
  | 'player_defeated'
  | 'victory'
  | 'defeat';

/** Jedna událost v bojovém logu (čas relativně ke startu runu). */
export interface CombatEvent {
  /** Sekundy od startu dungeon runu. */
  t: number;
  type: CombatEventType;
  /** Hotový anglický log řádek (game language = EN). */
  message: string;
  source?: string;
  target?: string;
  amount?: number;
  crit?: boolean;
  ability?: string;
  /** HP cíle po zásahu. */
  targetHealthRemaining?: number;
}


/**
 * Zlehčení encounteru po `attempt` wipech (HP i dmg ×factor). První wipe je
 * „zdarma" (obtížnost 1.0 → 1.0), pak klesá o `DETERMINATION_PER_WIPE` za wipe
 * až k `DETERMINATION_FLOOR`: 1 → 1 → 0.95 → 0.9 → 0.85 → 0.8 → 0.75. Exportováno,
 * aby raid (party-vs-boss) sdílel identickou křivku (žádná duplikace).
 */
export function determinationFactor(attempt: number): number {
  return Math.max(DETERMINATION_FLOOR, 1 - DETERMINATION_PER_WIPE * Math.max(0, attempt - 1));
}

/**
 * Násobitel odměny (XP/zlato/loot-šance) podle počtu wipů (M8.5-A). **Sleduje
 * obtížnost**: mapuje determination `[FLOOR..1]` lineárně na odměnu
 * `[REWARD_FLOOR..1]`. 0–1 wipe = plná odměna (1.0), pak klesá až k `REWARD_FLOOR`
 * (0.3) na nejlehčí obtížnosti. Hard fail (run nevyčistěn) řeší volající = 0
 * (žádná útěcha).
 */
export function wipeRewardMultiplier(wipes: number): number {
  const d = determinationFactor(Math.max(0, wipes));
  const t = (d - DETERMINATION_FLOOR) / (1 - DETERMINATION_FLOOR);
  return REWARD_FLOOR + t * (1 - REWARD_FLOOR);
}

// ── Odvození bojového profilu postavy ───────────────────────────────────────

export interface CombatProfileInput {
  name: string;
  level: number;
  klass: ClassId;
  /** Base primární staty (rasa + classa + level). */
  primary: PrimaryStats;
  /** Sečtené staty z equipnutého gearu (M4). */
  equipment: ItemStats;
  /** Agregované talent efekty (M4) — stat bonusy + combat tagy. */
  talents: AggregatedTalentEffects;
}

/**
 * Převede postavu na `CombatActor`. Spojuje base staty + gear (M4) + talenty
 * (M4): stat bonusy zvyšují efektivní staty, combat tagy mění crit/haste/damage/
 * lifesteal a capstone tagy odemykají signature ability.
 */
export function deriveCombatProfile(input: CombatProfileInput): CombatActor {
  const { level, klass, primary, equipment, talents } = input;
  const primaryStat: PrimaryStat = CLASSES[klass].primaryStat;

  const stat = (key: PrimaryStat): number =>
    primary[key] + (equipment[key] ?? 0) + (talents.statBonus[key] ?? 0);

  const effPrimary = stat(primaryStat);
  const effStamina = stat('stamina');
  const weaponPower = (equipment.attack_power ?? 0) + (equipment.spell_power ?? 0);

  // Modifikátory z combat tagů.
  let critChance = BASE_CRIT_CHANCE + (equipment.crit_rating ?? 0) * 0.002;
  let damageMult = 1;
  let attackSpeed = 0;
  let healthFlat = 0;
  let lifesteal = 0;
  let shieldMult = 0;
  // Sleduj tag, který přispívá nejvíc lifestealu → label pro combat log.
  let topLifestealContribution = 0;
  let lifestealSource: string | undefined;

  for (const { tag, ranks } of talents.tags) {
    const eff = COMBAT_TAG_EFFECTS[tag];
    if (eff) {
      critChance += (eff.critChance ?? 0) * ranks;
      damageMult += (eff.damageMult ?? 0) * ranks;
      attackSpeed += (eff.attackSpeed ?? 0) * ranks;
      healthFlat += (eff.healthFlat ?? 0) * ranks;
      const contribution = (eff.lifesteal ?? 0) * ranks;
      lifesteal += contribution;
      const label = LIFESTEAL_TAG_LABELS[tag];
      if (label && contribution > topLifestealContribution) {
        topLifestealContribution = contribution;
        lifestealSource = label;
      }
    }
    shieldMult += (SHIELD_TAGS[tag] ?? 0) * ranks;
  }

  // Abilit kit = baseline (level) + capstone (talent) — jediný zdroj pravdy.
  const abilities = resolveAbilities(klass, level, talents.tags);

  const attackPower = (4 + effPrimary * 0.9 + level * 0.8 + weaponPower) * damageMult;
  const maxHealth = Math.round(
    40 + effStamina * 8 + level * 6 + talents.healthBonus + healthFlat,
  );

  return {
    name: input.name,
    maxHealth,
    attackPower,
    swingInterval: BASE_SWING_INTERVAL / (1 + attackSpeed),
    critChance: Math.min(MAX_CRIT_CHANCE, critChance),
    critMultiplier: CRIT_MULTIPLIER,
    armor: equipment.armor ?? 0,
    lifesteal,
    lifestealSource,
    shield: Math.round(shieldMult * (level * 6 + effStamina * 2)),
    signatureAbilities: abilities,
  };
}

/** Staty nepřítele (statická data dungeonu). */
export interface EnemyStats {
  name: string;
  maxHealth: number;
  attackPower: number;
  swingInterval: number;
  armor?: number;
  isBoss?: boolean;
}

/** Postaví `CombatActor` nepřítele (bez talentů/lifestealu). */
export function buildEnemyActor(def: EnemyStats): CombatActor {
  return {
    name: def.name,
    maxHealth: def.maxHealth,
    attackPower: def.attackPower,
    swingInterval: def.swingInterval,
    critChance: BASE_CRIT_CHANCE,
    critMultiplier: CRIT_MULTIPLIER,
    armor: def.armor ?? 0,
    lifesteal: 0,
    shield: 0,
    signatureAbilities: [],
    isBoss: def.isBoss ?? false,
  };
}

// ── Simulace ────────────────────────────────────────────────────────────────

export interface HitResult {
  amount: number;
  crit: boolean;
}

/**
 * Spočítá poškození jednoho zásahu (variance + crit + armor mitigace).
 * Exportováno, aby PVP duel (M7) počítal zásahy identicky jako PVE (žádná
 * duplikace bojových vzorců — viz CLAUDE.md).
 */
export function computeHit(
  attacker: CombatActor,
  defender: CombatActor,
  rng: SeededRng,
  abilityMult: number,
  enraged: boolean,
): HitResult {
  // Drobná náhoda (MIL): širší rozptyl než dřív (0.85..1.15), pořád seedovaně
  // reprodukovatelné a se stejným průměrem (symetrické okolo 1.0) → balanc
  // (DPS pásma z balance passů) zůstává neporušen, fighty jen méně předvídatelné.
  const variance = 0.8 + rng.next() * 0.4; // 0.8..1.2
  let dmg = attacker.attackPower * abilityMult * variance * (enraged ? 3 : 1);
  const crit = rng.next() < attacker.critChance;
  if (crit) dmg *= attacker.critMultiplier;
  const reduction = defender.armor > 0 ? defender.armor / (defender.armor + ARMOR_K) : 0;
  dmg *= 1 - reduction;
  return { amount: Math.max(1, Math.round(dmg)), crit };
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Výsledek pohlcení poškození absorpčním štítem. */
export interface AbsorbResult {
  /** Poškození, které projde do HP po odečtení štítu. */
  netDamage: number;
  /** Kolik štít pohltil. */
  absorbed: number;
  /** Zbývající štít. */
  shieldRemaining: number;
}

/**
 * Aplikuje absorpční štít na příchozí poškození (sdílené napříč PVE i PVP, aby
 * se mechanika nepočítala dvakrát). Štít se nedoplňuje — jen ubývá.
 */
export function applyAbsorb(rawDamage: number, shieldRemaining: number): AbsorbResult {
  const absorbed = Math.max(0, Math.min(shieldRemaining, rawDamage));
  return { netDamage: rawDamage - absorbed, absorbed, shieldRemaining: shieldRemaining - absorbed };
}

/** Vstup pro `buildAttackMessage` — jeden zásah včetně volitelného lifestealu. */
export interface AttackMessageInput {
  /** Útočník (kvůli `lifestealSource` u pasivního leeche). */
  attacker: Pick<CombatActor, 'name' | 'lifestealSource'>;
  targetName: string;
  amount: number;
  crit: boolean;
  /** Vyléčeno lifestealem (0 = bez leeche). */
  healed: number;
  /** Jméno aktivní ability (named source). `undefined` = základní úder / pasiva. */
  abilityName?: string;
  /** Doplněk za hlavní větu (např. ` [rampage]. Target: 42 HP`). */
  suffix: string;
}

/**
 * Sestaví anglický combat-log řádek pro útok. Jednotná logika napříč PVE i PVP,
 * aby lifesteal log obsahoval VŽDY i jméno ability i číslo vyléčení (žádná
 * duplikace formátování). Formáty:
 * - aktivní ability + lifesteal: `🩸 A hits B with Ability for N (crit!), healing for M.{suffix}`
 * - pasivní lifesteal:           `🩸 A hits B for N (crit!) and heals for M (from Source).{suffix}`
 * - aktivní ability bez leeche:  `A casts Ability on B for N (crit!).{suffix}`
 * - prostý úder:                 `A hits B for N (crit!).{suffix}`
 */
export function buildAttackMessage(input: AttackMessageInput): string {
  const { attacker, targetName, amount, crit, healed, abilityName, suffix } = input;
  const critTag = crit ? ' (crit!)' : '';
  if (healed > 0) {
    if (abilityName) {
      return `🩸 ${attacker.name} hits ${targetName} with ${abilityName} for ${amount}${critTag}, healing for ${healed}${suffix}`;
    }
    const source = attacker.lifestealSource ? ` (from ${attacker.lifestealSource})` : '';
    return `🩸 ${attacker.name} hits ${targetName} for ${amount}${critTag} and heals for ${healed}${source}${suffix}`;
  }
  if (abilityName) {
    return `${attacker.name} casts ${abilityName} on ${targetName} for ${amount}${critTag}${suffix}`;
  }
  return `${attacker.name} hits ${targetName} for ${amount}${critTag}${suffix}`;
}
