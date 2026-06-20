/**
 * Tahový dungeon run (dungeon overhaul Slice 2+3, ADR 0037).
 *
 * Interaktivní **tahový** boj proti **sekvenci multi-enemy encounterů** dungeonu —
 * alternativa k idle auto-resolve (`simulateRaidRun`). Hráč kolo po kole volí
 * **ability + cíl**; server tah vyhodnotí. **Slice 2** = solo (1 hráč). **Slice 3**
 * = group s **AI parťáky** (autofill 3-player, 1 tank / 1 healer / 1 dps): hráč
 * řídí svou postavu, parťáci jednají automaticky (role + rotace + sloty → mimikují
 * hráče), nepřátelé útočí na threat (tank). Mezi encountery short rest (refill
 * zdrojů + částečné doléčení).
 *
 * Tenhle modul je **čistý deterministický engine** (seed per tah → server-
 * authoritative, klient posílá jen volbu). Recykluje sdílené bojové primitivy
 * (`computeHit`, `abilityDamageSpec`, `healDiceSpec`, slot/Ki/rage helpery) —
 * žádná duplikace combat vzorců. Stav je plně serializovatelný (uloží se do DB
 * jako JSON, jako Gauntlet). Herní stringy anglicky (EN), komentáře česky.
 */
import { SeededRng, seedFromString } from './rng';
import {
  abilityDamageMult,
  abilityDamageSpec,
  applyAbsorb,
  applyRage,
  bonusDiceSpec,
  buildAttackMessage,
  computeHit,
  dotTickRaw,
  EXTRA_ATTACK_ABILITY,
  extraActionCount,
  healDiceSpec,
  type CombatActor,
  type CombatEvent,
  type SignatureAbility,
} from './combat';
import { rollDice } from './dice';
import { applySpellSave, missMessage } from './dnd-combat';
import { applyDamageInteraction, damageInteraction } from './data/damage';
import { groupEncounters } from './group';
import { TANK_INCOMING_DAMAGE_MULT, type RaidActor, type RaidRole } from './raid';
import { shouldCastAbility, shouldCastHeal } from './rotation';
import { abilityPrefersUpcast, hasSlotForTier, spendSlotForTier, type SpellSlots } from './data/spell-slots';

/** Délka jednoho „tahu" v sekundách — převádí cooldown abilit (s) na počet tahů. */
export const DUNGEON_TURN_SEC = 3;
/** Heal proxy faktor (legacy ability bez literal kostek) — sdílí konvenci s questem. */
const HEAL_POWER_FACTOR = 0.6;
/** Strop crit šance (sdíleno s combat enginem). */
const MAX_CRIT_CHANCE = 0.6;
/** Podíl max HP doléčený mezi vyčištěnými encountery (short rest, jako auto-resolve). */
const REST_HEAL_FRACTION = 0.5;

/** Pseudo-ability „základní úder" — vždy dostupná, bez cooldownu, zdarma. */
export const DUNGEON_BASIC_ATTACK: SignatureAbility = {
  id: 'basic_attack',
  name: 'Attack',
  description: 'A basic weapon swing. Always available.',
  kind: 'strike',
  cooldownSec: 0,
  damageMult: 1,
};

export type DungeonRunStatus = 'in_combat' | 'cleared' | 'dead';

/** DoT „nalepený" na nepříteli (krvácení/hoření z hráčovy/parťákovy ability). */
export interface DungeonRunDot {
  remainingTicks: number;
  tickDamage: number;
  sourceName: string;
  abilityName: string;
}

/** Stav jednoho nepřítele aktuálního encounteru. */
export interface DungeonRunEnemy {
  /** Stabilní index v rámci encounteru = `targetId` z klienta. */
  idx: number;
  name: string;
  isBoss: boolean;
  maxHealth: number;
  currentHealth: number;
  /** Plný serializovatelný bojový aktér (AC/attackBonus/resistances…). */
  actor: CombatActor;
  dots: DungeonRunDot[];
}

/** Mutabilní bojový stav hráče (mimo neměnný snapshot profilu). */
export interface DungeonRunPlayer {
  maxHealth: number;
  currentHealth: number;
  absorb: number;
  /** abilityId → zbývající počet tahů do dostupnosti. */
  cooldowns: Record<string, number>;
  /** Zbývající spell sloty (per-encounter rozpočet, refill mezi encountery). */
  spellSlots: SpellSlots;
  /** Zbývající Ki body (Monk) — per-encounter rozpočet. */
  kiPoints: number;
  /** Zbývající rage charges (Barbarian) — kolikrát se ještě umí rozzuřit. */
  rageCharges: number;
  /** Je hráč právě rozzuřený (aktuální encounter)? Auto na encounter, dokud má charge. */
  raging: boolean;
  /** Zbývající tahy aktivního mitigation okna (0 = neaktivní). */
  mitigationTurns: number;
  /** Podíl redukce příchozího poškození během mitigation okna (0..1). */
  mitigationPct: number;
  /**
   * Akční ekonomika (ADR 0042): ids „once per combat" abilit už použitých v
   * aktuálním encounteru (Action Surge, Assassinate). Reset při short restu mezi
   * encountery. `undefined` u běhů z doby před slice → bere se jako prázdné.
   */
  usedOncePerCombat?: string[];
}

/**
 * AI parťák (Slice 3) — mutabilní bojový stav + plný serializovatelný snapshot
 * aktéra (`RaidActor`: role + healPower + rotace + ability kit). Parťák jedná
 * automaticky každý tah (role + rotace → mimikuje hráče).
 */
export interface DungeonRunAlly {
  name: string;
  role: RaidRole;
  maxHealth: number;
  currentHealth: number;
  absorb: number;
  cooldowns: Record<string, number>;
  spellSlots: SpellSlots;
  kiPoints: number;
  rageCharges: number;
  raging: boolean;
  mitigationTurns: number;
  mitigationPct: number;
  /** Akční ekonomika (ADR 0042) — viz `DungeonRunPlayer.usedOncePerCombat`. */
  usedOncePerCombat?: string[];
  /** Plný bojový aktér parťáka (snapshot do DB). */
  actor: RaidActor;
}

/** Kompletní stav tahového dungeon runu (persistovaný jako JSON). */
export interface DungeonRunState {
  seed: number;
  dungeonId: string;
  /** Velikost party pro škálování nepřátel (solo = 1, group = 3). */
  size: number;
  level: number;
  /** Jméno hráče (pro combat log u group heal/threat). */
  playerName: string;
  /** Role hráče (group: tank/healer/dps; solo = 'dps'). Řídí threat + mitigaci. */
  playerRole: RaidRole;
  /** Globální čítač tahů (pro seedování + řazení logu). */
  turn: number;
  /** Index aktuálního encounteru (0-based). */
  encounterIndex: number;
  /** Počet encounterů v dungeonu (cílový stav = vyčistit všechny). */
  encounterCount: number;
  status: DungeonRunStatus;
  player: DungeonRunPlayer;
  /** AI parťáci (Slice 3); solo = prázdné pole. */
  allies: DungeonRunAlly[];
  enemies: DungeonRunEnemy[];
  /** Posledních pár událostí logu (oříznuto kvůli velikosti). */
  log: CombatEvent[];
  /** Počet vyčištěných encounterů (= postup). */
  encountersCleared: number;
}

// ── Odvození efektivního aktéra ──────────────────────────────────────────────

/** Crit šanci ořízne na strop (sdíleno hráč/parťák). */
function clampCrit(actor: CombatActor): CombatActor {
  return { ...actor, critChance: Math.min(MAX_CRIT_CHANCE, actor.critChance) };
}

/** Efektivní bojový aktér hráče (rage varianta, pokud zuří). */
function effectivePlayer(base: CombatActor, state: DungeonRunState): CombatActor {
  return clampCrit(state.player.raging ? applyRage(base) : base);
}

/** Efektivní bojový aktér parťáka (rage varianta, pokud zuří). */
function effectiveAlly(ally: DungeonRunAlly): RaidActor {
  return clampCrit(ally.raging ? applyRage(ally.actor) : ally.actor) as RaidActor;
}

/** Kompletní ability kit v runu (základní úder + signatures bez pasivních buffů). */
export function dungeonRunAbilities(base: CombatActor): SignatureAbility[] {
  return [DUNGEON_BASIC_ATTACK, ...base.signatureAbilities.filter((a) => a.kind !== 'buff')];
}

// ── Encounter lifecycle ──────────────────────────────────────────────────────

/** Postaví nepřátele daného encounteru z dungeon dat (škálováno velikostí party). */
function buildEncounterEnemies(state: DungeonRunState): DungeonRunEnemy[] {
  const groups = groupEncounters('dungeon', state.dungeonId, state.size);
  const group = groups[state.encounterIndex] ?? [];
  return group.map((actor, idx) => ({
    idx,
    name: actor.name,
    isBoss: actor.isBoss ?? false,
    maxHealth: actor.maxHealth,
    currentHealth: actor.maxHealth,
    actor,
    dots: [],
  }));
}

/** Obnoví per-encounter zdroje jednoho aktéra (short rest: sloty/Ki + rage charge). */
function restoreEncounterResources(
  combatant: DungeonRunPlayer | DungeonRunAlly,
  base: CombatActor,
): void {
  combatant.cooldowns = {};
  combatant.absorb = base.shield ?? 0;
  combatant.mitigationTurns = 0;
  combatant.mitigationPct = 0;
  combatant.usedOncePerCombat = []; // short rest obnoví „once per combat" okna (ADR 0042)
  combatant.spellSlots = { ...(base.spellSlots ?? {}) };
  combatant.kiPoints = base.kiPoints ?? 0;
  // Rage (ADR 0034): auto-zuření na encounter, dokud má charge (per-run rationing).
  if (combatant.rageCharges > 0 && (base.rageCharges ?? 0) > 0) {
    combatant.rageCharges -= 1;
    combatant.raging = true;
  } else {
    combatant.raging = false;
  }
}

/** Nastaví aktuální encounter + obnoví per-encounter zdroje hráče i parťáků. */
function spawnEncounter(base: CombatActor, state: DungeonRunState): void {
  state.enemies = buildEncounterEnemies(state);
  restoreEncounterResources(state.player, base);
  for (const ally of state.allies) restoreEncounterResources(ally, ally.actor);
  state.status = 'in_combat';

  const names = state.enemies.map((e) => e.name);
  const label =
    state.enemies.length === 1
      ? `${names[0]}${state.enemies[0]!.isBoss ? ' (Boss)' : ''}`
      : `a pack of ${state.enemies.length} (${names.join(', ')})`;
  pushLog(state, {
    t: state.turn,
    type: 'encounter_start',
    message: `⚔️ Encounter ${state.encounterIndex + 1}/${state.encounterCount}: ${label} engages ${base.name}${state.allies.length > 0 ? "'s party" : ''}!`,
    target: names[0],
  });
}

/** Vytvoří mutabilní stav parťáka z jeho aktéra (plné HP, čerstvé zdroje). */
function makeAlly(actor: RaidActor): DungeonRunAlly {
  return {
    name: actor.name,
    role: actor.role,
    maxHealth: actor.maxHealth,
    currentHealth: actor.maxHealth,
    absorb: actor.shield ?? 0,
    cooldowns: {},
    spellSlots: { ...(actor.spellSlots ?? {}) },
    kiPoints: actor.kiPoints ?? 0,
    rageCharges: actor.rageCharges ?? 0,
    raging: false,
    mitigationTurns: 0,
    mitigationPct: 0,
    usedOncePerCombat: [],
    actor,
  };
}

/**
 * Spustí nový tahový dungeon run (plné HP, encounter 0). `allies` (Slice 3) =
 * AI parťáci; solo = prázdné/vynechané. `playerRole` řídí threat + mitigaci
 * (solo `RaidActor`-nebýt → 'dps').
 */
export function startDungeonRun(
  base: CombatActor,
  dungeonId: string,
  size: number,
  level: number,
  seed: number,
  allies: RaidActor[] = [],
): DungeonRunState {
  const playerRole: RaidRole = (base as Partial<RaidActor>).role ?? 'dps';
  const state: DungeonRunState = {
    seed,
    dungeonId,
    size,
    level,
    playerName: base.name,
    playerRole,
    turn: 0,
    encounterIndex: 0,
    encounterCount: groupEncounters('dungeon', dungeonId, size).length,
    status: 'in_combat',
    player: {
      maxHealth: base.maxHealth,
      currentHealth: base.maxHealth,
      absorb: base.shield ?? 0,
      cooldowns: {},
      spellSlots: { ...(base.spellSlots ?? {}) },
      kiPoints: base.kiPoints ?? 0,
      rageCharges: base.rageCharges ?? 0,
      raging: false,
      mitigationTurns: 0,
      mitigationPct: 0,
      usedOncePerCombat: [],
    },
    allies: allies.map(makeAlly),
    enemies: [],
    log: [],
    encountersCleared: 0,
  };
  spawnEncounter(base, state);
  return state;
}

function pushLog(state: DungeonRunState, e: CombatEvent): void {
  state.log.push(e);
  if (state.log.length > 100) state.log = state.log.slice(-100);
}

/** Cooldown ability v tazích (0 pro základní úder / bez cooldownu). */
function cooldownTurns(ability: SignatureAbility): number {
  if (ability.cooldownSec <= 0) return 0;
  return Math.max(1, Math.round(ability.cooldownSec / DUNGEON_TURN_SEC));
}

/** Je ability právě použitelná (v kitu a bez aktivního cooldownu)? */
export function isDungeonAbilityReady(state: DungeonRunState, abilityId: string): boolean {
  return (state.player.cooldowns[abilityId] ?? 0) <= 0;
}

/** Má hráč na seslání ability dost zdrojů (spell slot / Ki)? Čistá kontrola (nemutuje). */
export function canCastDungeonAbility(state: DungeonRunState, ability: SignatureAbility): boolean {
  if ((ability.kiCost ?? 0) > (state.player.kiPoints ?? Infinity)) return false;
  // Akční ekonomika (ADR 0042): „once per combat" ability už vyčerpaná → UI zašedne.
  if (ability.oncePerCombat && (state.player.usedOncePerCombat ?? []).includes(ability.id)) return false;
  return hasSlotForTier(state.player.spellSlots ?? {}, ability.spellTier ?? 0);
}

/** Indexy živých nepřátel. */
function livingEnemies(state: DungeonRunState): number[] {
  const out: number[] = [];
  for (const e of state.enemies) if (e.currentHealth > 0) out.push(e.idx);
  return out;
}

/** Nejslabší živý nepřítel (fallback cíl, když klient nepošle validní). */
function weakestEnemy(state: DungeonRunState): number {
  let idx = -1;
  let lowest = Infinity;
  for (const e of state.enemies) {
    if (e.currentHealth <= 0) continue;
    if (e.currentHealth < lowest) {
      lowest = e.currentHealth;
      idx = e.idx;
    }
  }
  return idx;
}

// ── Party (hráč + parťáci) jako jednotné cíle pro léčení/threat ──────────────

/** Stav léčitelného/zasažitelného člena party (hráč i parťák). */
interface PartyMember {
  currentHealth: number;
  maxHealth: number;
}

/** Všichni členové party (hráč jako index 0, parťáci dál). */
function partyMembers(state: DungeonRunState): PartyMember[] {
  return [state.player, ...state.allies];
}

/** Nejzraněnější živý člen party (největší chybějící HP); -1 když nikdo. */
function mostInjured(state: DungeonRunState): PartyMember | null {
  let worst: PartyMember | null = null;
  let worstMissing = 0;
  for (const m of partyMembers(state)) {
    if (m.currentHealth <= 0) continue;
    const missing = m.maxHealth - m.currentHealth;
    if (missing > worstMissing) {
      worstMissing = missing;
      worst = m;
    }
  }
  return worst;
}

// ── Tah ──────────────────────────────────────────────────────────────────────

/**
 * Vyhodnotí jeden tah: (1) DoT tiky, (2) hráčova ability na cíl (AoE = všichni
 * živí / heal = nejzraněnější člen party), (3) **AI parťáci** (role + rotace),
 * (4) protiútok všech živých nepřátel na threat (tank), (5) údržba. Vrací nový
 * stav + události tahu. Deterministické (seed per tah). Předpokládá validní
 * vstup (status in_combat, ability v kitu/ready/má zdroj) — ověří volající.
 */
export function resolveDungeonTurn(
  base: CombatActor,
  state: DungeonRunState,
  abilityId: string,
  targetId: number,
): { state: DungeonRunState; events: CombatEvent[] } {
  if (state.status !== 'in_combat' || state.enemies.length === 0) return { state, events: [] };

  const player = effectivePlayer(base, state);
  const ability =
    abilityId === DUNGEON_BASIC_ATTACK.id
      ? DUNGEON_BASIC_ATTACK
      : player.signatureAbilities.find((a) => a.id === abilityId);
  if (!ability || ability.kind === 'buff') return { state, events: [] };
  if (!isDungeonAbilityReady(state, abilityId)) return { state, events: [] };
  // Akční ekonomika (ADR 0042): „once per combat" ability se v encounteru smí
  // použít jen jednou (reset short restem mezi encountery).
  if (ability.oncePerCombat && (state.player.usedOncePerCombat ?? []).includes(abilityId)) {
    return { state, events: [] };
  }

  const abilityTier = ability.spellTier ?? 0;
  if (!hasSlotForTier(state.player.spellSlots, abilityTier)) return { state, events: [] };
  const kiCost = ability.kiCost ?? 0;
  if (kiCost > state.player.kiPoints) return { state, events: [] };

  const rng = new SeededRng(seedFromString(`${state.seed}:turn:${state.encounterIndex}:${state.turn}`));
  const t = state.turn;
  const events: CombatEvent[] = [];
  const emit = (e: CombatEvent): void => {
    events.push(e);
    pushLog(state, e);
  };

  // (1) DoT tiky na všech nepřátelích.
  tickEnemyDots(state, t, emit);
  if (livingEnemies(state).length === 0) {
    return { state: advanceEncounter(base, state, t, events), events };
  }

  // Commit zdrojů (slot/Ki) — až teď, aby DoT-kill neutratil zdroj nadarmo.
  let usedSlotTier: number | null = null;
  if (abilityTier >= 1) usedSlotTier = spendSlotForTier(state.player.spellSlots, abilityTier, abilityPrefersUpcast(ability));
  if (kiCost > 0) state.player.kiPoints -= kiCost;

  // (2) Hráčova ability.
  if (ability.kind === 'heal') {
    const healed = healAmount(player, ability, usedSlotTier, rng, false);
    // Solo = self; group = nejzraněnější člen party (vč. sebe).
    const target = state.allies.length > 0 ? (mostInjured(state) ?? state.player) : state.player;
    target.currentHealth = Math.min(target.maxHealth, target.currentHealth + healed);
    const targetName = target === state.player ? player.name : (target as DungeonRunAlly).name;
    emit({
      t,
      type: 'heal',
      message: `✨ ${player.name} casts ${ability.name}, healing ${targetName} for ${healed}. ${targetName}: ${Math.round(target.currentHealth)} HP`,
      source: player.name,
      target: targetName,
      amount: healed,
      ability: ability.name,
    });
  } else if (ability.kind === 'shield') {
    const shield = Math.round(player.attackPower * ability.damageMult);
    state.player.absorb += shield;
    emit({
      t,
      type: 'absorb',
      message: `🛡️ ${player.name} casts ${ability.name}, absorbing the next ${shield} damage.`,
      source: player.name,
      target: player.name,
      amount: shield,
      ability: ability.name,
    });
  } else if (ability.kind === 'mitigation') {
    state.player.mitigationTurns = Math.max(1, Math.round((ability.mitigationDurationSec ?? DUNGEON_TURN_SEC) / DUNGEON_TURN_SEC));
    state.player.mitigationPct = ability.mitigationPct ?? 0;
    emit({
      t,
      type: 'ability',
      message: `🛡️ ${player.name} uses ${ability.name}, reducing damage taken for a few turns.`,
      source: player.name,
      target: player.name,
      ability: ability.name,
    });
  } else {
    // Útočná ability (strike/drain/dot/basic): AoE = všichni živí, jinak zvolený cíl.
    let targets: number[];
    if (ability.aoe) {
      targets = livingEnemies(state);
    } else {
      const valid = state.enemies[targetId]?.currentHealth ?? 0;
      const ei = valid > 0 ? targetId : weakestEnemy(state);
      targets = ei >= 0 ? [ei] : [];
    }
    for (const ei of targets) {
      const enemy = state.enemies[ei]!;
      if (enemy.currentHealth <= 0) continue;
      combatantHitEnemy(player, state.player, state, enemy, ability, usedSlotTier, rng, t, emit);
    }
    // Akční ekonomika (ADR 0042, Slice 2): Action Surge/Onslaught → extra úder(y)
    // zbraní v tomtéž tahu, na nejslabšího živého nepřítele.
    const extras = extraActionCount(ability);
    for (let k = 0; k < extras; k++) {
      const xwi = weakestEnemy(state);
      if (xwi < 0) break;
      combatantHitEnemy(player, state.player, state, state.enemies[xwi]!, EXTRA_ATTACK_ABILITY, null, rng, t, emit);
    }
  }

  // Cooldown zvolené ability.
  const cd = cooldownTurns(ability);
  if (cd > 0) state.player.cooldowns[abilityId] = cd;
  // Spotřebuj „once per combat" okno (ADR 0042) — no-op u abilit bez flagu.
  if (ability.oncePerCombat) (state.player.usedOncePerCombat ??= []).push(abilityId);

  if (livingEnemies(state).length === 0) {
    return { state: advanceEncounter(base, state, t, events), events };
  }

  // (3) AI parťáci (Slice 3) — každý živý parťák odehraje svůj tah (role + rotace).
  for (let i = 0; i < state.allies.length; i++) {
    if (state.allies[i]!.currentHealth <= 0) continue;
    allyTakeTurn(state, i, rng, t, emit);
    if (livingEnemies(state).length === 0) {
      return { state: advanceEncounter(base, state, t, events), events };
    }
  }

  // (4) Protiútok všech živých nepřátel na threat (tank/nejodolnější člen party).
  for (const enemy of state.enemies) {
    if (enemy.currentHealth <= 0) continue;
    const playerDead = enemyAttackParty(base, player, state, enemy, rng, t, emit);
    if (playerDead) return { state, events };
  }

  // (5) Údržba: dekrement cooldownů + mitigace pro hráče i parťáky, posun tahu.
  tickDownTurn(state.player);
  for (const ally of state.allies) if (ally.currentHealth > 0) tickDownTurn(ally);
  state.turn += 1;
  return { state, events };
}

/** DoT tiky na všech nepřátelích (sdíleno; vyšle případný `enemy_defeated`). */
function tickEnemyDots(state: DungeonRunState, t: number, emit: (e: CombatEvent) => void): void {
  for (const enemy of state.enemies) {
    if (enemy.currentHealth <= 0) continue;
    for (const dot of enemy.dots) {
      if (dot.remainingTicks <= 0) continue;
      enemy.currentHealth = Math.max(0, enemy.currentHealth - dot.tickDamage);
      dot.remainingTicks -= 1;
      emit({
        t,
        type: 'dot',
        message: `🔥 ${enemy.name} suffers ${dot.tickDamage} from ${dot.abilityName}. ${enemy.name}: ${Math.round(enemy.currentHealth)} HP`,
        source: dot.sourceName,
        target: enemy.name,
        amount: dot.tickDamage,
        ability: dot.abilityName,
        targetHealthRemaining: Math.round(enemy.currentHealth),
      });
    }
    enemy.dots = enemy.dots.filter((d) => d.remainingTicks > 0);
    if (enemy.currentHealth <= 0) {
      emit({ t, type: 'enemy_defeated', target: enemy.name, message: `☠️ ${enemy.name} is defeated!` });
    }
  }
}

/** Dekrement cooldownů + mitigation okna jednoho aktéra po tahu. */
function tickDownTurn(c: DungeonRunPlayer | DungeonRunAlly): void {
  for (const id of Object.keys(c.cooldowns)) {
    c.cooldowns[id] = Math.max(0, (c.cooldowns[id] ?? 0) - 1);
  }
  if (c.mitigationTurns > 0) {
    c.mitigationTurns -= 1;
    if (c.mitigationTurns === 0) c.mitigationPct = 0;
  }
}

/** Heal magnituda aktéra: literal dice (healDiceSpec) > healPower (RaidActor) > proxy. */
function healAmount(
  actor: CombatActor,
  ability: SignatureAbility,
  slotTier: number | null,
  rng: SeededRng,
  variance: boolean,
): number {
  const spec = healDiceSpec(ability, slotTier, actor);
  if (spec) return Math.max(1, rollDice(rng, spec.count, spec.sides).total + spec.bonus);
  const healPower = (actor as Partial<RaidActor>).healPower ?? 0;
  const base = healPower > 0 ? healPower : actor.attackPower * HEAL_POWER_FACTOR;
  const v = variance ? 0.9 + rng.next() * 0.2 : 1;
  return Math.max(1, Math.round(base * ability.damageMult * v));
}

/**
 * Odehraje tah jednoho AI parťáka (role + rotace → mimikuje hráče). Healer léčí
 * nejzraněnějšího člena party (jinak DPSí), tank/dps sešle první použitelnou
 * ability dle rotace (jinak basic úder). Deterministické (sdílený rng tahu).
 */
function allyTakeTurn(
  state: DungeonRunState,
  allyIdx: number,
  rng: SeededRng,
  t: number,
  emit: (e: CombatEvent) => void,
): void {
  const ally = state.allies[allyIdx]!;
  const eff = effectiveAlly(ally);
  const living = livingEnemies(state);
  if (living.length === 0) return;

  const wi = weakestEnemy(state);
  const enemyHpPct = wi >= 0 && state.enemies[wi]!.maxHealth > 0 ? state.enemies[wi]!.currentHealth / state.enemies[wi]!.maxHealth : 0;
  const selfHpPct = ally.maxHealth > 0 ? ally.currentHealth / ally.maxHealth : 0;
  const ctx = { enemyHpPct, selfHpPct };
  const injured = mostInjured(state);

  for (const ability of eff.signatureAbilities) {
    if (ability.kind === 'buff') continue;
    if ((ally.cooldowns[ability.id] ?? 0) > 0) continue;
    // Akční ekonomika (ADR 0042): „once per combat" ability už vyčerpaná → drž ji.
    if (ability.oncePerCombat && (ally.usedOncePerCombat ?? []).includes(ability.id)) continue;
    const tier = ability.spellTier ?? 0;
    if (tier >= 1 && !hasSlotForTier(ally.spellSlots, tier)) continue;
    const kiCost = ability.kiCost ?? 0;
    if (kiCost > ally.kiPoints) continue;

    if (ability.kind === 'heal') {
      // Jen healer s koho léčit; default heal-rotace = `self_hp_below` práh, ale
      // pro parťáka léčíme i spojence → vyhodnotíme heal pravidlo proti party.
      if (ally.role !== 'healer' || (ally.actor.healPower ?? 0) <= 0 || !injured) continue;
      if (!shouldCastHeal(eff.rotation, ability.id, { enemyHpPct, selfHpPct: injured.maxHealth > 0 ? injured.currentHealth / injured.maxHealth : 0 })) continue;
      const slotTier = tier >= 1 ? spendSlotForTier(ally.spellSlots, tier, abilityPrefersUpcast(ability)) : null;
      const targets = ability.aoe ? injuredMembers(state) : [injured];
      for (const target of targets) {
        const healed = healAmount(eff, ability, slotTier, rng, true);
        target.currentHealth = Math.min(target.maxHealth, target.currentHealth + healed);
        const targetName = target === state.player ? playerName(state) : (target as DungeonRunAlly).name;
        emit({
          t,
          type: 'heal',
          message: `💚 ${ally.name} casts ${ability.name} on ${targetName} for ${healed}. ${targetName}: ${Math.round(target.currentHealth)} HP`,
          source: ally.name,
          target: targetName,
          amount: healed,
          ability: ability.name,
        });
      }
      ally.cooldowns[ability.id] = cooldownTurns(ability);
      return;
    }

    if (ability.kind === 'mitigation') {
      if (ally.role !== 'tank' || ally.mitigationTurns > 0) continue;
      if (!shouldCastAbility(eff.rotation, ability.id, ctx)) continue;
      ally.mitigationTurns = Math.max(1, Math.round((ability.mitigationDurationSec ?? DUNGEON_TURN_SEC) / DUNGEON_TURN_SEC));
      ally.mitigationPct = ability.mitigationPct ?? 0;
      emit({ t, type: 'ability', source: ally.name, ability: ability.name, message: `🛡️ ${ally.name} uses ${ability.name}, bracing against the next blows.` });
      ally.cooldowns[ability.id] = cooldownTurns(ability);
      return;
    }

    if (ability.kind === 'shield') {
      if (!shouldCastAbility(eff.rotation, ability.id, ctx)) continue;
      ally.absorb += Math.round(eff.attackPower * ability.damageMult);
      emit({ t, type: 'absorb', source: ally.name, target: ally.name, ability: ability.name, message: `🛡️ ${ally.name} casts ${ability.name}.` });
      ally.cooldowns[ability.id] = cooldownTurns(ability);
      return;
    }

    // Útočná ability (strike/drain/dot) → potřebuje živý cíl + dovolení rotace.
    if (wi < 0 || !shouldCastAbility(eff.rotation, ability.id, ctx)) continue;
    const slotTier = tier >= 1 ? spendSlotForTier(ally.spellSlots, tier, abilityPrefersUpcast(ability)) : null;
    if (kiCost > 0) ally.kiPoints -= kiCost;
    const targets = ability.aoe ? living : [wi];
    for (const ei of targets) {
      const enemy = state.enemies[ei]!;
      if (enemy.currentHealth <= 0) continue;
      combatantHitEnemy(eff, ally, state, enemy, ability, slotTier, rng, t, emit);
    }
    // Akční ekonomika (ADR 0042, Slice 2): extra úder(y) parťáka na nejslabšího.
    const allyExtras = extraActionCount(ability);
    for (let k = 0; k < allyExtras; k++) {
      const xwi = weakestEnemy(state);
      if (xwi < 0) break;
      combatantHitEnemy(eff, ally, state, state.enemies[xwi]!, EXTRA_ATTACK_ABILITY, null, rng, t, emit);
    }
    ally.cooldowns[ability.id] = cooldownTurns(ability);
    if (ability.oncePerCombat) (ally.usedOncePerCombat ??= []).push(ability.id); // ADR 0042
    return;
  }

  // Fallback: healer s raněným spojencem a bez slotu/heal-ability → free basic heal;
  // jinak základní úder nejslabšího nepřítele.
  if (ally.role === 'healer' && injured) {
    const healed = healAmount(eff, DUNGEON_BASIC_ATTACK, null, rng, true);
    injured.currentHealth = Math.min(injured.maxHealth, injured.currentHealth + healed);
    const targetName = injured === state.player ? playerName(state) : (injured as DungeonRunAlly).name;
    emit({
      t,
      type: 'heal',
      message: `💚 ${ally.name} mends ${targetName} for ${healed}. ${targetName}: ${Math.round(injured.currentHealth)} HP`,
      source: ally.name,
      target: targetName,
      amount: healed,
    });
    return;
  }
  if (wi >= 0) combatantHitEnemy(eff, ally, state, state.enemies[wi]!, DUNGEON_BASIC_ATTACK, null, rng, t, emit);
}

/** Zranění (živí, pod max HP) členové party — cíle AoE heal. */
function injuredMembers(state: DungeonRunState): PartyMember[] {
  return partyMembers(state).filter((m) => m.currentHealth > 0 && m.currentHealth < m.maxHealth);
}

/** Jméno hráče (pro combat log u group heal). */
function playerName(state: DungeonRunState): string {
  return state.playerName;
}

/**
 * Aplikuje jeden útok aktéra (hráč/parťák) na konkrétního nepřítele. `self` je
 * léčitelný stav útočníka (lifesteal/drain heal). Sdíleno player/ally — žádná
 * duplikace damage vzorců.
 */
function combatantHitEnemy(
  attacker: CombatActor,
  self: PartyMember,
  state: DungeonRunState,
  enemy: DungeonRunEnemy,
  ability: SignatureAbility,
  slotTier: number | null,
  rng: SeededRng,
  t: number,
  emit: (e: CombatEvent) => void,
): void {
  const targetHpPct = enemy.maxHealth > 0 ? enemy.currentHealth / enemy.maxHealth : 0;
  const spec = abilityDamageSpec(ability, slotTier, attacker.level);
  const mult = spec ? 1 : abilityDamageMult(ability, targetHpPct);
  const bonusDice = bonusDiceSpec(ability, slotTier, attacker.level);
  const hit = computeHit(attacker, enemy.actor, rng, mult, false, ability.damageType, spec, {
    advantage: ability.advantage ? 'advantage' : undefined,
    bonusDice,
  });
  if (hit.hit && ability.save) {
    const outcome = applySpellSave(ability, attacker, enemy.actor, rng, hit.amount);
    hit.amount = outcome.amount;
    if (outcome.message) emit({ t, type: 'ability', message: outcome.message, source: enemy.name, target: attacker.name });
  }
  enemy.currentHealth = Math.max(0, enemy.currentHealth - hit.amount);

  let healed = hit.hit ? Math.round(hit.amount * attacker.lifesteal) : 0;
  if (hit.hit && ability.kind === 'drain') healed += Math.round(hit.amount * (ability.drainHealFraction ?? 0));
  if (healed > 0) self.currentHealth = Math.min(self.maxHealth, self.currentHealth + healed);

  if (hit.hit && ability.kind === 'dot' && ability.dotTicks) {
    const dotType = ability.damageType ?? attacker.damageType ?? 'bludgeoning';
    const interaction = damageInteraction(dotType, enemy.actor);
    const raw = dotTickRaw(ability, attacker);
    const tickDamage = interaction === 'immune' ? 0 : Math.max(1, applyDamageInteraction(Math.max(1, raw), interaction));
    enemy.dots.push({ remainingTicks: ability.dotTicks, tickDamage, sourceName: attacker.name, abilityName: ability.name });
  }

  const remaining = Math.round(enemy.currentHealth);
  const named = ability.id === DUNGEON_BASIC_ATTACK.id ? undefined : ability.name;
  emit({
    t,
    type: named ? 'ability' : 'attack',
    message: hit.hit
      ? buildAttackMessage({
          attacker,
          targetName: enemy.name,
          amount: hit.amount,
          crit: hit.crit,
          healed,
          abilityName: named,
          suffix: `. ${enemy.name}: ${remaining} HP`,
        })
      : missMessage(attacker.name, enemy.name, hit),
    source: attacker.name,
    target: enemy.name,
    amount: hit.amount,
    crit: hit.crit,
    ability: named,
    targetHealthRemaining: remaining,
  });
  if (enemy.currentHealth <= 0) {
    emit({ t, type: 'enemy_defeated', target: enemy.name, message: `☠️ ${enemy.name} is defeated!` });
  }
}

/** Vybere threat cíl nepřátelského úderu: první živý tank, jinak nejodolnější člen. */
function chooseThreatTarget(
  base: CombatActor,
  player: CombatActor,
  state: DungeonRunState,
): { isPlayer: boolean; allyIdx: number } {
  // Tank má prioritu (hráč-tank nebo parťák-tank).
  if (state.playerRole === 'tank' && state.player.currentHealth > 0) return { isPlayer: true, allyIdx: -1 };
  for (let i = 0; i < state.allies.length; i++) {
    const a = state.allies[i]!;
    if (a.currentHealth > 0 && a.role === 'tank') return { isPlayer: false, allyIdx: i };
  }
  // Bez tanka: nejodolnější (max HP) živý člen.
  const bestPlayer = state.player.currentHealth > 0 ? player.maxHealth : -1;
  let isPlayer = bestPlayer >= 0;
  let allyIdx = -1;
  let best = bestPlayer;
  for (let i = 0; i < state.allies.length; i++) {
    const a = state.allies[i]!;
    if (a.currentHealth <= 0) continue;
    if (a.actor.maxHealth > best) {
      best = a.actor.maxHealth;
      isPlayer = false;
      allyIdx = i;
    }
  }
  void base;
  return { isPlayer, allyIdx };
}

/**
 * Jeden nepřítel udeří na threat cíl (tank → nejodolnější člen). Aplikuje
 * tank-mitigaci, aktivní mitigation okno, absorpční štít. Vrací `true`, pokud
 * **padl hráč** (run končí — viz ADR: down hrdiny = konec runu). Pád parťáka
 * jen vyřadí parťáka, party bojuje dál.
 */
function enemyAttackParty(
  base: CombatActor,
  player: CombatActor,
  state: DungeonRunState,
  enemy: DungeonRunEnemy,
  rng: SeededRng,
  t: number,
  emit: (e: CombatEvent) => void,
): boolean {
  const threat = chooseThreatTarget(base, player, state);
  const isPlayer = threat.isPlayer;
  const member: PartyMember = isPlayer ? state.player : state.allies[threat.allyIdx]!;
  if (!member || member.currentHealth <= 0) return false;
  const targetActor = isPlayer ? player : effectiveAlly(state.allies[threat.allyIdx]!);
  const targetName = isPlayer ? player.name : state.allies[threat.allyIdx]!.name;
  const role: RaidRole = isPlayer ? state.playerRole : state.allies[threat.allyIdx]!.role;
  const mit = isPlayer ? state.player : state.allies[threat.allyIdx]!;

  const enemyHit = computeHit(enemy.actor, targetActor, rng, 1, false);
  let incoming = enemyHit.amount;
  if (role === 'tank') incoming = Math.max(1, Math.round(incoming * TANK_INCOMING_DAMAGE_MULT));
  if (mit.mitigationTurns > 0 && mit.mitigationPct > 0) {
    incoming = Math.max(1, Math.round(incoming * (1 - mit.mitigationPct)));
  }
  const absorbResult = applyAbsorb(incoming, mit.absorb);
  mit.absorb = absorbResult.shieldRemaining;
  member.currentHealth -= absorbResult.netDamage;
  const absorbSuffix = absorbResult.absorbed > 0 ? ` (${absorbResult.absorbed} absorbed)` : '';
  emit({
    t,
    type: 'attack',
    message: enemyHit.hit
      ? `${enemy.name} hits ${targetName} for ${absorbResult.netDamage}${enemyHit.crit ? ' (crit!)' : ''}${absorbSuffix}. ${targetName}: ${Math.max(0, Math.round(member.currentHealth))} HP`
      : missMessage(enemy.name, targetName, enemyHit),
    source: enemy.name,
    target: targetName,
    amount: absorbResult.netDamage,
    crit: enemyHit.crit,
    targetHealthRemaining: Math.max(0, Math.round(member.currentHealth)),
  });
  if (member.currentHealth <= 0) {
    member.currentHealth = 0;
    if (isPlayer) {
      state.status = 'dead';
      emit({
        t,
        type: 'player_defeated',
        message: `💀 ${targetName} has fallen in ${state.dungeonId} (encounter ${state.encounterIndex + 1}).`,
        source: enemy.name,
        target: targetName,
      });
      return true;
    }
    emit({
      t,
      type: 'player_defeated',
      message: `💀 ${targetName} has fallen! The party fights on.`,
      source: enemy.name,
      target: targetName,
    });
  }
  return false;
}

/** Encounter vyčištěn → další encounter (short rest + partial heal), nebo clear runu. */
function advanceEncounter(
  base: CombatActor,
  state: DungeonRunState,
  t: number,
  events: CombatEvent[],
): DungeonRunState {
  state.encountersCleared = state.encounterIndex + 1;
  const push = (e: CombatEvent): void => {
    events.push(e);
    pushLog(state, e);
  };

  if (state.encounterIndex + 1 >= state.encounterCount) {
    state.status = 'cleared';
    state.enemies = [];
    state.turn += 1;
    push({ t, type: 'victory', message: `🏆 Dungeon cleared! ${state.encountersCleared} encounters down.` });
    return state;
  }

  // Short rest mezi encountery: částečné doléčení živých členů (jako auto-resolve).
  const restHeal = (m: PartyMember): void => {
    if (m.currentHealth <= 0) return;
    const heal = Math.round(m.maxHealth * REST_HEAL_FRACTION);
    m.currentHealth = Math.min(m.maxHealth, m.currentHealth + heal);
  };
  restHeal(state.player);
  for (const ally of state.allies) restHeal(ally);
  push({
    t,
    type: 'heal',
    message: `🩹 The party catches its breath. ${base.name}: ${Math.round(state.player.currentHealth)} HP`,
    source: base.name,
    target: base.name,
    amount: Math.round(state.player.maxHealth * REST_HEAL_FRACTION),
  });

  state.encounterIndex += 1;
  state.turn += 1;
  spawnEncounter(base, state);
  return state;
}
