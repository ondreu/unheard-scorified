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
import { computeHit, round1, type CombatActor, type CombatEvent } from './combat';
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
  abilityMult?: number;
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
      abilityMult: ab.damageMult,
    })),
    ...b.signatureAbilities.map((ab) => ({
      next: ab.cooldownSec,
      interval: ab.cooldownSec,
      side: 'b' as DuelSide,
      abilityName: ab.name,
      abilityMult: ab.damageMult,
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

    const hit = computeHit(attacker, defender, rng, timer.abilityMult ?? 1, enraged);
    hp[defenderSide] = Math.max(0, hp[defenderSide] - hit.amount);
    if (attacker.lifesteal > 0) {
      hp[attackerSide] = Math.min(
        attacker.maxHealth,
        hp[attackerSide] + Math.round(hit.amount * attacker.lifesteal),
      );
    }

    events.push({
      t: round1(clock),
      type: timer.abilityName ? 'ability' : 'attack',
      source: attacker.name,
      target: defender.name,
      amount: hit.amount,
      crit: hit.crit,
      ability: timer.abilityName,
      targetHealthRemaining: hp[defenderSide],
      message: timer.abilityName
        ? `${attacker.name} casts ${timer.abilityName} on ${defender.name} for ${hit.amount}${hit.crit ? ' (crit!)' : ''}${enraged ? ' [rampage]' : ''}. ${defender.name}: ${hp[defenderSide]} HP`
        : `${attacker.name} hits ${defender.name} for ${hit.amount}${hit.crit ? ' (crit!)' : ''}${enraged ? ' [rampage]' : ''}. ${defender.name}: ${hp[defenderSide]} HP`,
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
