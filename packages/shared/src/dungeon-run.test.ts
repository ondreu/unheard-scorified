import { describe, expect, it } from 'vitest';
import {
  COMPANIONS,
  DUNGEON_BASIC_ATTACK,
  DUNGEONS,
  EMPTY_PROGRESSION,
  baseStatsFor,
  buildCompanionParty,
  deriveCombatProfile,
  deriveRaidActor,
  dungeonRunAbilities,
  resolveDungeonTurn,
  startDungeonRun,
  type ClassId,
  type CombatActor,
  type DungeonRunState,
  type RaidRole,
  type SignatureAbility,
} from './index';

function hero(klass: ClassId, level = 20): CombatActor {
  return deriveCombatProfile({
    name: 'Hero',
    level,
    klass,
    primary: baseStatsFor('human', klass, level),
    equipment: { attack_power: 200, strength: 60, constitution: 120, armor: 200 },
    progression: EMPTY_PROGRESSION,
  });
}

/** Index nejslabšího živého nepřítele (klientská heuristika cílení). */
function pickTarget(state: DungeonRunState): number {
  let idx = 0;
  let lowest = Infinity;
  for (const e of state.enemies) {
    if (e.currentHealth > 0 && e.currentHealth < lowest) {
      lowest = e.currentHealth;
      idx = e.idx;
    }
  }
  return idx;
}

/** Odehraje run základním útokem na nejslabšího, dokud neskončí. */
function autoplay(base: CombatActor, state: DungeonRunState): DungeonRunState {
  let guard = 0;
  while (state.status === 'in_combat' && guard++ < 5000) {
    resolveDungeonTurn(base, state, DUNGEON_BASIC_ATTACK.id, pickTarget(state));
  }
  return state;
}

describe('startDungeonRun', () => {
  it('staví první encounter z dungeon dat + počítá encountery', () => {
    const base = hero('fighter');
    const state = startDungeonRun(base, 'ragefire_chasm', 1, 20, 123);
    expect(state.encounterIndex).toBe(0);
    expect(state.encounterCount).toBe(DUNGEONS.ragefire_chasm!.encounters.length);
    // První encounter ragefire je multi-enemy pack.
    expect(state.enemies.length).toBeGreaterThan(1);
    expect(state.status).toBe('in_combat');
    expect(state.player.currentHealth).toBe(state.player.maxHealth);
    // Úvodní encounter_start v logu.
    expect(state.log.some((e) => e.type === 'encounter_start')).toBe(true);
  });
});

describe('resolveDungeonTurn — solo clear', () => {
  it('silná postava vyčistí ragefire (status cleared, všechny encountery)', () => {
    const base = hero('fighter');
    const state = autoplay(base, startDungeonRun(base, 'ragefire_chasm', 1, 20, 777));
    expect(state.status).toBe('cleared');
    expect(state.encountersCleared).toBe(state.encounterCount);
    expect(state.log.at(-1)?.type).toBe('victory');
  });

  it('cílení: útok sníží HP zvoleného nepřítele', () => {
    const base = hero('fighter');
    const state = startDungeonRun(base, 'ragefire_chasm', 1, 20, 5);
    const before = state.enemies.map((e) => e.currentHealth);
    const target = pickTarget(state);
    resolveDungeonTurn(base, state, DUNGEON_BASIC_ATTACK.id, target);
    // Zvolený cíl (nebo dříve mrtvý) má nižší/rovné HP; aspoň jeden nepřítel utrpěl.
    const damaged = state.enemies.some((e, i) => e.currentHealth < before[i]!);
    expect(damaged).toBe(true);
  });

  it('multi-enemy: nakonec padnou všichni nepřátelé encounteru', () => {
    const base = hero('fighter');
    const state = autoplay(base, startDungeonRun(base, 'deadmines', 1, 20, 9));
    expect(state.status).toBe('cleared');
    // Boss+adds finální encounter byl vyčištěn (víc enemy_defeated událostí).
    expect(state.log.filter((e) => e.type === 'enemy_defeated').length).toBeGreaterThanOrEqual(
      DUNGEONS.deadmines!.encounters.reduce((n, enc) => n + enc.enemies.length, 0),
    );
  });
});

describe('resolveDungeonTurn — smrt', () => {
  it('slabá postava padne v endgame dungeonu (status dead)', () => {
    const naked = deriveCombatProfile({
      name: 'Weakling',
      level: 1,
      klass: 'wizard',
      primary: baseStatsFor('human', 'wizard', 1),
      equipment: {},
      progression: EMPTY_PROGRESSION,
    });
    const state = autoplay(naked, startDungeonRun(naked, 'stratholme', 1, 1, 3));
    expect(state.status).toBe('dead');
    expect(state.log.some((e) => e.type === 'player_defeated')).toBe(true);
  });
});

describe('determinismus', () => {
  it('stejný seed + stejné volby → stejný výsledek', () => {
    const base = hero('fighter');
    const a = autoplay(base, startDungeonRun(base, 'ragefire_chasm', 1, 20, 42));
    const b = autoplay(base, startDungeonRun(base, 'ragefire_chasm', 1, 20, 42));
    expect(a.status).toBe(b.status);
    expect(a.log.length).toBe(b.log.length);
    expect(a.turn).toBe(b.turn);
  });
});

describe('group tahový run (Slice 3) — AI parťáci', () => {
  function groupState(playerRole: RaidRole, dungeonId = 'ragefire_chasm', seed = 11): {
    base: CombatActor;
    state: DungeonRunState;
  } {
    const player = deriveRaidActor(hero('fighter'), playerRole);
    const allies = buildCompanionParty(playerRole, 20);
    return { base: player, state: startDungeonRun(player, dungeonId, 3, 20, seed, allies) };
  }

  it('autofill doplní 2 parťáky do 1/1/1 (zbývající role)', () => {
    const { state } = groupState('dps');
    expect(state.allies.length).toBe(2);
    expect(state.allies.map((a) => a.role).sort()).toEqual(['healer', 'tank']);
    expect(state.size).toBe(3);
    expect(state.playerRole).toBe('dps');
  });

  it('parťáci dostanou plné HP a vlastní jména z rosteru', () => {
    const { state } = groupState('tank');
    expect(state.allies.map((a) => a.role).sort()).toEqual(['dps', 'healer']);
    expect(state.allies.every((a) => a.currentHealth === a.maxHealth)).toBe(true);
    expect(state.allies.some((a) => a.name === COMPANIONS.healer.name)).toBe(true);
  });

  it('parťáci jednají každý tah (combat log obsahuje jejich akce)', () => {
    const { base, state } = groupState('dps');
    const allyNames = new Set(state.allies.map((a) => a.name));
    resolveDungeonTurn(base, state, DUNGEON_BASIC_ATTACK.id, pickTarget(state));
    const allyActed = state.log.some((e) => e.source && allyNames.has(e.source));
    expect(allyActed).toBe(true);
  });

  it('group party (hráč + AI) vyčistí dungeon', () => {
    const { base, state } = groupState('dps', 'ragefire_chasm', 2024);
    const cleared = autoplay(base, state);
    expect(cleared.status).toBe('cleared');
    expect(cleared.encountersCleared).toBe(cleared.encounterCount);
  });

  it('determinismus: stejný seed + volby → stejný výsledek', () => {
    const a = autoplay(groupState('healer', 'deadmines', 99).base, groupState('healer', 'deadmines', 99).state);
    const b = autoplay(groupState('healer', 'deadmines', 99).base, groupState('healer', 'deadmines', 99).state);
    expect(a.status).toBe(b.status);
    expect(a.log.length).toBe(b.log.length);
    expect(a.turn).toBe(b.turn);
  });
});

describe('friendly targeting — heal cílí zvoleného člena party', () => {
  /** Hráč = healer (cleric) + AI parťáci tank/dps; vrací heal ability id. */
  function healerSetup(seed = 7): { base: CombatActor; state: DungeonRunState; healId: string } {
    const player = deriveRaidActor(hero('cleric'), 'healer');
    const allies = buildCompanionParty('healer', 20);
    const state = startDungeonRun(player, 'ragefire_chasm', 3, 20, seed, allies);
    const healId = dungeonRunAbilities(player).find((a) => a.kind === 'heal')?.id;
    expect(healId, 'cleric má mít heal ability').toBeDefined();
    return { base: player, state, healId: healId! };
  }

  it('targetId = index parťáka → léčí zvoleného parťáka', () => {
    const { base, state, healId } = healerSetup();
    state.allies[0]!.currentHealth = 1;
    const allyName = state.allies[0]!.name;
    resolveDungeonTurn(base, state, healId, 1); // 1 = allies[0]
    const playerHeal = state.log.find((e) => e.type === 'heal' && e.source === base.name);
    expect(playerHeal?.target).toBe(allyName);
  });

  it('targetId = 0 → léčí hráče', () => {
    const { base, state, healId } = healerSetup();
    state.player.currentHealth = 1;
    resolveDungeonTurn(base, state, healId, 0);
    const playerHeal = state.log.find((e) => e.type === 'heal' && e.source === base.name);
    expect(playerHeal?.target).toBe(base.name);
  });

  it('neplatný cíl → fallback na nejzraněnějšího člena', () => {
    const { base, state, healId } = healerSetup();
    state.allies[1]!.currentHealth = 1; // nejzraněnější
    const injuredName = state.allies[1]!.name;
    resolveDungeonTurn(base, state, healId, 99); // mimo rozsah
    const playerHeal = state.log.find((e) => e.type === 'heal' && e.source === base.name);
    expect(playerHeal?.target).toBe(injuredName);
  });

  it('shield: friendly targeting hodí štít na zvoleného parťáka', () => {
    const player = deriveRaidActor(hero('cleric'), 'dps');
    const ward: SignatureAbility = { id: 'test_ward', name: 'Ward', description: '', kind: 'shield', cooldownSec: 0, damageMult: 1 };
    player.signatureAbilities = [...player.signatureAbilities, ward];
    const state = startDungeonRun(player, 'ragefire_chasm', 3, 20, 7, buildCompanionParty('dps', 20));
    const allyName = state.allies[0]!.name;
    resolveDungeonTurn(player, state, 'test_ward', 1); // 1 = allies[0]
    const ev = state.log.find((e) => e.type === 'absorb' && e.source === player.name);
    expect(ev?.target).toBe(allyName);
  });

  it('mitigation: friendly targeting udělí ochranné okno zvolenému parťákovi', () => {
    const player = deriveRaidActor(hero('cleric'), 'dps');
    const aegis: SignatureAbility = { id: 'test_aegis', name: 'Aegis', description: '', kind: 'mitigation', cooldownSec: 0, damageMult: 0, mitigationPct: 0.5, mitigationDurationSec: 9 };
    player.signatureAbilities = [...player.signatureAbilities, aegis];
    const state = startDungeonRun(player, 'ragefire_chasm', 3, 20, 7, buildCompanionParty('dps', 20));
    resolveDungeonTurn(player, state, 'test_aegis', 1); // 1 = allies[0]
    expect(state.allies[0]!.mitigationTurns).toBeGreaterThan(0);
    expect(state.allies[0]!.mitigationPct).toBe(0.5);
    expect(state.player.mitigationTurns).toBe(0); // hráč nedostal buff
  });
});

describe('dungeonRunAbilities', () => {
  it('kit obsahuje základní úder + nepasivní signatures', () => {
    const base = hero('fighter');
    const kit = dungeonRunAbilities(base);
    expect(kit[0]!.id).toBe(DUNGEON_BASIC_ATTACK.id);
    expect(kit.every((a) => a.kind !== 'buff')).toBe(true);
  });
});
