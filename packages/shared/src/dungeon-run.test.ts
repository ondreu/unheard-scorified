import { describe, expect, it } from 'vitest';
import {
  DUNGEON_BASIC_ATTACK,
  DUNGEONS,
  EMPTY_PROGRESSION,
  baseStatsFor,
  deriveCombatProfile,
  dungeonRunAbilities,
  resolveDungeonTurn,
  startDungeonRun,
  type ClassId,
  type CombatActor,
  type DungeonRunState,
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

describe('dungeonRunAbilities', () => {
  it('kit obsahuje základní úder + nepasivní signatures', () => {
    const base = hero('fighter');
    const kit = dungeonRunAbilities(base);
    expect(kit[0]!.id).toBe(DUNGEON_BASIC_ATTACK.id);
    expect(kit.every((a) => a.kind !== 'buff')).toBe(true);
  });
});
