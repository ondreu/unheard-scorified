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
import { abilityModifier, proficiencyBonus, type AbilityScore, type AbilityScores } from './character';
import { CLASSES, type ClassId, type SubclassId } from './data/classes';
import { spellSlotsFor, type SpellSlots } from './data/spell-slots';
import { attackHits, diceNotation, rollAttack, rollDice, type AttackRoll, type DiceRoll, type DiceSpec } from './dice';
import type { ItemStats } from './data/items';
import type { ProgressionEffects } from './levelup';
import { SHIELD_TAGS, resolveAbilities, type SignatureAbility } from './data/abilities';
import {
  applyDamageInteraction,
  crForContentLevel,
  crStatGuide,
  damageInteraction,
  type ChallengeRating,
  type DamageInteraction,
  type DamageType,
} from './data/damage';
import type { CharacterRotation } from './rotation';

export type { AbilityKind, SignatureAbility, BaselineAbility } from './data/abilities';
export { SIGNATURE_ABILITIES, SUBCLASS_ABILITIES, SHIELD_TAGS, CLASS_BASELINE_ABILITIES, resolveAbilities, abilityDamageMult } from './data/abilities';

// ── Bojové konstanty (laditelný balanc, vyladí se v M9) ─────────────────────

/** Základní interval mezi údery v sekundách (před haste). */
const BASE_SWING_INTERVAL = 2.4;
/** Základní crit šance (5 %). */
const BASE_CRIT_CHANCE = 0.05;
/** Crit násobek poškození. */
const CRIT_MULTIPLIER = 2;
/** Strop crit šance. */
const MAX_CRIT_CHANCE = 0.6;

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
  // ── D&D dice-roll combat (MR-5) — volitelné, doplňují continuous model ──────
  /** Armor Class — cíl hodu na zásah (d20 + attackBonus vs AC). */
  armorClass?: number;
  /** Útočný bonus k d20 hodu na zásah (proficiency + atribut). */
  attackBonus?: number;
  /** Flat bonus k poškození (modifikátor primárního atributu). */
  damageBonus?: number;
  /** Save modifikátory per atribut (záchranné hody). */
  saveMods?: Partial<Record<AbilityScore, number>>;
  /** Spell save DC — DC záchranných hodů proti kouzlům tohoto aktéra. */
  spellSaveDc?: number;
  // ── D&D bestiář (MR-7) — typové poškození a obrany ─────────────────────────
  /** Typ poškození základního útoku aktéra. `undefined` = fyzické (bludgeoning). */
  damageType?: DamageType;
  /** Typy poškození, vůči kterým má aktér resistance (×0.5). */
  resistances?: readonly DamageType[];
  /** Typy poškození, vůči kterým je aktér vulnerable (×2). */
  vulnerabilities?: readonly DamageType[];
  /** Typy poškození, vůči kterým je aktér immune (×0). */
  immunities?: readonly DamageType[];
  /** Max spell sloty (MR-4) — rozpočet kouzel v rámci jednoho běhu (snapshot). */
  spellSlots?: SpellSlots;
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
  /** Zvolená subclass (odemyká subclass signature ability). */
  subclass?: SubclassId | null;
  /** Base atributy (rasa + classa + level). */
  primary: AbilityScores;
  /** Sečtené staty z equipnutého gearu (M4). */
  equipment: ItemStats;
  /** Agregované D&D level-up efekty (ASI/Feat) — stat bonusy + combat tagy. */
  progression: ProgressionEffects;
}

/**
 * Převede postavu na `CombatActor`. Spojuje base staty + gear (M4) + D&D level-up
 * progresi (MR-2): stat bonusy (ASI/Feat) zvyšují efektivní staty, feat combat
 * tagy mění crit/haste/damage/lifesteal, class+subclass+level odemykají abilit kit.
 */
export function deriveCombatProfile(input: CombatProfileInput): CombatActor {
  const { level, klass, subclass, primary, equipment, progression } = input;
  const primaryStat: AbilityScore = CLASSES[klass].primaryStat;

  const stat = (key: AbilityScore): number =>
    primary[key] + (equipment[key] ?? 0) + (progression.statBonus[key] ?? 0);

  const effPrimary = stat(primaryStat);
  const effStamina = stat('constitution');
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

  for (const { tag, ranks } of progression.tags) {
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

  // Abilit kit = class kit (level) + subclass signature — jediný zdroj pravdy.
  const abilities = resolveAbilities(klass, subclass, level);

  const attackPower = (4 + effPrimary * 0.9 + level * 0.8 + weaponPower) * damageMult;
  const maxHealth = Math.round(
    40 + effStamina * 8 + level * 6 + progression.healthBonus + healthFlat,
  );

  // D&D dice-roll staty (MR-5) — odvozené z efektivních atributů dle D&D 5e.
  const prof = proficiencyBonus(level);
  const dexMod = abilityModifier(stat('dexterity'));
  const primaryMod = abilityModifier(effPrimary);
  const castingMod = abilityModifier(stat(CLASSES[klass].spellcastingAbility));
  // Gear armor → drobný AC bonus (plný AC redesign = MR-10).
  const armorAcBonus = Math.floor((equipment.armor ?? 0) / 50);
  const saveMods: Partial<Record<AbilityScore, number>> = {
    strength: abilityModifier(stat('strength')),
    dexterity: dexMod,
    constitution: abilityModifier(stat('constitution')),
    intelligence: abilityModifier(stat('intelligence')),
    wisdom: abilityModifier(stat('wisdom')),
    charisma: abilityModifier(stat('charisma')),
  };

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
    armorClass: 10 + dexMod + armorAcBonus,
    attackBonus: prof + primaryMod,
    damageBonus: Math.max(0, primaryMod),
    saveMods,
    spellSaveDc: 8 + prof + castingMod,
    spellSlots: spellSlotsFor(klass, level),
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
  // ── D&D dice-roll combat (MR-5) — volitelné ────────────────────────────────
  /**
   * Úroveň obsahu (pro odvození AC/attackBonus, když nejsou dané explicitně).
   * Mapuje se na Challenge Rating přes `crForContentLevel` (MR-10).
   */
  level?: number;
  /**
   * Explicitní Challenge Rating nepřítele (přebije odvození z `level`). Když
   * chybí, odvodí se z `level` (+boss). Řídí AC/attackBonus/spell save DC z
   * `crStatGuide` (DMG). HP/poškození (idle pacing) zůstávají autorská data.
   */
  challengeRating?: ChallengeRating;
  /** Armor Class nepřítele. */
  armorClass?: number;
  /** Útočný bonus k d20 hodu na zásah. */
  attackBonus?: number;
  /** Flat bonus k poškození. */
  damageBonus?: number;
  /** Spell save DC speciálních útoků (saving throw cíle). */
  spellSaveDc?: number;
  // ── D&D bestiář (MR-7) — typové poškození a obrany ─────────────────────────
  /** Typ poškození základního útoku. `undefined` = fyzické (bludgeoning). */
  damageType?: DamageType;
  /** Resistance vůči typům poškození (×0.5). */
  resistances?: readonly DamageType[];
  /** Vulnerability vůči typům poškození (×2). */
  vulnerabilities?: readonly DamageType[];
  /** Immunity vůči typům poškození (×0). */
  immunities?: readonly DamageType[];
}

/**
 * Odvodí Challenge Rating nepřítele: explicitní `challengeRating` → jinak z
 * `level` (+boss) přes `crForContentLevel` → jinak konzervativní default
 * (úroveň 5), aby dice-roll combat (MR-5) fungoval i pro legacy data bez levelu.
 */
function enemyChallengeRating(def: EnemyStats, isBoss: boolean): ChallengeRating {
  if (def.challengeRating != null) return def.challengeRating;
  return crForContentLevel(def.level ?? 5, isBoss);
}

/** Postaví `CombatActor` nepřítele (bez talentů/lifestealu). */
export function buildEnemyActor(def: EnemyStats): CombatActor {
  const isBoss = def.isBoss ?? false;
  // AC/attackBonus/save DC: explicitní → jinak z Challenge Ratingu (DMG tabulka,
  // `crStatGuide`). CR se odvodí z `challengeRating` nebo `level` (MR-10).
  const guide = crStatGuide(enemyChallengeRating(def, isBoss));
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
    armorClass: def.armorClass ?? guide.armorClass,
    attackBonus: def.attackBonus ?? guide.attackBonus,
    damageBonus: def.damageBonus,
    spellSaveDc: def.spellSaveDc ?? guide.saveDc,
    damageType: def.damageType,
    resistances: def.resistances,
    vulnerabilities: def.vulnerabilities,
    immunities: def.immunities,
    signatureAbilities: [],
    isBoss,
  };
}

// ── D&D dice-roll resolution (MR-5) — sdílené napříč všemi simulátory ─────────

/** Armor Class aktéra (fallback z continuous armoru, když AC chybí). */
export function actorAc(actor: CombatActor): number {
  if (actor.armorClass != null) return actor.armorClass;
  return 10 + Math.floor((actor.armor ?? 0) / 50);
}

/** Útočný bonus aktéra (fallback ~ odvozený z attackPower, když chybí). */
export function actorAttackBonus(actor: CombatActor): number {
  if (actor.attackBonus != null) return actor.attackBonus;
  return Math.max(0, Math.round(Math.sqrt(Math.max(0, actor.attackPower))));
}

/** Save modifikátor aktéra pro daný atribut (0, když není znám). */
export function actorSaveMod(actor: CombatActor, ability: AbilityScore): number {
  return actor.saveMods?.[ability] ?? 0;
}

/** Spell save DC aktéra (fallback 10, když nedefinováno). */
export function actorSpellSaveDc(actor: CombatActor): number {
  return actor.spellSaveDc ?? 10;
}

/**
 * Damage dice aktéra — `count`d6 + `bonus` kalibrované tak, aby **průměr ≈
 * `attackPower`** (NdX redesign per zbraň/kouzlo = MR-10). Crit zdvojnásobí
 * `count` (D&D: kostky, ne bonus).
 */
export function weaponDamageSpec(actor: CombatActor, crit = false): DiceSpec {
  const ap = Math.max(1, actor.attackPower);
  const count = Math.max(1, Math.min(12, Math.round(ap / 7)));
  const bonus = Math.max(0, Math.round(ap - count * 3.5));
  return { count: crit ? count * 2 : count, sides: 6, bonus };
}

/** Výsledek jednoho hodu na zásah + poškození (D&D dice-roll). */
export interface HitResult {
  /** Výsledné poškození (0 při miss). */
  amount: number;
  /** Crit (přirozená 20)? */
  crit: boolean;
  /** Zasáhl útok (d20 + attackBonus vs AC)? */
  hit: boolean;
  /** Hod na zásah (natural / modifier / total). */
  roll: AttackRoll;
  /** AC cíle, proti které se házelo. */
  targetAc: number;
  /** Hod na poškození (jen při zásahu). */
  damage?: DiceRoll;
  /** Notace kostek poškození pro log (např. `5d6+18`). */
  damageNotation?: string;
  // ── D&D bestiář (MR-7) — typové poškození (engine je vždy nastaví) ──────────
  /** Typ poškození tohoto útoku (fyzické default = bludgeoning). */
  damageType?: DamageType;
  /** Interakce s obranami cíle (resist/vuln/immune) — řídí finální `amount`. */
  damageInteraction?: DamageInteraction;
}

/**
 * Damage typ útoku: explicitní override (ability) → jinak default útok aktéra
 * → jinak fyzické (bludgeoning). Bestiář (MR-7) tak může mít typové útoky a
 * cíle resistance/vulnerability/immunity.
 */
function attackDamageType(attacker: CombatActor, override?: DamageType): DamageType {
  return override ?? attacker.damageType ?? 'bludgeoning';
}

/** Společné jádro hodu na zásah (d20 + attackBonus vs AC → damage dice → obrany). */
function rollHit(
  attacker: CombatActor,
  defender: CombatActor,
  rng: SeededRng,
  abilityMult: number,
  autoHit: boolean,
  enraged: boolean,
  damageTypeOverride?: DamageType,
): HitResult {
  const targetAc = actorAc(defender);
  const damageType = attackDamageType(attacker, damageTypeOverride);
  const roll = rollAttack(rng, actorAttackBonus(attacker));
  const hit = autoHit || attackHits(roll, targetAc);
  if (!hit) {
    return { amount: 0, crit: false, hit: false, roll, targetAc, damageType, damageInteraction: 'normal' };
  }
  const crit = roll.isCrit;
  const spec = weaponDamageSpec(attacker, crit);
  const damage = rollDice(rng, spec.count, spec.sides);
  const raw = Math.round((damage.total + spec.bonus) * abilityMult * (enraged ? 3 : 1));
  // Resistance / vulnerability / immunity (MR-7): immune ruší poškození úplně,
  // jinak min. 1 (chip damage). Mechanika je živá ve všech simulátorech (sdílené
  // jádro rollHit).
  const interaction = damageInteraction(damageType, defender);
  const modified = applyDamageInteraction(Math.max(1, raw), interaction);
  const amount = interaction === 'immune' ? 0 : Math.max(1, modified);
  return {
    amount,
    crit,
    hit: true,
    roll,
    targetAc,
    damage,
    damageNotation: diceNotation(spec),
    damageType,
    damageInteraction: interaction,
  };
}

/**
 * Hod na zásah jednoho útoku (D&D 5e): d20 + attackBonus vs AC → hit/miss; nat 20
 * = crit (zdvojené damage dice), nat 1 = miss. Poškození = damage dice ×
 * `abilityMult` × (enraged ? 3 : 1). **Sdílený zdroj pravdy** pro všechny
 * simulátory (quest/dungeon/raid/PVP/Gauntlet) — žádná duplikace per-hit vzorců.
 * Miss vrací `amount: 0`. Balanc (CR-based čísla) = MR-10.
 */
export function computeHit(
  attacker: CombatActor,
  defender: CombatActor,
  rng: SeededRng,
  abilityMult: number,
  enraged: boolean,
  damageType?: DamageType,
): HitResult {
  return rollHit(attacker, defender, rng, abilityMult, false, enraged, damageType);
}

export interface ResolveAttackOpts {
  /** Násobek poškození ability (1 = základní úder). */
  abilityMult?: number;
  /** Automatický zásah (ignoruje hod na AC) — pro „nelze minout" efekty. */
  autoHit?: boolean;
  /** Typ poškození útoku (ability) — přepíše default útok aktéra (MR-7). */
  damageType?: DamageType;
}

/**
 * Vyřeší jeden útok s volbami (abilityMult, autoHit, damageType). Tenký wrapper
 * nad sdíleným jádrem `rollHit` — používá ho quest combat (MR-5). Vrací `HitResult`.
 */
export function resolveAttack(
  attacker: CombatActor,
  defender: CombatActor,
  rng: SeededRng,
  opts: ResolveAttackOpts = {},
): HitResult {
  return rollHit(
    attacker,
    defender,
    rng,
    opts.abilityMult ?? 1,
    opts.autoHit ?? false,
    false,
    opts.damageType,
  );
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
