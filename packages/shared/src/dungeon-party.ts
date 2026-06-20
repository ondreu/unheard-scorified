/**
 * Živé MP tahové dungeon sezení (ADR 0038, dungeon overhaul Slice 4a).
 *
 * **Sdílený multi-owner** tahový boj party reálných hráčů (3/5) + případných AI
 * parťáků proti sekvenci multi-enemy encounterů. Model = **simultánní kolo s
 * buffrovanými akcemi** (drží round model Slice 2/3): každé kolo všichni živí
 * lidští hráči odešlou akci (`submitPartyAction`); jakmile všichni odešlou (nebo
 * vyprší deadline → `resolvePartyRound` s AI doplněním), **kolo se vyhodnotí**
 * (akce hráčů v pořadí slotů → AI-obsazené sloty → nepřátelé → údržba).
 *
 * Server je jediný zdroj pravdy (klient posílá jen volbu — anti-cheat); vše přes
 * `SeededRng` (determinismus, reprodukovatelnost). Stav je plně serializovatelný
 * (JSON do DB). Recykluje sdílené bojové primitivy + AI rozhodovací logiku ze
 * Slice 3 — žádná duplikace combat vzorců. **Nezasahuje do `dungeon-run.ts`**
 * (solo + 3-AI autofill běží beze změny). Herní stringy EN, komentáře CZ.
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
  isBonusAction,
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
import { DUNGEON_BASIC_ATTACK, DUNGEON_DODGE_ACTION, isEndTurnAction, type DungeonRunDot, type DungeonRunEnemy } from './dungeon-run';

/** Délka jednoho „tahu" v sekundách — převádí cooldown abilit (s) na počet tahů. */
const PARTY_TURN_SEC = 3;
const HEAL_POWER_FACTOR = 0.6;
const MAX_CRIT_CHANCE = 0.6;
const REST_HEAL_FRACTION = 0.5;

export type PartyRunStatus = 'in_combat' | 'cleared' | 'wiped';

/** Jeden člen party — reálný hráč (`owner` = characterId) nebo AI (`owner` = null). */
export interface PartyRunMember {
  /** Stabilní index slotu (0 = leader). */
  slot: number;
  name: string;
  /** characterId vlastníka (reálný hráč), nebo null pro AI. */
  owner: string | null;
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
  /**
   * Akční ekonomika (ADR 0042): ids „once per combat" abilit už použitých v
   * aktuálním encounteru. Reset short restem mezi encountery. `undefined` u
   * starších běhů → bere se jako prázdné.
   */
  usedOncePerCombat?: string[];
  /** Dodge (formální ukončení tahu): útoky na člena mají disadvantage do jeho dalšího tahu. */
  dodging?: boolean;
  /** Iniciativa pro aktuální encounter (d20 + DEX mod) — pořadí akcí v kole (4d). */
  initiative: number;
  /** Plný serializovatelný bojový aktér (RaidActor: role + healPower + rotace). */
  actor: RaidActor;
}

/** Buffrovaná akce hráče pro aktuální kolo. */
export interface PartyRunPendingAction {
  abilityId: string;
  targetId: number;
  /** Volitelná bonus-action ability (ADR 0042, Slice 3) — hráč ji vědomě zvolí
   * vedle hlavní akce (Healing Word). `undefined` = bez bonus akce. */
  bonusAbilityId?: string;
}

/** Kompletní stav živého MP tahového runu (persistovaný jako JSON). */
export interface PartyRunState {
  seed: number;
  dungeonId: string;
  size: number;
  level: number;
  turn: number;
  encounterIndex: number;
  encounterCount: number;
  status: PartyRunStatus;
  members: PartyRunMember[];
  enemies: DungeonRunEnemy[];
  log: CombatEvent[];
  encountersCleared: number;
  /** Buffrované akce reálných hráčů pro aktuální kolo (slot → akce). */
  pending: Record<number, PartyRunPendingAction>;
}

/** Vstup pro založení člena: vlastník (characterId | null) + jeho aktér. */
export interface PartyRunSeatInput {
  owner: string | null;
  actor: RaidActor;
}

// ── Pomocné ──────────────────────────────────────────────────────────────────

function clampCrit(actor: CombatActor): CombatActor {
  return { ...actor, critChance: Math.min(MAX_CRIT_CHANCE, actor.critChance) };
}

function effectiveActor(member: PartyRunMember): RaidActor {
  return clampCrit(member.raging ? applyRage(member.actor) : member.actor) as RaidActor;
}

/** Ability kit člena v runu (základní úder + signatures bez pasivních buffů). */
export function partyMemberAbilities(actor: CombatActor): SignatureAbility[] {
  return [DUNGEON_BASIC_ATTACK, ...actor.signatureAbilities.filter((a) => a.kind !== 'buff')];
}

function cooldownTurns(ability: SignatureAbility): number {
  if (ability.cooldownSec <= 0) return 0;
  return Math.max(1, Math.round(ability.cooldownSec / PARTY_TURN_SEC));
}

function livingEnemies(state: PartyRunState): number[] {
  const out: number[] = [];
  for (const e of state.enemies) if (e.currentHealth > 0) out.push(e.idx);
  return out;
}

function weakestEnemy(state: PartyRunState): number {
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

function livingMembers(state: PartyRunState): PartyRunMember[] {
  return state.members.filter((m) => m.currentHealth > 0);
}

/** Živí lidští hráči (mají owner). */
function livingHumans(state: PartyRunState): PartyRunMember[] {
  return state.members.filter((m) => m.currentHealth > 0 && m.owner != null);
}

/** Nejzraněnější živý člen party (největší chybějící HP). */
function mostInjured(state: PartyRunState): PartyRunMember | null {
  let worst: PartyRunMember | null = null;
  let worstMissing = 0;
  for (const m of state.members) {
    if (m.currentHealth <= 0) continue;
    const missing = m.maxHealth - m.currentHealth;
    if (missing > worstMissing) {
      worstMissing = missing;
      worst = m;
    }
  }
  return worst;
}

/**
 * Cíl léčení (friendly targeting): `targetId` = `slot` člena party. Neplatný /
 * mrtvý cíl → fallback na nejzraněnějšího člena (resp. sesilatele). Útočné cíle
 * řeší `targetId` jako index nepřítele → význam je jednoznačný dle `ability.kind`.
 */
function resolveHealTarget(state: PartyRunState, targetId: number, caster: PartyRunMember): PartyRunMember {
  const chosen = state.members.find((m) => m.slot === targetId);
  if (chosen && chosen.currentHealth > 0) return chosen;
  return mostInjured(state) ?? caster;
}

/**
 * Cíl shield/mitigation (friendly targeting): `targetId` = `slot` člena. Neplatný /
 * mrtvý cíl → fallback na sesilatele (shield na sebe = rozumný default; AI posílá
 * vlastní slot).
 */
function resolveSupportTarget(state: PartyRunState, targetId: number, caster: PartyRunMember): PartyRunMember {
  const chosen = state.members.find((m) => m.slot === targetId);
  return chosen && chosen.currentHealth > 0 ? chosen : caster;
}

function pushLog(state: PartyRunState, e: CombatEvent): void {
  state.log.push(e);
  if (state.log.length > 150) state.log = state.log.slice(-150);
}

// ── Encounter lifecycle ──────────────────────────────────────────────────────

function buildEncounterEnemies(state: PartyRunState): DungeonRunEnemy[] {
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

/** Obnoví per-encounter zdroje člena (short rest: sloty/Ki/cooldowny + rage charge). */
function restoreMemberResources(member: PartyRunMember): void {
  member.cooldowns = {};
  member.absorb = member.actor.shield ?? 0;
  member.mitigationTurns = 0;
  member.mitigationPct = 0;
  member.spellSlots = { ...(member.actor.spellSlots ?? {}) };
  member.kiPoints = member.actor.kiPoints ?? 0;
  member.usedOncePerCombat = []; // short rest obnoví „once per combat" okna (ADR 0042)
  if (member.rageCharges > 0 && (member.actor.rageCharges ?? 0) > 0) {
    member.rageCharges -= 1;
    member.raging = true;
  } else {
    member.raging = false;
  }
}

function spawnEncounter(state: PartyRunState): void {
  state.enemies = buildEncounterEnemies(state);
  // Iniciativa per encounter (D&D, 4d): d20 + DEX mod → pořadí akcí v kole.
  const initRng = new SeededRng(seedFromString(`${state.seed}:init:${state.encounterIndex}`));
  for (const m of state.members) {
    if (m.currentHealth > 0) restoreMemberResources(m);
    const dexMod = m.actor.saveMods?.dexterity ?? 0;
    m.initiative = Math.floor(initRng.next() * 20) + 1 + dexMod;
  }
  state.pending = {};
  state.status = 'in_combat';

  const names = state.enemies.map((e) => e.name);
  const label =
    state.enemies.length === 1
      ? `${names[0]}${state.enemies[0]!.isBoss ? ' (Boss)' : ''}`
      : `a pack of ${state.enemies.length} (${names.join(', ')})`;
  pushLog(state, {
    t: state.turn,
    type: 'encounter_start',
    message: `⚔️ Encounter ${state.encounterIndex + 1}/${state.encounterCount}: ${label} engages the party!`,
    target: names[0],
  });
}

/** Založí živý MP tahový run (plné HP, encounter 0). `seats` = členové (lidé + AI). */
export function startPartyRun(
  seats: PartyRunSeatInput[],
  dungeonId: string,
  size: number,
  level: number,
  seed: number,
): PartyRunState {
  const members: PartyRunMember[] = seats.map((seat, slot) => ({
    slot,
    name: seat.actor.name,
    owner: seat.owner,
    role: seat.actor.role,
    maxHealth: seat.actor.maxHealth,
    currentHealth: seat.actor.maxHealth,
    absorb: seat.actor.shield ?? 0,
    cooldowns: {},
    spellSlots: { ...(seat.actor.spellSlots ?? {}) },
    kiPoints: seat.actor.kiPoints ?? 0,
    rageCharges: seat.actor.rageCharges ?? 0,
    raging: false,
    mitigationTurns: 0,
    mitigationPct: 0,
    usedOncePerCombat: [],
    initiative: 0,
    actor: seat.actor,
  }));
  const state: PartyRunState = {
    seed,
    dungeonId,
    size,
    level,
    turn: 0,
    encounterIndex: 0,
    encounterCount: groupEncounters('dungeon', dungeonId, size).length,
    status: 'in_combat',
    members,
    enemies: [],
    log: [],
    encountersCleared: 0,
    pending: {},
  };
  spawnEncounter(state);
  return state;
}

// ── Submit akce hráče ─────────────────────────────────────────────────────────

/**
 * Zbuffruje akci reálného hráče pro aktuální kolo. Validuje vlastnictví (owner ==
 * characterId), že člen žije, ability je v kitu/ready/má zdroj. Vrací `ready`
 * = všichni živí lidé už odeslali (volající pak může vyhodnotit kolo).
 */
export function submitPartyAction(
  state: PartyRunState,
  characterId: string,
  abilityId: string,
  targetId: number,
  /** Volitelná bonus-action ability (ADR 0042, Slice 3) — vědomá volba hráče. */
  bonusAbilityId?: string,
): { ok: boolean; ready: boolean; reason?: string } {
  if (state.status !== 'in_combat') return { ok: false, ready: false, reason: 'Run finished' };
  const member = state.members.find((m) => m.owner === characterId && m.currentHealth > 0);
  if (!member) return { ok: false, ready: false, reason: 'Not your turn or fallen' };

  // Formální ukončení tahu (Pass/Dodge) — vždy dostupné, žádný zdroj/cooldown.
  if (isEndTurnAction(abilityId)) {
    state.pending[member.slot] = { abilityId, targetId: 0 };
    const ready = livingHumans(state).every((h) => state.pending[h.slot] !== undefined);
    return { ok: true, ready };
  }

  const ability =
    abilityId === DUNGEON_BASIC_ATTACK.id
      ? DUNGEON_BASIC_ATTACK
      : member.actor.signatureAbilities.find((a) => a.id === abilityId);
  if (!ability || ability.kind === 'buff') return { ok: false, ready: false, reason: 'Unknown ability' };
  if ((member.cooldowns[abilityId] ?? 0) > 0) return { ok: false, ready: false, reason: 'On cooldown' };
  if (ability.oncePerCombat && (member.usedOncePerCombat ?? []).includes(abilityId)) {
    return { ok: false, ready: false, reason: 'Already used this fight' };
  }
  const tier = ability.spellTier ?? 0;
  if (tier >= 1 && !hasSlotForTier(member.spellSlots, tier)) return { ok: false, ready: false, reason: 'No spell slot' };
  if ((ability.kiCost ?? 0) > member.kiPoints) return { ok: false, ready: false, reason: 'Not enough Ki' };

  // Bonus-action volba (ADR 0042, Slice 3): ulož jen validní bonus-action ability
  // (jinak ignoruj — resolution ji stejně přeskočí). Vědomá volba hráče.
  const bonusValid =
    bonusAbilityId != null &&
    bonusAbilityId !== abilityId &&
    isBonusAction(
      (member.actor.signatureAbilities.find((a) => a.id === bonusAbilityId) ?? { actionCost: 'action' } as SignatureAbility),
    );
  state.pending[member.slot] = {
    abilityId,
    targetId: Number(targetId) || 0,
    ...(bonusValid ? { bonusAbilityId } : {}),
  };
  const humans = livingHumans(state);
  const ready = humans.every((h) => state.pending[h.slot] !== undefined);
  return { ok: true, ready };
}

/** Odeslali už všichni živí lidé akci pro toto kolo? */
export function partyRoundReady(state: PartyRunState): boolean {
  if (state.status !== 'in_combat') return false;
  return livingHumans(state).every((h) => state.pending[h.slot] !== undefined);
}

// ── Vyhodnocení kola ───────────────────────────────────────────────────────────

/**
 * Vyhodnotí jedno kolo: (1) DoT tiky, (2) akce **všech členů** v pořadí slotů
 * (buffrovaná akce hráče; chybějící hráč / AI člen → AI volba — fallback), (3)
 * protiútok nepřátel na threat, (4) údržba. Buffrované akce se vyčistí. Volej,
 * až je kolo `ready` (všichni lidé odeslali) NEBO vyprší deadline (AI doplní).
 */
export function resolvePartyRound(state: PartyRunState): { state: PartyRunState; events: CombatEvent[] } {
  if (state.status !== 'in_combat' || state.enemies.length === 0) return { state, events: [] };

  const rng = new SeededRng(seedFromString(`${state.seed}:round:${state.encounterIndex}:${state.turn}`));
  const t = state.turn;
  const events: CombatEvent[] = [];
  const emit = (e: CombatEvent): void => {
    events.push(e);
    pushLog(state, e);
  };

  // (1) DoT tiky na nepřátelích.
  tickEnemyDots(state, t, emit);
  if (livingEnemies(state).length === 0) {
    advanceEncounter(state, t, emit);
    state.pending = {};
    return { state, events };
  }

  // (2) Akce členů v pořadí **iniciativy** (4d; tie-break slot): hráč s buffrovanou
  // akcí ji provede, jinak AI (fallback za nečinného / AI parťák).
  const order = [...state.members].sort((a, b) => b.initiative - a.initiative || a.slot - b.slot);
  for (const member of order) {
    if (member.currentHealth <= 0) continue;
    const action = member.owner != null ? state.pending[member.slot] : undefined;
    takeMemberTurn(state, member, action, rng, t, emit);
    // Bonus action (ADR 0042, Slice 3): lidský hráč ji vědomě zvolil (action.bonusAbilityId);
    // AI člen si bonus heal zvolí sám. Nic se neděje za hráče bez jeho volby.
    if (member.currentHealth > 0) {
      if (member.owner != null) {
        if (action?.bonusAbilityId && action.bonusAbilityId !== action.abilityId) {
          const eff = effectiveActor(member);
          const bonus = eff.signatureAbilities.find((a) => a.id === action.bonusAbilityId);
          if (bonus) resolveMemberBonusHeal(member, eff, state, bonus, rng, t, emit);
        }
      } else {
        autoMemberBonusHeal(member, effectiveActor(member), state, rng, t, emit);
      }
    }
    if (livingEnemies(state).length === 0) {
      advanceEncounter(state, t, emit);
      state.pending = {};
      return { state, events };
    }
  }

  // (3) Protiútok všech živých nepřátel na threat.
  for (const enemy of state.enemies) {
    if (enemy.currentHealth <= 0) continue;
    enemyAttackParty(state, enemy, rng, t, emit);
    if (livingMembers(state).length === 0) {
      state.status = 'wiped';
      emit({ t, type: 'defeat', message: `☠️ The party has wiped in ${state.dungeonId}.` });
      state.pending = {};
      return { state, events };
    }
  }

  // (4) Údržba: cooldowny + mitigace všech živých členů, posun kola, vyčisti buffer.
  for (const m of state.members) if (m.currentHealth > 0) tickDownTurn(m);
  state.turn += 1;
  state.pending = {};
  return { state, events };
}

function tickEnemyDots(state: PartyRunState, t: number, emit: (e: CombatEvent) => void): void {
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
    enemy.dots = enemy.dots.filter((d: DungeonRunDot) => d.remainingTicks > 0);
    if (enemy.currentHealth <= 0) {
      emit({ t, type: 'enemy_defeated', target: enemy.name, message: `☠️ ${enemy.name} is defeated!` });
    }
  }
}

function tickDownTurn(m: PartyRunMember): void {
  for (const id of Object.keys(m.cooldowns)) {
    m.cooldowns[id] = Math.max(0, (m.cooldowns[id] ?? 0) - 1);
  }
  if (m.mitigationTurns > 0) {
    m.mitigationTurns -= 1;
    if (m.mitigationTurns === 0) m.mitigationPct = 0;
  }
}

function healAmount(actor: CombatActor, ability: SignatureAbility, slotTier: number | null, rng: SeededRng): number {
  const spec = healDiceSpec(ability, slotTier, actor);
  if (spec) return Math.max(1, rollDice(rng, spec.count, spec.sides).total + spec.bonus);
  const healPower = (actor as Partial<RaidActor>).healPower ?? 0;
  const base = healPower > 0 ? healPower : actor.attackPower * HEAL_POWER_FACTOR;
  return Math.max(1, Math.round(base * ability.damageMult * (0.9 + rng.next() * 0.2)));
}

/**
 * Provede tah jednoho člena: pokud `action` (buffrovaná hráčem) je platná, provede
 * ji; jinak (AI člen NEBO hráč bez akce → **fallback**) zvolí AI tah dle role +
 * rotace. Sdíleno lidé/AI — žádná duplikace rozhodování.
 */
function takeMemberTurn(
  state: PartyRunState,
  member: PartyRunMember,
  action: PartyRunPendingAction | undefined,
  rng: SeededRng,
  t: number,
  emit: (e: CombatEvent) => void,
): void {
  const eff = effectiveActor(member);

  // Začátek tvého tahu → případný Dodge z minulého kola vyprší.
  member.dodging = false;

  // Formální ukončení tahu (Pass/Dodge): žádná akce, neklesni do AI fallbacku.
  if (action && isEndTurnAction(action.abilityId)) {
    if (action.abilityId === DUNGEON_DODGE_ACTION) {
      member.dodging = true;
      emit({ t, type: 'ability', source: member.name, target: member.name, message: `🤺 ${member.name} takes the Dodge action — incoming attacks have disadvantage.` });
    } else {
      emit({ t, type: 'ability', source: member.name, target: member.name, message: `⏭️ ${member.name} ends the turn.` });
    }
    return;
  }

  // Lidská buffrovaná akce (re-validace zdrojů; cooldown už ověřen při submitu).
  if (action) {
    const ability =
      action.abilityId === DUNGEON_BASIC_ATTACK.id
        ? DUNGEON_BASIC_ATTACK
        : eff.signatureAbilities.find((a) => a.id === action.abilityId);
    if (ability && ability.kind !== 'buff' && (member.cooldowns[action.abilityId] ?? 0) <= 0) {
      const tier = ability.spellTier ?? 0;
      const hasSlot = tier < 1 || hasSlotForTier(member.spellSlots, tier);
      const hasKi = (ability.kiCost ?? 0) <= member.kiPoints;
      // Akční ekonomika (ADR 0042): „once per combat" okno (mohlo vyprchat mezi koly).
      const hasOnce = !ability.oncePerCombat || !(member.usedOncePerCombat ?? []).includes(ability.id);
      if (hasSlot && hasKi && hasOnce) {
        applyMemberAbility(state, member, eff, ability, action.targetId, rng, t, emit);
        return;
      }
    }
    // Neplatná akce (zdroj vyprchal mezi koly) → spadne do AI fallbacku.
  }

  // AI volba (AI člen nebo fallback za nečinného hráče).
  aiMemberTurn(state, member, eff, rng, t, emit);
}

/**
 * Vyřeší **bonus-action** heal (ADR 0042, Slice 3) konkrétní zvolenou ability
 * (Healing Word) — léčí nejzraněnějšího člena party. Ověří zdroje; spotřebuje
 * slot/Ki + cooldown. Vrací `true`, pokud heal proběhl. Na cooldownu (typicky proto,
 * že ability byla použita jako hlavní akce) → `false` (žádná dvojitá bonus akce).
 */
function resolveMemberBonusHeal(
  member: PartyRunMember,
  actor: RaidActor,
  state: PartyRunState,
  ability: SignatureAbility,
  rng: SeededRng,
  t: number,
  emit: (e: CombatEvent) => void,
): boolean {
  if (!isBonusAction(ability) || ability.kind !== 'heal') return false;
  if ((member.cooldowns[ability.id] ?? 0) > 0) return false;
  const tier = ability.spellTier ?? 0;
  if (tier >= 1 && !hasSlotForTier(member.spellSlots, tier)) return false;
  if ((ability.kiCost ?? 0) > member.kiPoints) return false;
  const target = mostInjured(state);
  if (!target || target.currentHealth >= target.maxHealth) return false;
  const slotTier = tier >= 1 ? spendSlotForTier(member.spellSlots, tier, abilityPrefersUpcast(ability)) : null;
  if ((ability.kiCost ?? 0) > 0) member.kiPoints -= ability.kiCost ?? 0;
  const healed = healAmount(actor, ability, slotTier, rng);
  target.currentHealth = Math.min(target.maxHealth, target.currentHealth + healed);
  member.cooldowns[ability.id] = cooldownTurns(ability);
  emit({
    t,
    type: 'heal',
    message: `✨ ${member.name} casts ${ability.name} as a bonus action, healing ${target.name} for ${healed}. ${target.name}: ${Math.round(target.currentHealth)} HP`,
    source: member.name,
    target: target.name,
    amount: healed,
    ability: ability.name,
  });
  return true;
}

/** AI člen: po hlavní akci sešle první ready bonus-action heal (D&D 1 bonus/kolo). */
function autoMemberBonusHeal(
  member: PartyRunMember,
  actor: RaidActor,
  state: PartyRunState,
  rng: SeededRng,
  t: number,
  emit: (e: CombatEvent) => void,
): void {
  for (const ability of actor.signatureAbilities) {
    if (resolveMemberBonusHeal(member, actor, state, ability, rng, t, emit)) return;
  }
}

/** Aplikuje konkrétní ability člena (heal/shield/mitigation/offensive) na cíl(e). */
function applyMemberAbility(
  state: PartyRunState,
  member: PartyRunMember,
  eff: RaidActor,
  ability: SignatureAbility,
  targetId: number,
  rng: SeededRng,
  t: number,
  emit: (e: CombatEvent) => void,
): void {
  const tier = ability.spellTier ?? 0;
  const usedSlot = tier >= 1 ? spendSlotForTier(member.spellSlots, tier, abilityPrefersUpcast(ability)) : null;
  if ((ability.kiCost ?? 0) > 0) member.kiPoints -= ability.kiCost ?? 0;
  if (ability.oncePerCombat) (member.usedOncePerCombat ??= []).push(ability.id); // ADR 0042

  if (ability.kind === 'heal') {
    const targets = ability.aoe
      ? state.members.filter((m) => m.currentHealth > 0 && m.currentHealth < m.maxHealth)
      : [resolveHealTarget(state, targetId, member)];
    for (const target of targets) {
      const healed = healAmount(eff, ability, usedSlot, rng);
      target.currentHealth = Math.min(target.maxHealth, target.currentHealth + healed);
      emit({
        t,
        type: 'heal',
        message: `💚 ${member.name} casts ${ability.name} on ${target.name} for ${healed}. ${target.name}: ${Math.round(target.currentHealth)} HP`,
        source: member.name,
        target: target.name,
        amount: healed,
        ability: ability.name,
      });
    }
  } else if (ability.kind === 'shield') {
    const target = resolveSupportTarget(state, targetId, member);
    target.absorb += Math.round(eff.attackPower * ability.damageMult);
    emit({
      t,
      type: 'absorb',
      source: member.name,
      target: target.name,
      ability: ability.name,
      message: target === member ? `🛡️ ${member.name} casts ${ability.name}.` : `🛡️ ${member.name} shields ${target.name}.`,
    });
  } else if (ability.kind === 'mitigation') {
    const target = resolveSupportTarget(state, targetId, member);
    target.mitigationTurns = Math.max(1, Math.round((ability.mitigationDurationSec ?? PARTY_TURN_SEC) / PARTY_TURN_SEC));
    target.mitigationPct = ability.mitigationPct ?? 0;
    emit({
      t,
      type: 'ability',
      source: member.name,
      target: target.name,
      ability: ability.name,
      message:
        target === member
          ? `🛡️ ${member.name} uses ${ability.name}, bracing against the next blows.`
          : `🛡️ ${member.name} uses ${ability.name} on ${target.name}, bracing them against the next blows.`,
    });
  } else {
    const living = livingEnemies(state);
    let targets: number[];
    if (ability.aoe) {
      targets = living;
    } else {
      const valid = state.enemies[targetId]?.currentHealth ?? 0;
      const ei = valid > 0 ? targetId : weakestEnemy(state);
      targets = ei >= 0 ? [ei] : [];
    }
    for (const ei of targets) {
      const enemy = state.enemies[ei]!;
      if (enemy.currentHealth <= 0) continue;
      memberHitEnemy(state, member, eff, enemy, ability, usedSlot, rng, t, emit);
    }
    // Akční ekonomika (ADR 0042, Slice 2): Action Surge → extra úder(y) na nejslabšího.
    const extras = extraActionCount(ability);
    for (let k = 0; k < extras; k++) {
      const xwi = weakestEnemy(state);
      if (xwi < 0) break;
      memberHitEnemy(state, member, eff, state.enemies[xwi]!, EXTRA_ATTACK_ABILITY, null, rng, t, emit);
    }
  }
  const cd = cooldownTurns(ability);
  if (cd > 0) member.cooldowns[ability.id] = cd;
}

/** AI volba tahu člena (role + rotace) — sdílí logiku se Slice 3 (`dungeon-run`). */
function aiMemberTurn(
  state: PartyRunState,
  member: PartyRunMember,
  eff: RaidActor,
  rng: SeededRng,
  t: number,
  emit: (e: CombatEvent) => void,
): void {
  const living = livingEnemies(state);
  if (living.length === 0) return;
  const wi = weakestEnemy(state);
  const enemyHpPct = wi >= 0 && state.enemies[wi]!.maxHealth > 0 ? state.enemies[wi]!.currentHealth / state.enemies[wi]!.maxHealth : 0;
  const selfHpPct = member.maxHealth > 0 ? member.currentHealth / member.maxHealth : 0;
  const ctx = { enemyHpPct, selfHpPct };
  const injured = mostInjured(state);

  for (const ability of eff.signatureAbilities) {
    if (ability.kind === 'buff') continue;
    if ((member.cooldowns[ability.id] ?? 0) > 0) continue;
    if (ability.oncePerCombat && (member.usedOncePerCombat ?? []).includes(ability.id)) continue; // ADR 0042
    const tier = ability.spellTier ?? 0;
    if (tier >= 1 && !hasSlotForTier(member.spellSlots, tier)) continue;
    if ((ability.kiCost ?? 0) > member.kiPoints) continue;

    if (ability.kind === 'heal') {
      if (member.role !== 'healer' || (member.actor.healPower ?? 0) <= 0 || !injured) continue;
      if (!shouldCastHeal(eff.rotation, ability.id, { enemyHpPct, selfHpPct: injured.maxHealth > 0 ? injured.currentHealth / injured.maxHealth : 0 })) continue;
      // AI healer cílí nejzraněnějšího (friendly targeting: targetId = slot člena).
      applyMemberAbility(state, member, eff, ability, injured.slot, rng, t, emit);
      return;
    }
    if (ability.kind === 'mitigation') {
      if (member.role !== 'tank' || member.mitigationTurns > 0) continue;
      if (!shouldCastAbility(eff.rotation, ability.id, ctx)) continue;
      applyMemberAbility(state, member, eff, ability, member.slot, rng, t, emit); // self
      return;
    }
    if (ability.kind === 'shield') {
      if (!shouldCastAbility(eff.rotation, ability.id, ctx)) continue;
      applyMemberAbility(state, member, eff, ability, member.slot, rng, t, emit); // self
      return;
    }
    if (wi < 0 || !shouldCastAbility(eff.rotation, ability.id, ctx)) continue;
    applyMemberAbility(state, member, eff, ability, wi, rng, t, emit);
    return;
  }

  // Fallback: healer s raněným spojencem → free basic heal; jinak basic úder.
  if (member.role === 'healer' && injured) {
    const healed = healAmount(eff, DUNGEON_BASIC_ATTACK, null, rng);
    injured.currentHealth = Math.min(injured.maxHealth, injured.currentHealth + healed);
    emit({
      t,
      type: 'heal',
      message: `💚 ${member.name} mends ${injured.name} for ${healed}. ${injured.name}: ${Math.round(injured.currentHealth)} HP`,
      source: member.name,
      target: injured.name,
      amount: healed,
    });
    return;
  }
  if (wi >= 0) memberHitEnemy(state, member, eff, state.enemies[wi]!, DUNGEON_BASIC_ATTACK, null, rng, t, emit);
}

/** Aplikuje jeden útok člena na nepřítele (sdíleno human/AI). */
function memberHitEnemy(
  state: PartyRunState,
  member: PartyRunMember,
  attacker: RaidActor,
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
  if (healed > 0) member.currentHealth = Math.min(member.maxHealth, member.currentHealth + healed);

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
    source: member.name,
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

/** Threat cíl: první živý tank, jinak nejodolnější (max HP) živý člen. */
function chooseThreat(state: PartyRunState): PartyRunMember | null {
  const tank = state.members.find((m) => m.currentHealth > 0 && m.role === 'tank');
  if (tank) return tank;
  let best: PartyRunMember | null = null;
  for (const m of state.members) {
    if (m.currentHealth <= 0) continue;
    if (!best || m.maxHealth > best.maxHealth) best = m;
  }
  return best;
}

/** Jeden nepřítel udeří na threat cíl (tank-mitigace, mitigation okno, absorb). */
function enemyAttackParty(
  state: PartyRunState,
  enemy: DungeonRunEnemy,
  rng: SeededRng,
  t: number,
  emit: (e: CombatEvent) => void,
): void {
  const target = chooseThreat(state);
  if (!target) return;
  const targetActor = effectiveActor(target);
  // Dodge: útoky na bránícího se člena mají disadvantage.
  const hit = computeHit(enemy.actor, targetActor, rng, 1, false, undefined, undefined, target.dodging ? { advantage: 'disadvantage' } : undefined);
  let incoming = hit.amount;
  if (target.role === 'tank') incoming = Math.max(1, Math.round(incoming * TANK_INCOMING_DAMAGE_MULT));
  if (target.mitigationTurns > 0 && target.mitigationPct > 0) {
    incoming = Math.max(1, Math.round(incoming * (1 - target.mitigationPct)));
  }
  const absorb = applyAbsorb(incoming, target.absorb);
  target.absorb = absorb.shieldRemaining;
  target.currentHealth -= absorb.netDamage;
  const absorbSuffix = absorb.absorbed > 0 ? ` (${absorb.absorbed} absorbed)` : '';
  emit({
    t,
    type: 'attack',
    message: hit.hit
      ? `${enemy.name} hits ${target.name} for ${absorb.netDamage}${hit.crit ? ' (crit!)' : ''}${absorbSuffix}. ${target.name}: ${Math.max(0, Math.round(target.currentHealth))} HP`
      : missMessage(enemy.name, target.name, hit),
    source: enemy.name,
    target: target.name,
    amount: absorb.netDamage,
    crit: hit.crit,
    targetHealthRemaining: Math.max(0, Math.round(target.currentHealth)),
  });
  if (target.currentHealth <= 0) {
    target.currentHealth = 0;
    emit({ t, type: 'player_defeated', source: enemy.name, target: target.name, message: `💀 ${target.name} has fallen! The party fights on.` });
  }
}

/** Encounter vyčištěn → další (short rest + partial heal), nebo clear runu. */
function advanceEncounter(state: PartyRunState, t: number, emit: (e: CombatEvent) => void): void {
  state.encountersCleared = state.encounterIndex + 1;
  if (state.encounterIndex + 1 >= state.encounterCount) {
    state.status = 'cleared';
    state.enemies = [];
    state.turn += 1;
    emit({ t, type: 'victory', message: `🏆 Dungeon cleared! ${state.encountersCleared} encounters down.` });
    return;
  }
  for (const m of state.members) {
    if (m.currentHealth <= 0) continue;
    m.currentHealth = Math.min(m.maxHealth, m.currentHealth + Math.round(m.maxHealth * REST_HEAL_FRACTION));
  }
  emit({ t, type: 'heal', message: `🩹 The party catches its breath.`, amount: 0 });
  state.encounterIndex += 1;
  state.turn += 1;
  spawnEncounter(state);
}
