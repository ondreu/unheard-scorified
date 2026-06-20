/**
 * Akční ekonomika (ADR 0042, Slice 1) — kontrakt „once per combat".
 *
 * Action Surge (Fighter) a opener Assassinate (Rogue) se smí v jednom souboji
 * použít **jen jednou** (D&D short-rest / opener), pak se „drží". Okno se resetuje
 * na začátku každého encounteru (short rest / nová vlna / nový pull). Ověřujeme
 * sdílené helpery + chování napříč simulátory (quest / dungeon / gauntlet).
 */
import { describe, expect, it } from 'vitest';
import {
  abilityOnceAvailable,
  baseStatsFor,
  canCastDungeonAbility,
  deriveCombatProfile,
  DUNGEONS,
  EMPTY_PROGRESSION,
  EXTRA_ATTACK_ABILITY,
  extraActionCount,
  markAbilityUsed,
  resolveDungeonTurn,
  resolveGauntletTurn,
  startDungeonRun,
  startGauntletRun,
  type CombatActor,
  type SignatureAbility,
} from './index';
import { questFoeStats, simulateQuestEncounter } from './quest-run';
import { SeededRng } from './rng';

const ACTION_SURGE_ID = 'fighter_action_surge';

function fighter(level: number, equipment: Record<string, number> = {}): CombatActor {
  return deriveCombatProfile({
    name: 'Hero',
    level,
    klass: 'fighter',
    primary: baseStatsFor('human', 'fighter', level),
    equipment,
    progression: EMPTY_PROGRESSION,
  });
}

function actionSurge(actor: CombatActor): SignatureAbility {
  const a = actor.signatureAbilities.find((s) => s.id === ACTION_SURGE_ID);
  if (!a) throw new Error('fighter should know Action Surge at this level');
  return a;
}

describe('once-per-combat helpers', () => {
  const once: SignatureAbility = { id: 'x', name: 'X', kind: 'strike', cooldownSec: 0, damageMult: 1, oncePerCombat: true };
  const normal: SignatureAbility = { id: 'y', name: 'Y', kind: 'strike', cooldownSec: 0, damageMult: 1 };

  it('gatuje jen ability s flagem; bez flagu vždy dostupné', () => {
    const used = new Set<string>();
    expect(abilityOnceAvailable(used, once)).toBe(true);
    expect(abilityOnceAvailable(used, normal)).toBe(true);
    markAbilityUsed(used, once);
    markAbilityUsed(used, normal); // no-op (bez flagu)
    expect(abilityOnceAvailable(used, once)).toBe(false);
    expect(abilityOnceAvailable(used, normal)).toBe(true);
    expect(used.has('y')).toBe(false);
  });
});

describe('quest combat (continuous)', () => {
  it('Action Surge fires at most once per fight', () => {
    const player = fighter(6); // Action Surge unlocks at 6
    // Velmi tanky boss → boj jede do časového stropu (spousta tahů) → bez gatingu
    // by Action Surge vystřelil opakovaně.
    const foe = questFoeStats({ name: 'Colossus', tier: 'boss' }, 60);
    const out = simulateQuestEncounter(player, foe, new SeededRng(7), 0);
    const surges = out.events.filter((e) => e.ability === 'Action Surge');
    expect(surges.length).toBe(1);
    // Sanity: souboj byl dlouhý (víc tahů než jeden) — gating, ne krátký fight.
    expect(out.events.filter((e) => e.type === 'attack' || e.type === 'ability').length).toBeGreaterThan(10);
  });
});

describe('dungeon (turn-based)', () => {
  it('blokuje druhé Action Surge i po vyprchání cooldownu', () => {
    // Slabý fighter (L6, bez gearu) vs tanky high-level dungeon → encounter přežije
    // Action Surge tah (jinak by vyčištění encounteru zresetovalo „once" okno).
    const base = fighter(6);
    const dungeon = DUNGEONS.stratholme!;
    const state = startDungeonRun(base, 'stratholme', 1, dungeon.requiredLevel, 11);
    const surge = actionSurge(base);
    const target = state.enemies[0]!.idx;

    expect(canCastDungeonAbility(state, surge)).toBe(true);
    const first = resolveDungeonTurn(base, state, ACTION_SURGE_ID, target);
    expect(first.events.some((e) => e.ability === 'Action Surge')).toBe(true);
    expect(state.player.usedOncePerCombat).toContain(ACTION_SURGE_ID);
    expect(canCastDungeonAbility(state, surge)).toBe(false);

    // Vynuluj cooldown → izoluje „once per combat" od cooldownu: pořád blokováno.
    state.player.cooldowns[ACTION_SURGE_ID] = 0;
    const second = resolveDungeonTurn(base, state, ACTION_SURGE_ID, target);
    expect(second.events.length).toBe(0);
  });
});

describe('extra-action helper (Slice 2)', () => {
  it('počítá extra útoky: Action Surge 1, Onslaught 2, ostatní 0', () => {
    const kit = fighter(20).signatureAbilities;
    const find = (id: string): SignatureAbility => kit.find((a) => a.id === id)!;
    expect(extraActionCount(find(ACTION_SURGE_ID))).toBe(1);
    expect(extraActionCount(find('fighter_onslaught'))).toBe(2);
    expect(extraActionCount(find('fighter_weapon_strike'))).toBe(0);
    expect(extraActionCount(EXTRA_ATTACK_ABILITY)).toBe(0); // sám se nereplikuje
  });
});

describe('Action Surge grants an extra attack (Slice 2)', () => {
  it('quest: Action Surge je doprovázen Extra Attack úderem v tomtéž kole', () => {
    const player = fighter(6);
    const foe = questFoeStats({ name: 'Colossus', tier: 'boss' }, 60);
    const out = simulateQuestEncounter(player, foe, new SeededRng(7), 0);
    // Action Surge 1× (once per combat) + aspoň jeden Extra Attack úder.
    expect(out.events.filter((e) => e.ability === 'Action Surge').length).toBe(1);
    expect(out.events.some((e) => e.ability === 'Extra Attack')).toBe(true);
  });

  it('dungeon: cast Action Surge přidá Extra Attack událost ve stejném tahu', () => {
    const base = fighter(20, { attack_power: 50 });
    const dungeon = DUNGEONS.ragefire_chasm!;
    const state = startDungeonRun(base, 'ragefire_chasm', 1, dungeon.requiredLevel, 11);
    const target = state.enemies[0]!.idx;
    const res = resolveDungeonTurn(base, state, ACTION_SURGE_ID, target);
    expect(res.events.some((e) => e.ability === 'Action Surge')).toBe(true);
    expect(res.events.some((e) => e.ability === 'Extra Attack')).toBe(true);
  });
});

describe('gauntlet (per wave = per combat)', () => {
  it('Action Surge jen jednou za vlnu, i po cooldownu', () => {
    const base = fighter(20, { attack_power: 30 });
    const state = startGauntletRun(base, 20, 5);
    expect(state.status).toBe('in_combat');
    const first = resolveGauntletTurn(base, state, ACTION_SURGE_ID);
    expect(first.state.player.usedOncePerCombat).toContain(ACTION_SURGE_ID);
    // I s vynulovaným cooldownem se podruhé nesešle (jen DoT/protiúder, žádné Action Surge).
    first.state.player.cooldowns[ACTION_SURGE_ID] = 0;
    const second = resolveGauntletTurn(base, first.state, ACTION_SURGE_ID);
    expect(second.events.some((e) => e.ability === 'Action Surge')).toBe(false);
  });
});
