/**
 * Tahový dungeon run (dungeon overhaul Slice 2, ADR 0037).
 *
 * Interaktivní **tahový** boj postavy proti **sekvenci multi-enemy encounterů**
 * dungeonu — alternativa k idle auto-resolve (`simulateRaidRun`). Hráč kolo po
 * kole volí **ability + cíl** (multi-enemy → výběr nepřítele); server tah
 * vyhodnotí. Mezi encountery se per-encounter zdroje obnoví (sloty/Ki/cooldowny,
 * short-rest abstrakce) a postava se částečně doléčí.
 *
 * Tenhle modul je **čistý deterministický engine** (seed per tah → server-
 * authoritative, klient posílá jen volbu). Recykluje sdílené bojové primitivy
 * (`computeHit`, `abilityDamageSpec`, `healDiceSpec`, slot/Ki/rage helpery) —
 * žádná duplikace combat vzorců. Stav je plně serializovatelný (uloží se do DB
 * jako JSON, jako Gauntlet). Herní stringy anglicky (EN), komentáře česky.
 *
 * Solo = `size` 1 (Slice 2). Group/AI tahový = Slice 3+ (engine přijímá `size`).
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
  healDiceSpec,
  type CombatActor,
  type CombatEvent,
  type SignatureAbility,
} from './combat';
import { rollDice } from './dice';
import { applySpellSave, missMessage } from './dnd-combat';
import { applyDamageInteraction, damageInteraction } from './data/damage';
import { groupEncounters } from './group';
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

/** DoT „nalepený" na nepříteli (krvácení/hoření z hráčovy ability). */
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
}

/** Kompletní stav tahového dungeon runu (persistovaný jako JSON). */
export interface DungeonRunState {
  seed: number;
  dungeonId: string;
  /** Velikost party pro škálování nepřátel (solo = 1). */
  size: number;
  level: number;
  /** Globální čítač tahů (pro seedování + řazení logu). */
  turn: number;
  /** Index aktuálního encounteru (0-based). */
  encounterIndex: number;
  /** Počet encounterů v dungeonu (cílový stav = vyčistit všechny). */
  encounterCount: number;
  status: DungeonRunStatus;
  player: DungeonRunPlayer;
  enemies: DungeonRunEnemy[];
  /** Posledních pár událostí logu (oříznuto kvůli velikosti). */
  log: CombatEvent[];
  /** Počet vyčištěných encounterů (= postup). */
  encountersCleared: number;
}

// ── Odvození efektivního aktéra ──────────────────────────────────────────────

/** Efektivní bojový aktér hráče (rage varianta, pokud zuří). */
function effectivePlayer(base: CombatActor, state: DungeonRunState): CombatActor {
  const actor = state.player.raging ? applyRage(base) : base;
  return { ...actor, critChance: Math.min(MAX_CRIT_CHANCE, actor.critChance) };
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

/** Nastaví aktuální encounter + obnoví per-encounter zdroje hráče (short rest). */
function spawnEncounter(base: CombatActor, state: DungeonRunState): void {
  state.enemies = buildEncounterEnemies(state);
  state.player.cooldowns = {};
  state.player.absorb = base.shield ?? 0;
  state.player.mitigationTurns = 0;
  state.player.mitigationPct = 0;
  // Per-encounter refill slotů/Ki (short-rest abstrakce, jako auto-resolve pull).
  state.player.spellSlots = { ...(base.spellSlots ?? {}) };
  state.player.kiPoints = base.kiPoints ?? 0;
  // Rage (ADR 0034): auto-zuření na encounter, dokud má charge (per-run rationing).
  if (state.player.rageCharges > 0 && (base.rageCharges ?? 0) > 0) {
    state.player.rageCharges -= 1;
    state.player.raging = true;
  } else {
    state.player.raging = false;
  }
  state.status = 'in_combat';

  const names = state.enemies.map((e) => e.name);
  const label =
    state.enemies.length === 1
      ? `${names[0]}${state.enemies[0]!.isBoss ? ' (Boss)' : ''}`
      : `a pack of ${state.enemies.length} (${names.join(', ')})`;
  pushLog(state, {
    t: state.turn,
    type: 'encounter_start',
    message: `⚔️ Encounter ${state.encounterIndex + 1}/${state.encounterCount}: ${label} engages ${base.name}!`,
    target: names[0],
  });
}

/** Spustí nový tahový dungeon run (plné HP, encounter 0). */
export function startDungeonRun(
  base: CombatActor,
  dungeonId: string,
  size: number,
  level: number,
  seed: number,
): DungeonRunState {
  const state: DungeonRunState = {
    seed,
    dungeonId,
    size,
    level,
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
    },
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

// ── Tah ──────────────────────────────────────────────────────────────────────

/**
 * Vyhodnotí jeden tah: (1) DoT tiky na nepřátelích, (2) hráčova ability na cíl
 * (AoE = všichni živí), (3) protiútok všech živých nepřátel, (4) údržba. Vrací
 * nový stav + události tahu. Deterministické (seed per tah). Předpokládá validní
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
  if (livingEnemies(state).length === 0) {
    return { state: advanceEncounter(base, state, t, events), events };
  }

  // Commit zdrojů (slot/Ki) — až teď, aby DoT-kill neutratil zdroj nadarmo.
  let usedSlotTier: number | null = null;
  if (abilityTier >= 1) usedSlotTier = spendSlotForTier(state.player.spellSlots, abilityTier, abilityPrefersUpcast(ability));
  if (kiCost > 0) state.player.kiPoints -= kiCost;

  // (2) Hráčova ability.
  if (ability.kind === 'heal') {
    const spec = healDiceSpec(ability, usedSlotTier, player);
    const healed = spec
      ? Math.max(1, rollDice(rng, spec.count, spec.sides).total + spec.bonus)
      : Math.max(1, Math.round(player.attackPower * ability.damageMult * HEAL_POWER_FACTOR));
    state.player.currentHealth = Math.min(state.player.maxHealth, state.player.currentHealth + healed);
    emit({
      t,
      type: 'heal',
      message: `✨ ${player.name} casts ${ability.name}, healing for ${healed}. ${player.name}: ${Math.round(state.player.currentHealth)} HP`,
      source: player.name,
      target: player.name,
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
      playerHitEnemy(player, state, enemy, ability, usedSlotTier, rng, t, emit);
    }
  }

  // Cooldown zvolené ability.
  const cd = cooldownTurns(ability);
  if (cd > 0) state.player.cooldowns[abilityId] = cd;

  if (livingEnemies(state).length === 0) {
    return { state: advanceEncounter(base, state, t, events), events };
  }

  // (3) Protiútok všech živých nepřátel.
  for (const enemy of state.enemies) {
    if (enemy.currentHealth <= 0) continue;
    const enemyHit = computeHit(enemy.actor, player, rng, 1, false);
    let incoming = enemyHit.amount;
    if (state.player.mitigationTurns > 0 && state.player.mitigationPct > 0) {
      incoming = Math.max(1, Math.round(incoming * (1 - state.player.mitigationPct)));
    }
    const absorbResult = applyAbsorb(incoming, state.player.absorb);
    state.player.absorb = absorbResult.shieldRemaining;
    state.player.currentHealth -= absorbResult.netDamage;
    const absorbSuffix = absorbResult.absorbed > 0 ? ` (${absorbResult.absorbed} absorbed)` : '';
    emit({
      t,
      type: 'attack',
      message: enemyHit.hit
        ? `${enemy.name} hits ${player.name} for ${absorbResult.netDamage}${enemyHit.crit ? ' (crit!)' : ''}${absorbSuffix}. You: ${Math.max(0, Math.round(state.player.currentHealth))} HP`
        : missMessage(enemy.name, player.name, enemyHit),
      source: enemy.name,
      target: player.name,
      amount: absorbResult.netDamage,
      crit: enemyHit.crit,
      targetHealthRemaining: Math.max(0, Math.round(state.player.currentHealth)),
    });
    if (state.player.currentHealth <= 0) {
      state.player.currentHealth = 0;
      state.status = 'dead';
      emit({
        t,
        type: 'player_defeated',
        message: `💀 ${player.name} has fallen in ${state.dungeonId} (encounter ${state.encounterIndex + 1}).`,
        source: enemy.name,
        target: player.name,
      });
      return { state, events };
    }
  }

  // (4) Údržba: dekrement cooldownů + mitigace, posun tahu.
  for (const id of Object.keys(state.player.cooldowns)) {
    state.player.cooldowns[id] = Math.max(0, (state.player.cooldowns[id] ?? 0) - 1);
  }
  if (state.player.mitigationTurns > 0) {
    state.player.mitigationTurns -= 1;
    if (state.player.mitigationTurns === 0) state.player.mitigationPct = 0;
  }
  state.turn += 1;
  return { state, events };
}

/** Aplikuje jeden hráčův útok na konkrétního nepřítele (sdíleno basic/ability/AoE). */
function playerHitEnemy(
  player: CombatActor,
  state: DungeonRunState,
  enemy: DungeonRunEnemy,
  ability: SignatureAbility,
  slotTier: number | null,
  rng: SeededRng,
  t: number,
  emit: (e: CombatEvent) => void,
): void {
  const targetHpPct = enemy.maxHealth > 0 ? enemy.currentHealth / enemy.maxHealth : 0;
  const spec = abilityDamageSpec(ability, slotTier, player.level);
  const mult = spec ? 1 : abilityDamageMult(ability, targetHpPct);
  const bonusDice = bonusDiceSpec(ability, slotTier, player.level);
  const hit = computeHit(player, enemy.actor, rng, mult, false, ability.damageType, spec, {
    advantage: ability.advantage ? 'advantage' : undefined,
    bonusDice,
  });
  if (hit.hit && ability.save) {
    const outcome = applySpellSave(ability, player, enemy.actor, rng, hit.amount);
    hit.amount = outcome.amount;
    if (outcome.message) emit({ t, type: 'ability', message: outcome.message, source: enemy.name, target: player.name });
  }
  enemy.currentHealth = Math.max(0, enemy.currentHealth - hit.amount);

  let healed = hit.hit ? Math.round(hit.amount * player.lifesteal) : 0;
  if (hit.hit && ability.kind === 'drain') healed += Math.round(hit.amount * (ability.drainHealFraction ?? 0));
  if (healed > 0) state.player.currentHealth = Math.min(state.player.maxHealth, state.player.currentHealth + healed);

  if (hit.hit && ability.kind === 'dot' && ability.dotTicks) {
    const dotType = ability.damageType ?? player.damageType ?? 'bludgeoning';
    const interaction = damageInteraction(dotType, enemy.actor);
    const raw = dotTickRaw(ability, player);
    const tickDamage = interaction === 'immune' ? 0 : Math.max(1, applyDamageInteraction(Math.max(1, raw), interaction));
    enemy.dots.push({ remainingTicks: ability.dotTicks, tickDamage, sourceName: player.name, abilityName: ability.name });
  }

  const remaining = Math.round(enemy.currentHealth);
  const named = ability.id === DUNGEON_BASIC_ATTACK.id ? undefined : ability.name;
  emit({
    t,
    type: named ? 'ability' : 'attack',
    message: hit.hit
      ? buildAttackMessage({
          attacker: player,
          targetName: enemy.name,
          amount: hit.amount,
          crit: hit.crit,
          healed,
          abilityName: named,
          suffix: `. ${enemy.name}: ${remaining} HP`,
        })
      : missMessage(player.name, enemy.name, hit),
    source: player.name,
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

  // Short rest mezi encountery: částečné doléčení (jako auto-resolve).
  const heal = Math.round(state.player.maxHealth * REST_HEAL_FRACTION);
  state.player.currentHealth = Math.min(state.player.maxHealth, state.player.currentHealth + heal);
  push({
    t,
    type: 'heal',
    message: `🩹 The party catches its breath. ${base.name}: ${Math.round(state.player.currentHealth)} HP`,
    source: base.name,
    target: base.name,
    amount: heal,
  });

  state.encounterIndex += 1;
  state.turn += 1;
  spawnEncounter(base, state);
  return state;
}
