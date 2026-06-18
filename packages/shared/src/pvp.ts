/**
 * PVP logika (M7): deterministický duel postava-vs-postava + Elo rating +
 * sezónní helpery. Recykluje combat engine z M5 (`computeHit`, `CombatActor`) —
 * žádná duplikace bojových vzorců. Veškerá náhoda jen přes `SeededRng`.
 *
 * PVP = symetrický souboj dvou `CombatActor` (na rozdíl od dungeonu, kde postava
 * čelí sekvenci nepřátel). Oba aktéři útočí, kritují, lifestealují a používají
 * signature abilities; po `PVP_RAMPAGE_SEC` oba „enrage" (eskalace dmg), aby
 * žádný souboj nebyl nekonečný.
 *
 * Viz ADR 0010 (arena & PVP), docs/systems/arenas-pvp.md.
 */
import { SeededRng } from './rng';
import {
  applyAbsorb,
  buildAttackMessage,
  computeHit,
  round1,
  type CombatActor,
  type CombatEvent,
} from './combat';
import { shouldCastAbility } from './rotation';
import { missMessage } from './dnd-combat';
import type { DamageType } from './data/damage';
import {
  ARENA_SEASONS,
  ARENA_TIERS,
  ELO_K_FACTOR,
  MIN_RATING,
  type ArenaSeasonDef,
  type ArenaTierDef,
} from './data/arenas';

/** Po této době souboje oba aktéři „enrage" (ztrojnásobí dmg) → konečné rozhodnutí. */
const PVP_RAMPAGE_SEC = 45;
/** Minimální délka duelu (aby šel sledovat). */
const PVP_MIN_DURATION_SEC = 5;
/** Bezpečnostní strop iterací (determinismus, žádná nekonečná smyčka). */
const PVP_MAX_ITERATIONS = 4000;

export type DuelSide = 'a' | 'b';

export interface PvpDuelResult {
  events: CombatEvent[];
  winner: DuelSide;
  durationSec: number;
  /** Zbývající HP vítěze (telemetrie / tie-break). */
  winnerHealthRemaining: number;
}

interface DuelTimer {
  /** Čas dalšího spuštění (sekundy od startu duelu). */
  next: number;
  interval: number;
  /** 'a' nebo 'b' — kdo je útočník tohoto timeru. */
  side: DuelSide;
  /** Signature ability (jinak basic útok). */
  abilityName?: string;
  abilityId?: string;
  abilityKind?: string;
  abilityMult?: number;
  executeBelowPct?: number;
  executeDamageMult?: number;
  /** Typ poškození kouzla (MR-10d) — přebíjí typ classy útočníka. */
  abilityDamageType?: DamageType;
}

/**
 * Deterministicky odbojuje 1v1 duel dvou postav. Oba začínají na plné HP.
 * Vrací kompletní timeline + vítěze. Při dosažení iteračního stropu (extrémně
 * vzácné) vyhrává aktér s vyšším podílem HP, při shodě strana `a` (deterministicky).
 */
export function simulatePvpDuel(a: CombatActor, b: CombatActor, seed: number): PvpDuelResult {
  const rng = new SeededRng(seed);
  const events: CombatEvent[] = [];
  const hp: Record<DuelSide, number> = { a: a.maxHealth, b: b.maxHealth };
  const shield: Record<DuelSide, number> = { a: a.shield ?? 0, b: b.shield ?? 0 };
  const actor: Record<DuelSide, CombatActor> = { a, b };
  let clock = 0;

  events.push({
    t: 0,
    type: 'encounter_start',
    message: `⚔️ ${a.name} faces ${b.name} in the Arena!`,
    source: a.name,
    target: b.name,
  });

  // Timery: basic úder každé strany + jejich signature abilities.
  const timers: DuelTimer[] = [
    { next: a.swingInterval, interval: a.swingInterval, side: 'a' },
    { next: b.swingInterval, interval: b.swingInterval, side: 'b' },
    ...a.signatureAbilities.map((ab) => ({
      next: ab.cooldownSec,
      interval: ab.cooldownSec,
      side: 'a' as DuelSide,
      abilityName: ab.name,
      abilityId: ab.id,
      abilityKind: ab.kind,
      abilityMult: ab.damageMult,
      executeBelowPct: ab.executeBelowPct,
      executeDamageMult: ab.executeDamageMult,
      abilityDamageType: ab.damageType,
    })),
    ...b.signatureAbilities.map((ab) => ({
      next: ab.cooldownSec,
      interval: ab.cooldownSec,
      side: 'b' as DuelSide,
      abilityName: ab.name,
      abilityId: ab.id,
      abilityKind: ab.kind,
      abilityMult: ab.damageMult,
      executeBelowPct: ab.executeBelowPct,
      executeDamageMult: ab.executeDamageMult,
      abilityDamageType: ab.damageType,
    })),
  ];

  let iterations = 0;
  while (hp.a > 0 && hp.b > 0 && iterations++ < PVP_MAX_ITERATIONS) {
    // Nejbližší timer (deterministicky: nejmenší next, pak pořadí v poli).
    let idx = 0;
    for (let j = 1; j < timers.length; j++) {
      if (timers[j]!.next < timers[idx]!.next) idx = j;
    }
    const timer = timers[idx]!;
    clock = timer.next;
    timer.next += timer.interval;

    const attackerSide = timer.side;
    const defenderSide: DuelSide = attackerSide === 'a' ? 'b' : 'a';
    const attacker = actor[attackerSide];
    const defender = actor[defenderSide];
    const enraged = clock >= PVP_RAMPAGE_SEC;

    // Heal/shield ability v 1v1 nedávají smysl (žádný spojenec) → přeskoč.
    if (timer.abilityKind === 'heal' || timer.abilityKind === 'shield' || timer.abilityKind === 'mitigation') continue;
    // Deklarativní rotace (MIL): pravidlo může ability „podržet"; default = always.
    if (
      timer.abilityId &&
      !shouldCastAbility(attacker.rotation, timer.abilityId, {
        enemyHpPct: defender.maxHealth > 0 ? hp[defenderSide] / defender.maxHealth : 0,
        selfHpPct: attacker.maxHealth > 0 ? hp[attackerSide] / attacker.maxHealth : 0,
      })
    ) {
      continue;
    }

    let effMult = timer.abilityMult ?? 1;
    const defHpPct = defender.maxHealth > 0 ? hp[defenderSide] / defender.maxHealth : 0;
    if (timer.executeBelowPct != null && defHpPct <= timer.executeBelowPct) {
      effMult = timer.executeDamageMult ?? effMult;
    }
    const hit = computeHit(attacker, defender, rng, effMult, enraged, timer.abilityDamageType);
    let dmg = hit.amount;
    let absorbed = 0;
    if (shield[defenderSide] > 0) {
      const abs = applyAbsorb(dmg, shield[defenderSide]);
      absorbed = abs.absorbed;
      shield[defenderSide] = abs.shieldRemaining;
      dmg = abs.netDamage;
    }
    hp[defenderSide] = Math.max(0, hp[defenderSide] - dmg);
    const healed = hit.hit && attacker.lifesteal > 0 ? Math.round(hit.amount * attacker.lifesteal) : 0;
    if (healed > 0) hp[attackerSide] = Math.min(attacker.maxHealth, hp[attackerSide] + healed);

    if (absorbed > 0) {
      events.push({
        t: round1(clock),
        type: 'absorb',
        source: attacker.name,
        target: defender.name,
        amount: absorbed,
        message: `🛡️ ${defender.name}'s shield absorbs ${absorbed}${shield[defenderSide] > 0 ? ` (${shield[defenderSide]} left)` : ' (shield breaks)'}.`,
      });
    }
    events.push({
      t: round1(clock),
      type: healed > 0 ? 'drain' : timer.abilityName ? 'ability' : 'attack',
      source: attacker.name,
      target: defender.name,
      amount: hit.amount,
      crit: hit.crit,
      ability: timer.abilityName,
      targetHealthRemaining: hp[defenderSide],
      message: hit.hit
        ? buildAttackMessage({
            attacker,
            targetName: defender.name,
            amount: hit.amount,
            crit: hit.crit,
            healed,
            abilityName: timer.abilityName,
            suffix: `${enraged ? ' [rampage]' : ''}. ${defender.name}: ${hp[defenderSide]} HP`,
          })
        : missMessage(attacker.name, defender.name, hit),
    });
  }

  // Urči vítěze (při stropu iterací rozhodne podíl HP, při shodě strana 'a').
  let winner: DuelSide;
  if (hp.b <= 0 && hp.a > 0) winner = 'a';
  else if (hp.a <= 0 && hp.b > 0) winner = 'b';
  else winner = hp.a / a.maxHealth >= hp.b / b.maxHealth ? 'a' : 'b';

  const loserSide: DuelSide = winner === 'a' ? 'b' : 'a';
  events.push({
    t: round1(clock),
    type: 'player_defeated',
    source: actor[winner].name,
    target: actor[loserSide].name,
    message: `💀 ${actor[loserSide].name} has fallen.`,
  });
  events.push({
    t: round1(clock),
    type: 'victory',
    source: actor[winner].name,
    message: `🏆 ${actor[winner].name} wins the duel!`,
  });

  return {
    events,
    winner,
    durationSec: Math.max(PVP_MIN_DURATION_SEC, Math.ceil(clock)),
    winnerHealthRemaining: hp[winner],
  };
}

// ── Týmový souboj (M8.5-C, 3v3 / 5v5) ──────────────────────────────────────

/** Bezpečnostní strop iterací týmového boje (víc aktérů než 1v1). */
const TEAM_MAX_ITERATIONS = 20000;

export interface TeamFightResult {
  events: CombatEvent[];
  /** Vítězný tým. */
  winner: DuelSide;
  durationSec: number;
}

interface TeamTimer {
  next: number;
  interval: number;
  side: DuelSide;
  /** Index člena v týmu (útočník). */
  member: number;
  abilityName?: string;
  abilityId?: string;
  abilityKind?: string;
  abilityMult?: number;
  executeBelowPct?: number;
  executeDamageMult?: number;
  /** Typ poškození kouzla (MR-10d) — přebíjí typ classy útočníka. */
  abilityDamageType?: DamageType;
}

/** Index živého nepřítele s nejnižším HP (focus fire); -1 když nikdo nežije. */
function pickTarget(hp: number[]): number {
  let idx = -1;
  for (let i = 0; i < hp.length; i++) {
    if (hp[i]! > 0 && (idx === -1 || hp[i]! < hp[idx]!)) idx = i;
  }
  return idx;
}

/**
 * Deterministicky odbojuje týmový PVP zápas (3v3 / 5v5). Recykluje `computeHit`
 * (žádná duplikace vzorců). Každý živý člen útočí basic údery + signature
 * abilities, cílí na živého nepřítele s nejnižším HP (focus fire). Po
 * `PVP_RAMPAGE_SEC` všichni „enrage". Vítězí tým s žijícími členy (při stropu
 * iterací rozhoduje vyšší součet podílu HP; při shodě tým `a`).
 */
export function simulateTeamFight(
  teamA: CombatActor[],
  teamB: CombatActor[],
  seed: number,
): TeamFightResult {
  const rng = new SeededRng(seed);
  const events: CombatEvent[] = [];
  const team: Record<DuelSide, CombatActor[]> = { a: teamA, b: teamB };
  const hp: Record<DuelSide, number[]> = {
    a: teamA.map((m) => m.maxHealth),
    b: teamB.map((m) => m.maxHealth),
  };
  const shield: Record<DuelSide, number[]> = {
    a: teamA.map((m) => m.shield ?? 0),
    b: teamB.map((m) => m.shield ?? 0),
  };
  let clock = 0;

  events.push({
    t: 0,
    type: 'encounter_start',
    message: `⚔️ ${teamA.length}v${teamB.length} Arena: ${teamA.map((m) => m.name).join(', ')} vs ${teamB.map((m) => m.name).join(', ')}!`,
  });

  const timers: TeamTimer[] = [];
  for (const side of ['a', 'b'] as DuelSide[]) {
    team[side].forEach((m, i) => {
      timers.push({ next: m.swingInterval, interval: m.swingInterval, side, member: i });
      for (const ab of m.signatureAbilities) {
        timers.push({
          next: ab.cooldownSec,
          interval: ab.cooldownSec,
          side,
          member: i,
          abilityName: ab.name,
          abilityId: ab.id,
          abilityKind: ab.kind,
          abilityMult: ab.damageMult,
          executeBelowPct: ab.executeBelowPct,
          executeDamageMult: ab.executeDamageMult,
      abilityDamageType: ab.damageType,
        });
      }
    });
  }

  const alive = (side: DuelSide): boolean => hp[side].some((h) => h > 0);

  let iterations = 0;
  while (alive('a') && alive('b') && iterations++ < TEAM_MAX_ITERATIONS) {
    let idx = 0;
    for (let j = 1; j < timers.length; j++) {
      if (timers[j]!.next < timers[idx]!.next) idx = j;
    }
    const timer = timers[idx]!;
    clock = timer.next;
    timer.next += timer.interval;

    const attackerSide = timer.side;
    const defenderSide: DuelSide = attackerSide === 'a' ? 'b' : 'a';
    // Mrtvý útočník neútočí (timer dál běží, ale událost se přeskočí).
    if (hp[attackerSide][timer.member]! <= 0) continue;

    const targetIdx = pickTarget(hp[defenderSide]);
    if (targetIdx === -1) break;

    const attacker = team[attackerSide][timer.member]!;
    const defender = team[defenderSide][targetIdx]!;
    const enraged = clock >= PVP_RAMPAGE_SEC;
    if (timer.abilityKind === 'heal' || timer.abilityKind === 'shield' || timer.abilityKind === 'mitigation') continue;
    // Deklarativní rotace (MIL): pravidlo může ability „podržet"; default = always.
    if (
      timer.abilityId &&
      !shouldCastAbility(attacker.rotation, timer.abilityId, {
        enemyHpPct: defender.maxHealth > 0 ? hp[defenderSide][targetIdx]! / defender.maxHealth : 0,
        selfHpPct:
          attacker.maxHealth > 0 ? hp[attackerSide][timer.member]! / attacker.maxHealth : 0,
      })
    ) {
      continue;
    }
    let effMult = timer.abilityMult ?? 1;
    const defHpPct =
      defender.maxHealth > 0 ? hp[defenderSide][targetIdx]! / defender.maxHealth : 0;
    if (timer.executeBelowPct != null && defHpPct <= timer.executeBelowPct) {
      effMult = timer.executeDamageMult ?? effMult;
    }
    const hit = computeHit(attacker, defender, rng, effMult, enraged, timer.abilityDamageType);
    let dmg = hit.amount;
    let absorbed = 0;
    if (shield[defenderSide][targetIdx]! > 0) {
      const abs = applyAbsorb(dmg, shield[defenderSide][targetIdx]!);
      absorbed = abs.absorbed;
      shield[defenderSide][targetIdx] = abs.shieldRemaining;
      dmg = abs.netDamage;
    }
    hp[defenderSide][targetIdx] = Math.max(0, hp[defenderSide][targetIdx]! - dmg);
    const healed = hit.hit && attacker.lifesteal > 0 ? Math.round(hit.amount * attacker.lifesteal) : 0;
    if (healed > 0)
      hp[attackerSide][timer.member] = Math.min(
        attacker.maxHealth,
        hp[attackerSide][timer.member]! + healed,
      );

    if (absorbed > 0) {
      events.push({
        t: round1(clock),
        type: 'absorb',
        source: attacker.name,
        target: defender.name,
        amount: absorbed,
        message: `🛡️ ${defender.name}'s shield absorbs ${absorbed}.`,
      });
    }
    const fell = hp[defenderSide][targetIdx] === 0;
    events.push({
      t: round1(clock),
      type: healed > 0 ? 'drain' : timer.abilityName ? 'ability' : 'attack',
      source: attacker.name,
      target: defender.name,
      amount: hit.amount,
      crit: hit.crit,
      ability: timer.abilityName,
      targetHealthRemaining: hp[defenderSide][targetIdx]!,
      message: hit.hit
        ? buildAttackMessage({
            attacker,
            targetName: defender.name,
            amount: hit.amount,
            crit: hit.crit,
            healed,
            abilityName: timer.abilityName,
            suffix: `${enraged ? ' [rampage]' : ''}.${fell ? ` 💀 ${defender.name} falls.` : ` ${defender.name}: ${hp[defenderSide][targetIdx]} HP`}`,
          })
        : missMessage(attacker.name, defender.name, hit),
    });
  }

  const fracA = hp.a.reduce((s, h, i) => s + h / teamA[i]!.maxHealth, 0);
  const fracB = hp.b.reduce((s, h, i) => s + h / teamB[i]!.maxHealth, 0);
  let winner: DuelSide;
  if (alive('a') && !alive('b')) winner = 'a';
  else if (alive('b') && !alive('a')) winner = 'b';
  else winner = fracA >= fracB ? 'a' : 'b';

  events.push({
    t: round1(clock),
    type: 'victory',
    source: team[winner].map((m) => m.name).join(', '),
    message: `🏆 Team ${winner.toUpperCase()} wins the ${teamA.length}v${teamB.length}!`,
  });

  return { events, winner, durationSec: Math.max(PVP_MIN_DURATION_SEC, Math.ceil(clock)) };
}

// ── Elo rating ───────────────────────────────────────────────────────────────

/** Očekávané skóre A proti B (Elo, 0..1). */
export function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

export interface RatingChange {
  winner: number;
  loser: number;
  winnerDelta: number;
  loserDelta: number;
}

/**
 * Nové ratingy po zápase (Elo, K = `ELO_K_FACTOR`). Rating neklesne pod
 * `MIN_RATING`. Vrací nové hodnoty i delty (pro UI/historii).
 */
export function applyRatingChange(winnerRating: number, loserRating: number): RatingChange {
  const expWinner = expectedScore(winnerRating, loserRating);
  const expLoser = 1 - expWinner;
  const winnerDelta = Math.round(ELO_K_FACTOR * (1 - expWinner));
  const loserDelta = Math.round(ELO_K_FACTOR * (0 - expLoser));
  const winner = Math.max(MIN_RATING, winnerRating + winnerDelta);
  const loser = Math.max(MIN_RATING, loserRating + loserDelta);
  return {
    winner,
    loser,
    winnerDelta: winner - winnerRating,
    loserDelta: loser - loserRating,
  };
}

/**
 * Elo posun jedné postavy proti **průměrnému ratingu soupeřů** (M8.5-C týmy).
 * `won` = vyhrál její tým. Rating neklesne pod `MIN_RATING`. Vrací nový rating
 * i deltu. Aplikuje se každému členu týmu zvlášť (ad-hoc týmy, rating per postava).
 */
export function eloDelta(
  rating: number,
  opponentRating: number,
  won: boolean,
): { rating: number; delta: number } {
  const expected = expectedScore(rating, opponentRating);
  const score = won ? 1 : 0;
  const raw = Math.round(ELO_K_FACTOR * (score - expected));
  const next = Math.max(MIN_RATING, rating + raw);
  return { rating: next, delta: next - rating };
}

// ── Tier & sezóny ─────────────────────────────────────────────────────────────

/** Vrátí tier definici pro daný rating. */
export function ratingTier(rating: number): ArenaTierDef {
  let result = ARENA_TIERS[0]!;
  for (const t of ARENA_TIERS) {
    if (rating >= t.min) result = t;
  }
  return result;
}

/** Práh dalšího tieru (pro UI progress); `null` na nejvyšším. */
export function ratingTierProgress(rating: number): {
  tier: ArenaTierDef;
  nextMin: number | null;
} {
  const tier = ratingTier(rating);
  const idx = ARENA_TIERS.findIndex((t) => t.tier === tier.tier);
  const next = ARENA_TIERS[idx + 1];
  return { tier, nextMin: next ? next.min : null };
}

/** Sezónní odměna ve zlatě za dosažený rating na konci sezóny. */
export function seasonRewardGold(rating: number): number {
  return ratingTier(rating).rewardGold;
}

/**
 * Aktivní sezóna pro daný čas. Pokud čas předchází první sezóně, vrací první;
 * pokud následuje po poslední, vrací poslední (ladder „nikdy neskončí" bez nové
 * definice — pak se rating dál počítá v poslední sezóně).
 */
export function activeSeasonAt(now: number): ArenaSeasonDef {
  for (const s of ARENA_SEASONS) {
    if (now >= s.startsAt && now < s.endsAt) return s;
  }
  if (now < ARENA_SEASONS[0]!.startsAt) return ARENA_SEASONS[0]!;
  return ARENA_SEASONS[ARENA_SEASONS.length - 1]!;
}

/** Sezóna dle id (nebo undefined). */
export function seasonById(id: string): ArenaSeasonDef | undefined {
  return ARENA_SEASONS.find((s) => s.id === id);
}
