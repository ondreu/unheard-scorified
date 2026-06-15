/**
 * Raid combat (M8, MP PVE). Recykluje deterministický combat engine z M5
 * (`computeHit`, `CombatActor`, `CombatEvent`) — žádná duplikace bojových vzorců
 * (viz CLAUDE.md). Na rozdíl od dungeonu (1 postava vs sekvence nepřátel) je raid
 * **party N aktérů s rolemi vs boss** (víc aktérů na straně hráčů).
 *
 * Role (rozhodnutí PM, MVP 5 hráčů = 1 tank / 1 heal / 3 dps):
 *  - `tank`   — víc HP, míň dmg, na něj boss útočí (a bere zmírněné poškození).
 *  - `healer` — léčí nejzraněnějšího spoluhráče místo útoku; minimální vlastní dmg.
 *  - `dps`    — plné poškození bossovi.
 *
 * Boss útočí na tanka (první živý tank, jinak nejodolnější živý člen jako off-tank),
 * po `RAID_ENRAGE_SEC` „enrage" (eskalace dmg → konečné rozhodnutí). Když padne celá
 * party = wipe (defeat). Mezi bossy se party částečně doléčí.
 *
 * Veškerá náhoda jen přes `SeededRng` (anti-cheat, reprodukovatelnost). Viz ADR 0011.
 */
import { SeededRng } from './rng';
import {
  computeHit,
  round1,
  type CombatActor,
  type CombatEvent,
  type SignatureAbility,
} from './combat';

export type RaidRole = 'tank' | 'healer' | 'dps';

export const RAID_ROLES: RaidRole[] = ['tank', 'healer', 'dps'];

export function isRaidRole(value: string): value is RaidRole {
  return RAID_ROLES.includes(value as RaidRole);
}

/** Složení party (počet aktérů per role). Součet = velikost raidu. */
export interface RaidComposition {
  tank: number;
  healer: number;
  dps: number;
}

/** Podporované velikosti raidu (modern-WoW styl): 5 / 10 / 20 hráčů. */
export const RAID_SIZES = [5, 10, 20] as const;
export type RaidSize = (typeof RAID_SIZES)[number];

/** Základní (canonical) velikost pro škálování bossů. */
export const RAID_BASE_SIZE = 5;

export function isRaidSize(value: number): value is RaidSize {
  return (RAID_SIZES as readonly number[]).includes(value);
}

/** Default kompozice per velikost (klasický poměr ~1 healer na 4-5, 2 tanky výš). */
const DEFAULT_COMPOSITIONS: Record<number, RaidComposition> = {
  5: { tank: 1, healer: 1, dps: 3 },
  10: { tank: 2, healer: 2, dps: 6 },
  20: { tank: 2, healer: 5, dps: 13 },
};

/** Default kompozice pro danou velikost (fallback proporčně pro nestandardní). */
export function defaultRaidComposition(size: number): RaidComposition {
  const preset = DEFAULT_COMPOSITIONS[size];
  if (preset) return preset;
  const tank = Math.max(1, Math.round(size * 0.15));
  const healer = Math.max(1, Math.round(size * 0.22));
  return { tank, healer, dps: Math.max(0, size - tank - healer) };
}

export function compositionSize(comp: RaidComposition): number {
  return comp.tank + comp.healer + comp.dps;
}

/**
 * Validuje hráčem zvolenou kompozici: nezáporné celočíselné počty, součet = `size`
 * a alespoň jeden slot role hráče (tu hráč obsazuje). Jinak je comp libovolný —
 * špatný poměr (málo healerů / dps) je strategická volba hráče (může vést k wipu).
 */
export function isValidComposition(
  comp: RaidComposition,
  size: number,
  playerRole: RaidRole,
): boolean {
  for (const r of RAID_ROLES) {
    const n = comp[r];
    if (!Number.isInteger(n) || n < 0) return false;
  }
  if (compositionSize(comp) !== size) return false;
  return comp[playerRole] >= 1;
}

// Zpětně kompatibilní MVP default (velikost 5).
export const RAID_COMPOSITION: RaidComposition = DEFAULT_COMPOSITIONS[5]!;
export const RAID_PARTY_SIZE = compositionSize(RAID_COMPOSITION);

// ── Role tuning (laditelný balanc, vyladí se v M9) ──────────────────────────
/** Tank: víc HP, míň dmg, zmírněné příchozí poškození. */
const TANK_HP_MULT = 1.5;
const TANK_DAMAGE_MULT = 0.6;
const TANK_MITIGATION = 0.65;
/** Healer: léčí (násobek attack power), jen symbolický dmg. */
const HEALER_HEAL_MULT = 1.6;
const HEALER_DAMAGE_MULT = 0.15;
/** Po této době boss „enrage" (computeHit ztrojnásobí dmg). */
const RAID_ENRAGE_SEC = 200;
/** Klid mezi bossy + podíl HP doléčený živým členům. */
const RAID_REST_SEC = 5;
const RAID_REST_HEAL_FRACTION = 0.5;
/** Minimální délka raidu (aby šel sledovat). */
const RAID_MIN_DURATION_SEC = 8;
/** Bezpečnostní strop iterací (determinismus). */
const RAID_MAX_ITERATIONS = 40000;

// ── Iterativní wipe/retry (M8.5-A) ──────────────────────────────────────────
/** Max počet pokusů na jednoho bosse; po vyčerpání bez killu = hard fail. */
const BOSS_ATTEMPT_CAP = 6;
/** Zlehčení bosse za každý wipe na něm (HP i dmg dolů). */
const BOSS_DETERMINATION_PER_WIPE = 0.07;
/** Dolní hranice zlehčení — nikdy pod tento podíl originálu. */
const BOSS_DETERMINATION_FLOOR = 0.5;
/** Prodleva (s), než se party po wipu sebere a pullne znovu. */
const RAID_REGROUP_AFTER_WIPE_SEC = 8;

function bossDeterminationFactor(attempt: number): number {
  return Math.max(BOSS_DETERMINATION_FLOOR, 1 - BOSS_DETERMINATION_PER_WIPE * attempt);
}

/** Zlehčená kopie bosse (×factor na HP i attack power). */
function easeBoss(boss: CombatActor, factor: number): CombatActor {
  if (factor >= 1) return boss;
  return {
    ...boss,
    maxHealth: Math.max(1, Math.round(boss.maxHealth * factor)),
    attackPower: boss.attackPower * factor,
  };
}

/**
 * Aktér v raidu = `CombatActor` + role + heal power. Plně serializovatelný
 * (snapshot do DB, stejně jako arena snapshot). `healPower` je 0 mimo healera.
 */
export interface RaidActor extends CombatActor {
  role: RaidRole;
  healPower: number;
}

/**
 * Převede základní bojový profil (z `deriveCombatProfile`) na `RaidActor` podle
 * role. Tanky zesílí HP a sníží dmg, healeři dostanou heal power a téměř žádný
 * dmg, dps zůstanou beze změny.
 */
export function deriveRaidActor(base: CombatActor, role: RaidRole): RaidActor {
  if (role === 'tank') {
    return {
      ...base,
      role,
      healPower: 0,
      maxHealth: Math.round(base.maxHealth * TANK_HP_MULT),
      attackPower: base.attackPower * TANK_DAMAGE_MULT,
    };
  }
  if (role === 'healer') {
    return {
      ...base,
      role,
      healPower: base.attackPower * HEALER_HEAL_MULT,
      attackPower: base.attackPower * HEALER_DAMAGE_MULT,
    };
  }
  return { ...base, role, healPower: 0 };
}

/**
 * Škáluje bosse podle velikosti raidu (HP i dmg ×`size/RAID_BASE_SIZE`). Větší
 * raid = víc dps (víc HP bosse) i víc healu (víc boss dmg) → balanc zůstává zhruba
 * invariantní napříč velikostmi a rozhoduje hlavně KOMPOZICE, ne počet hráčů.
 */
export function scaleBoss(boss: CombatActor, size: number): CombatActor {
  const factor = Math.max(1, size) / RAID_BASE_SIZE;
  if (factor === 1) return boss;
  return {
    ...boss,
    maxHealth: Math.round(boss.maxHealth * factor),
    attackPower: boss.attackPower * factor,
  };
}

export interface RaidCombatResult {
  events: CombatEvent[];
  victory: boolean;
  /** Celková délka runu v sekundách (≥ RAID_MIN_DURATION_SEC). */
  durationSec: number;
  /** Index bosse, na kterém raid hard-failnul (jinak undefined). */
  defeatedAtBoss?: number;
  /** Celkový počet wipů napříč runem (M8.5-A) — řídí škálování odměn. */
  wipes: number;
}

/** Výsledek jednoho pokusu o bosse (jeden „pull"). */
interface BossAttemptResult {
  events: CombatEvent[];
  victory: boolean;
  /** Čas (s od startu runu) po skončení pokusu. */
  clock: number;
  /** HP party po skončení (per index; 0 u mrtvých / při wipu). */
  hp: number[];
}

interface RaidTimer {
  next: number;
  interval: number;
  kind: 'member' | 'boss_basic' | 'boss_ability';
  memberIdx?: number;
  ability?: SignatureAbility;
}

/** Vybere cíl bossova úderu: první živý tank, jinak nejodolnější živý člen. */
function chooseBossTarget(party: RaidActor[], hp: number[]): number {
  let tankIdx = -1;
  let fallbackIdx = -1;
  let fallbackHealth = -1;
  for (let i = 0; i < party.length; i++) {
    if (hp[i]! <= 0) continue;
    if (party[i]!.role === 'tank' && tankIdx === -1) tankIdx = i;
    if (party[i]!.maxHealth > fallbackHealth) {
      fallbackHealth = party[i]!.maxHealth;
      fallbackIdx = i;
    }
  }
  return tankIdx !== -1 ? tankIdx : fallbackIdx;
}

/**
 * Odbojuje JEDEN pokus o bosse (party vs jeden boss) od `startClock` a `startHp`.
 * Vrací události + výsledek + koncové HP party. Sdílí per-hit vzorce s arenou
 * i dungeonem (`computeHit`).
 */
function fightBoss(
  party: RaidActor[],
  boss: CombatActor,
  rng: SeededRng,
  startClock: number,
  startHp: number[],
  attempt: number,
): BossAttemptResult {
  const events: CombatEvent[] = [];
  const hp = [...startHp];
  let clock = startClock;
  let bossHp = boss.maxHealth;
  const encStart = clock;
  const note = attempt > 0 ? ` (pull ${attempt + 1}, weakened)` : '';

  const livingCount = (): number => hp.reduce((n, h) => (h > 0 ? n + 1 : n), 0);

  events.push({
    t: round1(clock),
    type: 'encounter_start',
    message: `⚔️ ${boss.name} (Boss) engages the raid!${note}`,
    target: boss.name,
    targetHealthRemaining: bossHp,
  });

  const timers: RaidTimer[] = [];
  for (let i = 0; i < party.length; i++) {
    timers.push({ next: clock + party[i]!.swingInterval, interval: party[i]!.swingInterval, kind: 'member', memberIdx: i });
  }
  timers.push({ next: clock + boss.swingInterval, interval: boss.swingInterval, kind: 'boss_basic' });
  for (const ab of boss.signatureAbilities) {
    timers.push({ next: clock + ab.cooldownSec, interval: ab.cooldownSec, kind: 'boss_ability', ability: ab });
  }

  let iterations = 0;
  while (bossHp > 0 && livingCount() > 0 && iterations++ < RAID_MAX_ITERATIONS) {
    let idx = 0;
    for (let j = 1; j < timers.length; j++) {
      if (timers[j]!.next < timers[idx]!.next) idx = j;
    }
    const timer = timers[idx]!;
    clock = timer.next;
    timer.next += timer.interval;
    const enraged = clock - encStart >= RAID_ENRAGE_SEC;

    if (timer.kind === 'member') {
      const i = timer.memberIdx!;
      if (hp[i]! <= 0) continue; // mrtvý člen mlčí
      const member = party[i]!;

      if (member.role === 'healer') {
        // Léčí nejzraněnějšího živého spoluhráče (vč. sebe).
        let tIdx = -1;
        let worstMissing = 0;
        for (let k = 0; k < party.length; k++) {
          if (hp[k]! <= 0) continue;
          const missing = party[k]!.maxHealth - hp[k]!;
          if (missing > worstMissing) {
            worstMissing = missing;
            tIdx = k;
          }
        }
        if (tIdx >= 0 && worstMissing > 0) {
          const amount = Math.max(1, Math.round(member.healPower * (0.9 + rng.next() * 0.2)));
          hp[tIdx] = Math.min(party[tIdx]!.maxHealth, hp[tIdx]! + amount);
          events.push({
            t: round1(clock),
            type: 'heal',
            source: member.name,
            target: party[tIdx]!.name,
            amount,
            targetHealthRemaining: hp[tIdx],
            message: `💚 ${member.name} heals ${party[tIdx]!.name} for ${amount}. ${party[tIdx]!.name}: ${hp[tIdx]} HP`,
          });
        } else {
          // Nikdo zraněný → symbolický úder bossovi.
          const hit = computeHit(member, boss, rng, 1, false);
          bossHp = Math.max(0, bossHp - hit.amount);
          events.push({
            t: round1(clock),
            type: 'attack',
            source: member.name,
            target: boss.name,
            amount: hit.amount,
            crit: hit.crit,
            targetHealthRemaining: bossHp,
            message: `${member.name} hits ${boss.name} for ${hit.amount}${hit.crit ? ' (crit!)' : ''}. ${boss.name}: ${bossHp} HP`,
          });
        }
      } else {
        const hit = computeHit(member, boss, rng, 1, false);
        bossHp = Math.max(0, bossHp - hit.amount);
        if (member.lifesteal > 0) {
          hp[i] = Math.min(member.maxHealth, hp[i]! + Math.round(hit.amount * member.lifesteal));
        }
        events.push({
          t: round1(clock),
          type: 'attack',
          source: member.name,
          target: boss.name,
          amount: hit.amount,
          crit: hit.crit,
          targetHealthRemaining: bossHp,
          message: `${member.name} hits ${boss.name} for ${hit.amount}${hit.crit ? ' (crit!)' : ''}. ${boss.name}: ${bossHp} HP`,
        });
      }
    } else {
      // Boss útočí.
      const tIdx = chooseBossTarget(party, hp);
      if (tIdx < 0) break;
      const target = party[tIdx]!;
      const ability = timer.kind === 'boss_ability' ? timer.ability : undefined;
      const hit = computeHit(boss, target, rng, ability?.damageMult ?? 1, enraged);
      let dmg = hit.amount;
      if (target.role === 'tank') dmg = Math.max(1, Math.round(dmg * TANK_MITIGATION));
      hp[tIdx] = Math.max(0, hp[tIdx]! - dmg);
      events.push({
        t: round1(clock),
        type: ability ? 'ability' : 'attack',
        source: boss.name,
        target: target.name,
        amount: dmg,
        crit: hit.crit,
        ability: ability?.name,
        targetHealthRemaining: hp[tIdx],
        message: ability
          ? `${boss.name} uses ${ability.name} on ${target.name} for ${dmg}${hit.crit ? ' (crit!)' : ''}${enraged ? ' [enraged]' : ''}. ${target.name}: ${hp[tIdx]} HP`
          : `${boss.name} hits ${target.name} for ${dmg}${hit.crit ? ' (crit!)' : ''}${enraged ? ' [enraged]' : ''}. ${target.name}: ${hp[tIdx]} HP`,
      });
      if (hp[tIdx] === 0) {
        events.push({
          t: round1(clock),
          type: 'player_defeated',
          source: boss.name,
          target: target.name,
          message: `💀 ${target.name} has fallen!`,
        });
      }
    }
  }

  const victory = bossHp <= 0 && livingCount() > 0;
  if (victory) {
    events.push({
      t: round1(clock),
      type: 'enemy_defeated',
      target: boss.name,
      message: `${boss.name} is defeated!`,
    });
  }
  return { events, victory, clock, hp };
}

/**
 * Deterministicky odbojuje raid s **iterativním wipe/retry** (M8.5-A): party
 * vs sekvence bossů. Po wipu (celá party mrtvá) se boss pullne znovu (party na
 * plné HP) a **zlehčí** (determination až k `BOSS_DETERMINATION_FLOOR`); poražení
 * bossové zůstávají. Vyčerpání pokusů bez killu = **hard fail**. Vrací počet wipů
 * (řídí škálování odměn) + kompletní timeline.
 */
export function simulateRaidRun(
  party: RaidActor[],
  bosses: CombatActor[],
  seed: number,
): RaidCombatResult {
  const rng = new SeededRng(seed);
  const events: CombatEvent[] = [];
  const fullHp = party.map((p) => p.maxHealth);
  // HP nesená mezi PORAŽENÝMI bossy (po wipu se resetuje na plnou).
  let carriedHp = [...fullHp];
  let clock = 0;
  let wipes = 0;
  let victory = true;
  let defeatedAtBoss: number | undefined;

  for (let bi = 0; bi < bosses.length; bi++) {
    const baseBoss = bosses[bi]!;
    let attempt = 0;
    let killed = false;
    let hpAfter = carriedHp;

    while (attempt < BOSS_ATTEMPT_CAP) {
      const boss = easeBoss(baseBoss, bossDeterminationFactor(attempt));
      const startHp = attempt === 0 ? carriedHp : fullHp;
      const enc = fightBoss(party, boss, rng, clock, startHp, attempt);
      for (const e of enc.events) events.push(e);
      clock = enc.clock;
      if (enc.victory) {
        killed = true;
        hpAfter = enc.hp;
        break;
      }
      wipes++;
      attempt++;
      if (attempt < BOSS_ATTEMPT_CAP) clock += RAID_REGROUP_AFTER_WIPE_SEC;
    }

    if (!killed) {
      victory = false;
      defeatedAtBoss = bi;
      break;
    }

    // Klid mezi poraženými bossy (kromě po posledním): doléč živé.
    if (bi < bosses.length - 1) {
      clock += RAID_REST_SEC;
      carriedHp = hpAfter.map((h, k) =>
        h > 0 ? Math.min(party[k]!.maxHealth, h + Math.round(party[k]!.maxHealth * RAID_REST_HEAL_FRACTION)) : 0,
      );
    }
  }

  events.push(
    victory
      ? { t: round1(clock), type: 'victory', message: '🏆 Raid cleared!' }
      : { t: round1(clock), type: 'defeat', message: '☠️ The raid wiped.' },
  );

  return {
    events,
    victory,
    durationSec: Math.max(RAID_MIN_DURATION_SEC, Math.ceil(clock)),
    defeatedAtBoss,
    wipes,
  };
}
