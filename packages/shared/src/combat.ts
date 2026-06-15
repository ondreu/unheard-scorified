/**
 * Deterministický idle combat engine (M5). Jediný zdroj pravdy pro boj —
 * server i klient počítají identicky.
 *
 * Návrh (viz ADR 0008):
 *  - `deriveCombatProfile` převede postavu (base staty + gear M4 + talent
 *    combat tagy M4) na `CombatActor` (HP, attack power, crit, haste, signature
 *    ability).
 *  - `simulateDungeonRun` deterministicky (přes `SeededRng`) odbojuje sekvenci
 *    nepřátel a vrátí kompletní `CombatEvent[]` timeline + výsledek.
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
/** Po kolika sekundách v jednom souboji nepřítel „enrage" (ztrojnásobí dmg). */
const ENCOUNTER_ENRAGE_SEC = 60;
/** Klid mezi souboji (sekundy) + podíl HP, který se mezi souboji doléčí. */
const REST_BETWEEN_ENCOUNTERS_SEC = 3;
const REST_HEAL_FRACTION = 0.3;
/** Minimální délka dungeon runu (aby šel sledovat). */
const MIN_RUN_SEC = 5;
/** Bezpečnostní limit iterací (determinismus, žádná nekonečná smyčka). */
const MAX_ITERATIONS = 4000;

// ── Iterativní wipe/retry (M8.5-A) ──────────────────────────────────────────
/**
 * Max počet pokusů na JEDEN encounter (1 initiální + retry). Po vyčerpání bez
 * clearu = **hard fail** (run končí, žádná útěcha). Viz ADR 0013.
 * Křivka obtížnosti: 1 → 1 → 0.95 → 0.9 → 0.85 → 0.8 → 0.75 (7 pullů), pak fail.
 */
const ENCOUNTER_ATTEMPT_CAP = 7;
/** Pokles obtížnosti za wipe (po prvním „zdarma" wipu) až k podlaze. */
const DETERMINATION_PER_WIPE = 0.05;
/** Dolní hranice zlehčení — nejlehčí obtížnost (podíl originálu). */
const DETERMINATION_FLOOR = 0.75;
/** Odměna na nejlehčí obtížnosti (FLOOR) — XP/zlato/loot až sem klesnou. */
const REWARD_FLOOR = 0.3;
/** Prodleva (s), než se postava po wipu sebere a pullne znovu. */
const REGROUP_AFTER_WIPE_SEC = 5;

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
};

/** Signature ability odemčená capstone talentem (periodický silný úder). */
export interface SignatureAbility {
  id: string;
  name: string;
  cooldownSec: number;
  damageMult: number;
}

/** Mapování capstone combat tagů na signature ability (kurátorováno). */
export const SIGNATURE_ABILITIES: Record<string, Omit<SignatureAbility, 'id'>> = {
  mortal_strike: { name: 'Mortal Strike', cooldownSec: 6, damageMult: 1.8 },
  bloodthirst: { name: 'Bloodthirst', cooldownSec: 6, damageMult: 1.6 },
  bestial_wrath: { name: 'Bestial Wrath', cooldownSec: 10, damageMult: 2.0 },
  silencing_shot: { name: 'Silencing Shot', cooldownSec: 8, damageMult: 1.7 },
  mutilate: { name: 'Mutilate', cooldownSec: 8, damageMult: 2.2 },
  blade_flurry: { name: 'Blade Flurry', cooldownSec: 10, damageMult: 1.5 },
  stormstrike: { name: 'Stormstrike', cooldownSec: 8, damageMult: 2.0 },
  thunderstorm: { name: 'Thunderstorm', cooldownSec: 12, damageMult: 2.4 },
  pyroblast_mastery: { name: 'Pyroblast', cooldownSec: 10, damageMult: 2.5 },
  chaos_bolt: { name: 'Chaos Bolt', cooldownSec: 10, damageMult: 2.5 },
  unstable_affliction: { name: 'Unstable Affliction', cooldownSec: 9, damageMult: 1.9 },
  starfall: { name: 'Starfall', cooldownSec: 12, damageMult: 2.3 },
  berserk: { name: 'Berserk', cooldownSec: 10, damageMult: 1.8 },
  repentance: { name: 'Repentance', cooldownSec: 9, damageMult: 1.6 },
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
  signatureAbilities: SignatureAbility[];
  /** Boss flag (jen pro log label u nepřátel). */
  isBoss?: boolean;
}

export type CombatEventType =
  | 'encounter_start'
  | 'attack'
  | 'ability'
  | 'heal'
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

/** Výsledek celého dungeon runu. */
export interface DungeonCombatResult {
  events: CombatEvent[];
  victory: boolean;
  /** Celková délka runu v sekundách (≥ MIN_RUN_SEC). */
  durationSec: number;
  /** Index souboje, na kterém run hard-failnul (jinak undefined). */
  defeatedAtEncounter?: number;
  /** Celkový počet wipů napříč runem (M8.5-A) — řídí škálování odměn. */
  wipes: number;
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

/** Vrátí zlehčenou kopii aktéra (×factor na HP i attack power). */
function easeActor(actor: CombatActor, factor: number): CombatActor {
  if (factor >= 1) return actor;
  return {
    ...actor,
    maxHealth: Math.max(1, Math.round(actor.maxHealth * factor)),
    attackPower: actor.attackPower * factor,
  };
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
  const abilities: SignatureAbility[] = [];

  for (const { tag, ranks } of talents.tags) {
    const eff = COMBAT_TAG_EFFECTS[tag];
    if (eff) {
      critChance += (eff.critChance ?? 0) * ranks;
      damageMult += (eff.damageMult ?? 0) * ranks;
      attackSpeed += (eff.attackSpeed ?? 0) * ranks;
      healthFlat += (eff.healthFlat ?? 0) * ranks;
      lifesteal += (eff.lifesteal ?? 0) * ranks;
    }
    const sig = SIGNATURE_ABILITIES[tag];
    if (sig) abilities.push({ id: tag, ...sig });
  }

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
  const variance = 0.85 + rng.next() * 0.3; // 0.85..1.15
  let dmg = attacker.attackPower * abilityMult * variance * (enraged ? 3 : 1);
  const crit = rng.next() < attacker.critChance;
  if (crit) dmg *= attacker.critMultiplier;
  const reduction = defender.armor > 0 ? defender.armor / (defender.armor + ARMOR_K) : 0;
  dmg *= 1 - reduction;
  return { amount: Math.max(1, Math.round(dmg)), crit };
}

/** Vnitřní stav timeru (úder nebo ability) pro událostmi řízenou simulaci. */
interface Timer {
  /** Čas dalšího spuštění (sekundy od startu runu). */
  next: number;
  interval: number;
  ability?: SignatureAbility;
}

/** Výsledek jednoho pokusu o encounter (jeden „pull"). */
interface EncounterAttemptResult {
  events: CombatEvent[];
  victory: boolean;
  /** Čas (s od startu runu) po skončení pokusu. */
  clock: number;
  /** HP postavy po skončení (0 při wipu). */
  playerHp: number;
}

/**
 * Odbojuje JEDEN pokus o encounter (postava vs jeden nepřítel) od `startClock`
 * a `startHp`. Vrací události + výsledek + koncový stav. Sdílí per-hit vzorce s
 * původní simulací (žádná duplikace).
 */
function fightEncounter(
  player: CombatActor,
  enemy: CombatActor,
  rng: SeededRng,
  startClock: number,
  startHp: number,
  attempt: number,
): EncounterAttemptResult {
  const events: CombatEvent[] = [];
  let clock = startClock;
  let playerHp = startHp;
  let enemyHp = enemy.maxHealth;
  const encounterStart = clock;
  const note = attempt > 0 ? ` (pull ${attempt + 1}, weakened)` : '';

  events.push({
    t: round1(clock),
    type: 'encounter_start',
    message: `⚔️ ${enemy.name}${enemy.isBoss ? ' (Boss)' : ''} appears!${note}`,
    target: enemy.name,
    targetHealthRemaining: enemyHp,
  });

  // Timery: úder postavy, úder nepřítele, signature abilities.
  const timers: Timer[] = [
    { next: clock + player.swingInterval, interval: player.swingInterval },
    { next: clock + enemy.swingInterval, interval: enemy.swingInterval },
    ...player.signatureAbilities.map((a) => ({
      next: clock + a.cooldownSec,
      interval: a.cooldownSec,
      ability: a,
    })),
  ];

  let iterations = 0;
  while (enemyHp > 0 && playerHp > 0 && iterations++ < MAX_ITERATIONS) {
    // Najdi nejbližší timer (deterministicky: nejmenší next, pak index).
    let idx = 0;
    for (let j = 1; j < timers.length; j++) {
      if (timers[j]!.next < timers[idx]!.next) idx = j;
    }
    const timer = timers[idx]!;
    clock = timer.next;
    timer.next += timer.interval;

    const enraged = clock - encounterStart >= ENCOUNTER_ENRAGE_SEC;
    const isEnemyTimer = idx === 1;

    if (isEnemyTimer) {
      const hit = computeHit(enemy, player, rng, 1, enraged);
      playerHp = Math.max(0, playerHp - hit.amount);
      events.push({
        t: round1(clock),
        type: 'attack',
        source: enemy.name,
        target: player.name,
        amount: hit.amount,
        crit: hit.crit,
        targetHealthRemaining: playerHp,
        message: `${enemy.name} hits ${player.name} for ${hit.amount}${hit.crit ? ' (crit!)' : ''}${enraged ? ' [enraged]' : ''}. ${player.name}: ${playerHp} HP`,
      });
    } else {
      // Úder/ability postavy.
      const ability = timer.ability;
      const hit = computeHit(player, enemy, rng, ability?.damageMult ?? 1, false);
      enemyHp = Math.max(0, enemyHp - hit.amount);
      if (player.lifesteal > 0) {
        playerHp = Math.min(player.maxHealth, playerHp + Math.round(hit.amount * player.lifesteal));
      }
      events.push({
        t: round1(clock),
        type: ability ? 'ability' : 'attack',
        source: player.name,
        target: enemy.name,
        amount: hit.amount,
        crit: hit.crit,
        ability: ability?.name,
        targetHealthRemaining: enemyHp,
        message: ability
          ? `${player.name} casts ${ability.name} on ${enemy.name} for ${hit.amount}${hit.crit ? ' (crit!)' : ''}. ${enemy.name}: ${enemyHp} HP`
          : `${player.name} hits ${enemy.name} for ${hit.amount}${hit.crit ? ' (crit!)' : ''}. ${enemy.name}: ${enemyHp} HP`,
      });
    }
  }

  if (playerHp <= 0) {
    events.push({
      t: round1(clock),
      type: 'player_defeated',
      source: enemy.name,
      target: player.name,
      message: `💀 ${player.name} was defeated by ${enemy.name}.`,
    });
    return { events, victory: false, clock, playerHp: 0 };
  }

  events.push({
    t: round1(clock),
    type: 'enemy_defeated',
    target: enemy.name,
    message: `${enemy.name} is defeated!`,
  });
  return { events, victory: true, clock, playerHp };
}

/**
 * Deterministicky odbojuje sekvenci nepřátel s **iterativním wipe/retry**
 * (M8.5-A). Každý encounter se zkouší až `ENCOUNTER_ATTEMPT_CAP`× — po wipu se
 * pullne znovu (postava na plné HP) a encounter se **zlehčí** (determination,
 * HP/dmg dolů až k `DETERMINATION_FLOOR`). Vyčištěné encountery zůstávají.
 * Vyčerpání pokusů bez clearu = **hard fail** (run končí). Vrací počet wipů
 * (řídí škálování odměn) + kompletní timeline.
 */
export function simulateDungeonRun(
  player: CombatActor,
  enemies: CombatActor[],
  seed: number,
): DungeonCombatResult {
  const rng = new SeededRng(seed);
  const events: CombatEvent[] = [];
  let clock = 0;
  let wipes = 0;
  let victory = true;
  let defeatedAtEncounter: number | undefined;
  // HP nesená mezi VYČIŠTĚNÝMI encountery (po wipu se resetuje na plnou).
  let carriedHp = player.maxHealth;

  for (let i = 0; i < enemies.length; i++) {
    const baseEnemy = enemies[i]!;
    let attempt = 0;
    let cleared = false;
    let hpAfter = carriedHp;

    while (attempt < ENCOUNTER_ATTEMPT_CAP) {
      const enemy = easeActor(baseEnemy, determinationFactor(attempt));
      // První pokus pokračuje s nesenou HP; po wipu party doběhne → plná HP.
      const startHp = attempt === 0 ? carriedHp : player.maxHealth;
      const enc = fightEncounter(player, enemy, rng, clock, startHp, attempt);
      for (const e of enc.events) events.push(e);
      clock = enc.clock;
      if (enc.victory) {
        cleared = true;
        hpAfter = enc.playerHp;
        break;
      }
      wipes++;
      attempt++;
      if (attempt < ENCOUNTER_ATTEMPT_CAP) clock += REGROUP_AFTER_WIPE_SEC;
    }

    if (!cleared) {
      victory = false;
      defeatedAtEncounter = i;
      break;
    }

    // Klid mezi vyčištěnými souboji (kromě po posledním): částečné doléčení.
    if (i < enemies.length - 1) {
      clock += REST_BETWEEN_ENCOUNTERS_SEC;
      carriedHp = Math.min(player.maxHealth, hpAfter + Math.round(player.maxHealth * REST_HEAL_FRACTION));
    }
  }

  events.push(
    victory
      ? { t: round1(clock), type: 'victory', message: '🏆 Dungeon cleared!' }
      : { t: round1(clock), type: 'defeat', message: '☠️ Dungeon run failed.' },
  );

  return {
    events,
    victory,
    durationSec: Math.max(MIN_RUN_SEC, Math.ceil(clock)),
    defeatedAtEncounter,
    wipes,
  };
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
