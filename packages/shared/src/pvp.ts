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
  abilityDamageSpec,
  applyAbsorb,
  applyRage,
  bonusDiceSpec,
  buildAttackMessage,
  canRage,
  computeHit,
  EXTRA_ATTACK_ABILITY,
  extraActionCount,
  round1,
  type CombatActor,
  type CombatEvent,
} from './combat';
import type { DiceSpec } from './dice';
import type { SignatureAbility } from './data/abilities';
import { shouldCastAbility } from './rotation';
import { applySpellSave, canTargetCreatureType, isControlSpell, missMessage, resolveControlCast } from './dnd-combat';
import {
  applyCondition,
  beginActorTurn,
  combineAdvantage,
  conditionAppliedMessage,
  grantsIncomingAdvantage,
  turnConditionEffects,
  type ActiveCondition,
} from './conditions';
import type { DamageType } from './data/damage';
import { spendSlotForTier, type SpellSlots } from './data/spell-slots';
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
  /** Typ poškození kouzla (MR-10d) — přebíjí typ classy útočníka. */
  abilityDamageType?: DamageType;
  /** Spell tier kouzla (ADR 0034) — tier ≥ 1 čerpá spell slot strany. */
  abilitySpellTier?: number;
  /** Ki cost techniky (ADR 0034) — čerpá Ki pool strany (Monk). */
  abilityKiCost?: number;
  /** Literal D&D spell dice (ADR 0032/0036) — Fireball 8d6 (base tier, bez upcast). */
  abilityDamageSpec?: DiceSpec;
  /** Bonus kostky na weapon hit (ADR 0036) — Divine Smite/Sneak Attack. */
  abilityBonusDice?: DiceSpec;
  /** Advantage na hod na zásah (ADR 0036) — Reckless Attack/Assassinate. */
  abilityAdvantage?: boolean;
  /** Akční ekonomika (ADR 0042) — ability použitelná nejvýše 1× za duel. */
  abilityOncePerCombat?: boolean;
  /** Akční ekonomika (ADR 0042, Slice 2) — počet extra útoků po seslání (0 = žádné). */
  abilityExtraActions?: number;
  /** Původní ability (Slice 2d) — pro per-spell save / condition rider / control kouzlo. */
  ability?: SignatureAbility;
}

/**
 * Deterministicky odbojuje 1v1 duel dvou postav. Oba začínají na plné HP.
 * Vrací kompletní timeline + vítěze. Při dosažení iteračního stropu (extrémně
 * vzácné) vyhrává aktér s vyšším podílem HP, při shodě strana `a` (deterministicky).
 */
export function simulatePvpDuel(a: CombatActor, b: CombatActor, seed: number): PvpDuelResult {
  const rng = new SeededRng(seed);
  const events: CombatEvent[] = [];
  // Rage (ADR 0034): Barbarian se na duel auto-rozzuří (resistance na fyzické + bonus).
  if (canRage(a)) a = applyRage(a);
  if (canRage(b)) b = applyRage(b);
  const hp: Record<DuelSide, number> = { a: a.maxHealth, b: b.maxHealth };
  const shield: Record<DuelSide, number> = { a: a.shield ?? 0, b: b.shield ?? 0 };
  const actor: Record<DuelSide, CombatActor> = { a, b };
  // Spell sloty (ADR 0034) jako per-duel rozpočet kouzel každé strany.
  const slotBudget: Record<DuelSide, SpellSlots> = {
    a: { ...(a.spellSlots ?? {}) },
    b: { ...(b.spellSlots ?? {}) },
  };
  // Ki body (ADR 0034) jako per-duel rozpočet Monkových technik každé strany.
  const kiBudget: Record<DuelSide, number> = { a: a.kiPoints ?? 0, b: b.kiPoints ?? 0 };
  // Akční ekonomika (ADR 0042): „once per combat" okno per strana (Action Surge, Assassinate).
  const usedOnce: Record<DuelSide, Set<string>> = { a: new Set(), b: new Set() };
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
      abilityDamageType: ab.damageType,
      abilitySpellTier: ab.spellTier,
      abilityKiCost: ab.kiCost,
      abilityDamageSpec: abilityDamageSpec(ab, ab.spellTier ?? null, a.level),
      abilityBonusDice: bonusDiceSpec(ab, ab.spellTier ?? null, a.level),
      abilityAdvantage: ab.advantage,
      abilityOncePerCombat: ab.oncePerCombat,
      abilityExtraActions: extraActionCount(ab),
      ability: ab,
    })),
    ...b.signatureAbilities.map((ab) => ({
      next: ab.cooldownSec,
      interval: ab.cooldownSec,
      side: 'b' as DuelSide,
      abilityName: ab.name,
      abilityId: ab.id,
      abilityKind: ab.kind,
      abilityMult: ab.damageMult,
      abilityDamageType: ab.damageType,
      abilitySpellTier: ab.spellTier,
      abilityKiCost: ab.kiCost,
      abilityDamageSpec: abilityDamageSpec(ab, ab.spellTier ?? null, b.level),
      abilityBonusDice: bonusDiceSpec(ab, ab.spellTier ?? null, b.level),
      abilityAdvantage: ab.advantage,
      abilityOncePerCombat: ab.oncePerCombat,
      abilityExtraActions: extraActionCount(ab),
      ability: ab,
    })),
  ];

  // Conditiony (Slice 2d — spojité simy): status efekty per strana. „Turn" = basic-
  // swing beat (timer bez ability); na něm se conditiony vyhodnotí + dekrementují,
  // ability timery jen čtou. Stun/charmed = vynechaný beat, ostatní = disadvantage.
  const conditions: Record<DuelSide, ActiveCondition[] | undefined> = { a: undefined, b: undefined };

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
    // Conditiony (Slice 2d): basic-swing beat (timer bez ability) = „turn" → vyhodnoť
    // + dekrementuj; ability timery jen čtou (netikají). Stun/charmed = vynechaný beat
    // (basic) / přeskočené seslání (ability); jinak disadvantage na tento hod.
    let atkDisadv = false;
    if (!timer.abilityId) {
      const h = { conditions: conditions[attackerSide] };
      const eff = beginActorTurn(h);
      conditions[attackerSide] = h.conditions;
      if (eff.skipTurn) {
        events.push({ t: round1(clock), type: 'ability', source: attacker.name, message: `💫 ${attacker.name} is incapacitated and loses the action.` });
        continue;
      }
      atkDisadv = eff.attackDisadvantage;
    } else {
      const eff = turnConditionEffects(conditions[attackerSide]);
      if (eff.skipTurn) continue; // stunnutý/charmnutý aktér nekouzlí
      atkDisadv = eff.attackDisadvantage;
    }
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
    // Creature type targeting: kouzlo s omezením typu cíle (Hold Person → humanoid)
    // se proti nepovolenému typu soupeře „drží". Hráči jsou humanoidi → v PVP inertní.
    if (timer.ability?.validTargetTypes && !canTargetCreatureType(timer.ability, defender.creatureType)) {
      continue;
    }
    // Akční ekonomika (ADR 0042): „once per combat" ability už vyčerpaná → drž ji.
    if (timer.abilityId && timer.abilityOncePerCombat && usedOnce[attackerSide].has(timer.abilityId)) {
      continue;
    }
    // Spell sloty (ADR 0034): útočné kouzlo (tier ≥ 1) čerpá slot strany; když
    // dojdou, se „drží" (postava mlátí basic údery / cantripy). Per-duel rozpočet.
    if (
      timer.abilityId &&
      (timer.abilitySpellTier ?? 0) >= 1 &&
      spendSlotForTier(slotBudget[attackerSide], timer.abilitySpellTier!) == null
    ) {
      continue;
    }
    // Ki (ADR 0034): Monkova technika (`kiCost`) čerpá Ki pool strany; bez Ki se „drží".
    const kiCost = timer.abilityKiCost ?? 0;
    if (kiCost > 0) {
      if (kiCost > kiBudget[attackerSide]) continue;
      kiBudget[attackerSide] -= kiCost;
    }
    // Spotřebuj „once per combat" okno (ADR 0042) — až po slot/Ki gatingu.
    if (timer.abilityId && timer.abilityOncePerCombat) usedOnce[attackerSide].add(timer.abilityId);

    // Control kouzlo (Slice 2d): pure-control (Hold Person/Web/…) → bez hodu/poškození,
    // jen save → condition na soupeře. Slot/Ki už spotřebovány výše.
    if (timer.ability && isControlSpell(timer.ability)) {
      const tgt = { actor: defender, name: defender.name, conditions: conditions[defenderSide] };
      const outcome = resolveControlCast(timer.ability, attacker, tgt, rng, attacker.name);
      conditions[defenderSide] = tgt.conditions;
      events.push({ t: round1(clock), type: 'ability', source: attacker.name, target: defender.name, ability: timer.ability.name, message: `✨ ${attacker.name} casts ${timer.ability.name} at ${defender.name}.` });
      if (outcome.saveMessage) events.push({ t: round1(clock), type: 'ability', source: defender.name, message: outcome.saveMessage });
      if (outcome.applied) events.push({ t: round1(clock), type: 'ability', source: attacker.name, target: defender.name, message: conditionAppliedMessage(defender.name, outcome.applied) });
      continue;
    }

    const effMult = timer.abilityMult ?? 1;
    const spec = timer.abilityDamageSpec;
    // Advantage (Slice 2d): ability advantage + disadvantage z conditionů útočníka +
    // advantage z conditionů soupeře (prone/restrained/stunned/blinded).
    const hit = computeHit(attacker, defender, rng, spec ? 1 : effMult, enraged, timer.abilityDamageType, spec, {
      advantage: combineAdvantage(
        timer.abilityAdvantage ? 'advantage' : undefined,
        atkDisadv ? 'disadvantage' : undefined,
        grantsIncomingAdvantage(conditions[defenderSide]) ? 'advantage' : undefined,
      ),
      bonusDice: timer.abilityBonusDice,
    });
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
            advantage: hit.advantage,
            healed,
            abilityName: timer.abilityName,
            suffix: `${enraged ? ' [rampage]' : ''}. ${defender.name}: ${hp[defenderSide]} HP`,
          })
        : missMessage(attacker.name, defender.name, hit),
    });

    // Condition rider (Slice 2d): damage + rider (Trip Attack/Stunning Strike/…).
    // Save se hodí jen kvůli condition (poškození v PVP zůstává beze změny — balanc).
    if (hit.hit && timer.ability?.condition) {
      let applied: ActiveCondition['type'] | undefined;
      if (timer.ability.save) {
        const out = applySpellSave(timer.ability, attacker, defender, rng, 0);
        if (out.message) events.push({ t: round1(clock), type: 'ability', source: defender.name, message: out.message });
        if (out.condition) {
          conditions[defenderSide] = applyCondition(conditions[defenderSide], out.condition, attacker.name);
          applied = out.condition.type;
        }
      } else {
        conditions[defenderSide] = applyCondition(conditions[defenderSide], timer.ability.condition, attacker.name);
        applied = timer.ability.condition.type;
      }
      if (applied) {
        events.push({ t: round1(clock), type: 'ability', source: attacker.name, target: defender.name, message: conditionAppliedMessage(defender.name, timer.ability.condition) });
      }
    }

    // Akční ekonomika (ADR 0042, Slice 2): Action Surge → extra úder(y) v tomtéž
    // okamžiku, než přijde na řadu další timer.
    const extras = timer.abilityExtraActions ?? 0;
    for (let k = 0; k < extras && hp[defenderSide] > 0; k++) {
      const xr = computeHit(attacker, defender, rng, 1, enraged);
      let xdmg = xr.amount;
      if (shield[defenderSide] > 0) {
        const xabs = applyAbsorb(xdmg, shield[defenderSide]);
        shield[defenderSide] = xabs.shieldRemaining;
        xdmg = xabs.netDamage;
      }
      hp[defenderSide] = Math.max(0, hp[defenderSide] - xdmg);
      const xh = xr.hit && attacker.lifesteal > 0 ? Math.round(xr.amount * attacker.lifesteal) : 0;
      if (xh > 0) hp[attackerSide] = Math.min(attacker.maxHealth, hp[attackerSide] + xh);
      events.push({
        t: round1(clock),
        type: xh > 0 ? 'drain' : 'ability',
        source: attacker.name,
        target: defender.name,
        amount: xr.amount,
        crit: xr.crit,
        ability: EXTRA_ATTACK_ABILITY.name,
        targetHealthRemaining: hp[defenderSide],
        message: xr.hit
          ? buildAttackMessage({
              attacker,
              targetName: defender.name,
              amount: xr.amount,
              crit: xr.crit,
              advantage: xr.advantage,
              healed: xh,
              abilityName: EXTRA_ATTACK_ABILITY.name,
              suffix: `${enraged ? ' [rampage]' : ''}. ${defender.name}: ${hp[defenderSide]} HP`,
            })
          : missMessage(attacker.name, defender.name, xr),
      });
    }
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
  /** Typ poškození kouzla (MR-10d) — přebíjí typ classy útočníka. */
  abilityDamageType?: DamageType;
  /** Spell tier kouzla (ADR 0034) — tier ≥ 1 čerpá spell slot daného člena. */
  abilitySpellTier?: number;
  /** Ki cost techniky (ADR 0034) — čerpá Ki pool daného člena (Monk). */
  abilityKiCost?: number;
  /** Literal D&D spell dice (ADR 0032/0036). */
  abilityDamageSpec?: DiceSpec;
  /** Bonus kostky na weapon hit (ADR 0036). */
  abilityBonusDice?: DiceSpec;
  /** Advantage na hod na zásah (ADR 0036). */
  abilityAdvantage?: boolean;
  /** Akční ekonomika (ADR 0042) — ability použitelná nejvýše 1× za zápas. */
  abilityOncePerCombat?: boolean;
  /** Akční ekonomika (ADR 0042, Slice 2) — počet extra útoků po seslání (0 = žádné). */
  abilityExtraActions?: number;
  /** Původní ability (Slice 2d) — pro per-spell save / condition rider / control kouzlo. */
  ability?: SignatureAbility;
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
  // Rage (ADR 0034): Barbarian-členové obou týmů se auto-rozzuří (resistance + bonus).
  teamA = teamA.map((m) => (canRage(m) ? applyRage(m) : m));
  teamB = teamB.map((m) => (canRage(m) ? applyRage(m) : m));
  const team: Record<DuelSide, CombatActor[]> = { a: teamA, b: teamB };
  const hp: Record<DuelSide, number[]> = {
    a: teamA.map((m) => m.maxHealth),
    b: teamB.map((m) => m.maxHealth),
  };
  const shield: Record<DuelSide, number[]> = {
    a: teamA.map((m) => m.shield ?? 0),
    b: teamB.map((m) => m.shield ?? 0),
  };
  // Spell sloty (ADR 0034) jako per-zápas rozpočet kouzel každého člena obou týmů.
  const slotBudget: Record<DuelSide, SpellSlots[]> = {
    a: teamA.map((m) => ({ ...(m.spellSlots ?? {}) })),
    b: teamB.map((m) => ({ ...(m.spellSlots ?? {}) })),
  };
  // Ki body (ADR 0034) per člen — rozpočet Monkových technik každého člena.
  const kiBudget: Record<DuelSide, number[]> = {
    a: teamA.map((m) => m.kiPoints ?? 0),
    b: teamB.map((m) => m.kiPoints ?? 0),
  };
  // Akční ekonomika (ADR 0042): „once per combat" okno per člen obou týmů.
  const usedOnce: Record<DuelSide, Set<string>[]> = {
    a: teamA.map(() => new Set<string>()),
    b: teamB.map(() => new Set<string>()),
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
          abilityDamageType: ab.damageType,
          abilitySpellTier: ab.spellTier,
          abilityKiCost: ab.kiCost,
          abilityDamageSpec: abilityDamageSpec(ab, ab.spellTier ?? null, m.level),
          abilityBonusDice: bonusDiceSpec(ab, ab.spellTier ?? null, m.level),
          abilityAdvantage: ab.advantage,
          abilityOncePerCombat: ab.oncePerCombat,
          abilityExtraActions: extraActionCount(ab),
          ability: ab,
        });
      }
    });
  }

  // Conditiony (Slice 2d): status efekty per člen obou týmů (jako duel, per index).
  const conditions: Record<DuelSide, (ActiveCondition[] | undefined)[]> = {
    a: teamA.map(() => undefined),
    b: teamB.map(() => undefined),
  };

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
    // Conditiony (Slice 2d): basic-swing beat tiká conditiony člena, ability timer
    // jen čte. Stun/charmed = vynechaný beat / přeskočené seslání; jinak disadvantage.
    let atkDisadv = false;
    if (!timer.abilityId) {
      const h = { conditions: conditions[attackerSide][timer.member] };
      const eff = beginActorTurn(h);
      conditions[attackerSide][timer.member] = h.conditions;
      if (eff.skipTurn) {
        events.push({ t: round1(clock), type: 'ability', source: attacker.name, message: `💫 ${attacker.name} is incapacitated and loses the action.` });
        continue;
      }
      atkDisadv = eff.attackDisadvantage;
    } else {
      const eff = turnConditionEffects(conditions[attackerSide][timer.member]);
      if (eff.skipTurn) continue;
      atkDisadv = eff.attackDisadvantage;
    }
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
    // Creature type targeting: kouzlo s omezením typu cíle (Hold Person → humanoid)
    // se proti nepovolenému typu soupeře „drží". Hráči jsou humanoidi → v PVP inertní.
    if (timer.ability?.validTargetTypes && !canTargetCreatureType(timer.ability, defender.creatureType)) {
      continue;
    }
    // Akční ekonomika (ADR 0042): „once per combat" ability už vyčerpaná → drž ji.
    if (timer.abilityId && timer.abilityOncePerCombat && usedOnce[attackerSide][timer.member]!.has(timer.abilityId)) {
      continue;
    }
    // Spell sloty (ADR 0034): útočné kouzlo (tier ≥ 1) čerpá slot člena; když dojdou,
    // se „drží" (člen mlátí basic údery / cantripy). Per-zápas rozpočet per člen.
    if (
      timer.abilityId &&
      (timer.abilitySpellTier ?? 0) >= 1 &&
      spendSlotForTier(slotBudget[attackerSide][timer.member]!, timer.abilitySpellTier!) == null
    ) {
      continue;
    }
    // Ki (ADR 0034): Monkova technika čerpá Ki pool člena; bez Ki se „drží".
    const kiCost = timer.abilityKiCost ?? 0;
    if (kiCost > 0) {
      if (kiCost > kiBudget[attackerSide][timer.member]!) continue;
      kiBudget[attackerSide][timer.member]! -= kiCost;
    }
    // Spotřebuj „once per combat" okno (ADR 0042) — až po slot/Ki gatingu.
    if (timer.abilityId && timer.abilityOncePerCombat) usedOnce[attackerSide][timer.member]!.add(timer.abilityId);

    // Control kouzlo (Slice 2d): pure-control → jen save → condition na cíl (bez dmg).
    if (timer.ability && isControlSpell(timer.ability)) {
      const tgt = { actor: defender, name: defender.name, conditions: conditions[defenderSide][targetIdx] };
      const outcome = resolveControlCast(timer.ability, attacker, tgt, rng, attacker.name);
      conditions[defenderSide][targetIdx] = tgt.conditions;
      events.push({ t: round1(clock), type: 'ability', source: attacker.name, target: defender.name, ability: timer.ability.name, message: `✨ ${attacker.name} casts ${timer.ability.name} at ${defender.name}.` });
      if (outcome.saveMessage) events.push({ t: round1(clock), type: 'ability', source: defender.name, message: outcome.saveMessage });
      if (outcome.applied) events.push({ t: round1(clock), type: 'ability', source: attacker.name, target: defender.name, message: conditionAppliedMessage(defender.name, outcome.applied) });
      continue;
    }

    const effMult = timer.abilityMult ?? 1;
    const spec = timer.abilityDamageSpec;
    const hit = computeHit(attacker, defender, rng, spec ? 1 : effMult, enraged, timer.abilityDamageType, spec, {
      advantage: combineAdvantage(
        timer.abilityAdvantage ? 'advantage' : undefined,
        atkDisadv ? 'disadvantage' : undefined,
        grantsIncomingAdvantage(conditions[defenderSide][targetIdx]) ? 'advantage' : undefined,
      ),
      bonusDice: timer.abilityBonusDice,
    });
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
            advantage: hit.advantage,
            healed,
            abilityName: timer.abilityName,
            suffix: `${enraged ? ' [rampage]' : ''}.${fell ? ` 💀 ${defender.name} falls.` : ` ${defender.name}: ${hp[defenderSide][targetIdx]} HP`}`,
          })
        : missMessage(attacker.name, defender.name, hit),
    });

    // Condition rider (Slice 2d): damage + rider → save (jen kvůli condition; PVP
    // poškození beze změny). Save-less rider = auto na zásah.
    if (hit.hit && !fell && timer.ability?.condition) {
      let landed = false;
      if (timer.ability.save) {
        const out = applySpellSave(timer.ability, attacker, defender, rng, 0);
        if (out.message) events.push({ t: round1(clock), type: 'ability', source: defender.name, message: out.message });
        if (out.condition) {
          conditions[defenderSide][targetIdx] = applyCondition(conditions[defenderSide][targetIdx], out.condition, attacker.name);
          landed = true;
        }
      } else {
        conditions[defenderSide][targetIdx] = applyCondition(conditions[defenderSide][targetIdx], timer.ability.condition, attacker.name);
        landed = true;
      }
      if (landed) {
        events.push({ t: round1(clock), type: 'ability', source: attacker.name, target: defender.name, message: conditionAppliedMessage(defender.name, timer.ability.condition) });
      }
    }

    // Akční ekonomika (ADR 0042, Slice 2): Action Surge → extra úder(y) na stejný cíl.
    const extras = timer.abilityExtraActions ?? 0;
    for (let k = 0; k < extras && hp[defenderSide][targetIdx]! > 0; k++) {
      const xr = computeHit(attacker, defender, rng, 1, enraged);
      let xdmg = xr.amount;
      if (shield[defenderSide][targetIdx]! > 0) {
        const xabs = applyAbsorb(xdmg, shield[defenderSide][targetIdx]!);
        shield[defenderSide][targetIdx] = xabs.shieldRemaining;
        xdmg = xabs.netDamage;
      }
      hp[defenderSide][targetIdx] = Math.max(0, hp[defenderSide][targetIdx]! - xdmg);
      const xh = xr.hit && attacker.lifesteal > 0 ? Math.round(xr.amount * attacker.lifesteal) : 0;
      if (xh > 0) hp[attackerSide][timer.member] = Math.min(attacker.maxHealth, hp[attackerSide][timer.member]! + xh);
      const xfell = hp[defenderSide][targetIdx] === 0;
      events.push({
        t: round1(clock),
        type: xh > 0 ? 'drain' : 'ability',
        source: attacker.name,
        target: defender.name,
        amount: xr.amount,
        crit: xr.crit,
        ability: EXTRA_ATTACK_ABILITY.name,
        targetHealthRemaining: hp[defenderSide][targetIdx]!,
        message: xr.hit
          ? buildAttackMessage({
              attacker,
              targetName: defender.name,
              amount: xr.amount,
              crit: xr.crit,
              advantage: xr.advantage,
              healed: xh,
              abilityName: EXTRA_ATTACK_ABILITY.name,
              suffix: `${enraged ? ' [rampage]' : ''}.${xfell ? ` 💀 ${defender.name} falls.` : ` ${defender.name}: ${hp[defenderSide][targetIdx]} HP`}`,
            })
          : missMessage(attacker.name, defender.name, xr),
      });
    }
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
