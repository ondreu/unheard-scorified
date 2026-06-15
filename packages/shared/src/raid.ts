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

/** Složení party (rozhodnutí PM MVP). */
export interface RaidComposition {
  tank: number;
  healer: number;
  dps: number;
}

export const RAID_COMPOSITION: RaidComposition = { tank: 1, healer: 1, dps: 3 };
export const RAID_PARTY_SIZE = RAID_COMPOSITION.tank + RAID_COMPOSITION.healer + RAID_COMPOSITION.dps;

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

export interface RaidCombatResult {
  events: CombatEvent[];
  victory: boolean;
  /** Celková délka runu v sekundách (≥ RAID_MIN_DURATION_SEC). */
  durationSec: number;
  /** Index bosse, u kterého party padla (jinak undefined). */
  defeatedAtBoss?: number;
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
 * Deterministicky odbojuje raid: party (víc `RaidActor`) vs sekvence bossů.
 * Vrací kompletní timeline + výsledek. Wipe (celá party mrtvá) = defeat.
 */
export function simulateRaidRun(
  party: RaidActor[],
  bosses: CombatActor[],
  seed: number,
): RaidCombatResult {
  const rng = new SeededRng(seed);
  const events: CombatEvent[] = [];
  const hp = party.map((p) => p.maxHealth);
  let clock = 0;
  let victory = true;
  let defeatedAtBoss: number | undefined;

  const livingCount = (): number => hp.reduce((n, h) => (h > 0 ? n + 1 : n), 0);

  for (let bi = 0; bi < bosses.length; bi++) {
    const boss = bosses[bi]!;
    let bossHp = boss.maxHealth;
    const encStart = clock;

    events.push({
      t: round1(clock),
      type: 'encounter_start',
      message: `⚔️ ${boss.name} (Boss) engages the raid!`,
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

    if (livingCount() === 0) {
      victory = false;
      defeatedAtBoss = bi;
      break;
    }

    events.push({
      t: round1(clock),
      type: 'enemy_defeated',
      target: boss.name,
      message: `${boss.name} is defeated!`,
    });

    // Klid mezi bossy (kromě po posledním): doléč živé.
    if (bi < bosses.length - 1) {
      clock += RAID_REST_SEC;
      for (let k = 0; k < party.length; k++) {
        if (hp[k]! > 0) {
          hp[k] = Math.min(party[k]!.maxHealth, hp[k]! + Math.round(party[k]!.maxHealth * RAID_REST_HEAL_FRACTION));
        }
      }
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
  };
}
