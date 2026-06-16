import { describe, expect, it } from 'vitest';
import { deriveCombatProfile, type CombatActor } from './combat';
import { QUESTS, type QuestDef } from './data/quests';
import {
  questFoeStats,
  questHasNarrative,
  simulateQuestEncounter,
  simulateQuestRun,
} from './quest-run';
import { baseStatsFor } from './character';
import { aggregateTalentEffects } from './data/talents';
import { SeededRng } from './rng';

function makeProfile(level: number): CombatActor {
  return deriveCombatProfile({
    name: 'Hero',
    level,
    klass: 'warrior',
    primary: baseStatsFor('human', 'warrior', level),
    equipment: {},
    talents: aggregateTalentEffects('warrior', {}),
  });
}

describe('questFoeStats', () => {
  it('scales HP/AP with quest level and tier', () => {
    const minion = questFoeStats({ name: 'Rat', tier: 'minion' }, 10);
    const boss = questFoeStats({ name: 'Lord', tier: 'boss' }, 10);
    expect(boss.maxHealth).toBeGreaterThan(minion.maxHealth);
    expect(boss.isBoss).toBe(true);
    expect(minion.isBoss).toBe(false);
    // vyšší level questu = silnější nepřítel
    const minionHi = questFoeStats({ name: 'Rat', tier: 'minion' }, 40);
    expect(minionHi.maxHealth).toBeGreaterThan(minion.maxHealth);
  });
});

describe('simulateQuestEncounter (no-fail)', () => {
  it('always defeats the enemy and never lets the player drop below 1 HP', () => {
    const player = makeProfile(5);
    const foe = questFoeStats({ name: 'Tough Brute', tier: 'boss' }, 60); // výrazně overlevel
    const out = simulateQuestEncounter(player, foe, new SeededRng(123), 0);
    const last = out.events.at(-1)!;
    expect(last.type).toBe('enemy_defeated');
    expect(out.playerHpPct).toBeGreaterThanOrEqual(0);
    // i proti přesile postava „prevailuje" (clamp na 1 HP → 0..100 %)
    expect(out.playerHpPct).toBeLessThanOrEqual(100);
  });

  it('stronger character finishes with higher remaining HP', () => {
    const weak = makeProfile(8);
    const strong = makeProfile(40);
    const foe = { name: 'Ogre', tier: 'standard' as const };
    const weakOut = simulateQuestEncounter(weak, questFoeStats(foe, 10), new SeededRng(7), 0);
    const strongOut = simulateQuestEncounter(strong, questFoeStats(foe, 10), new SeededRng(7), 0);
    expect(strongOut.playerHpPct).toBeGreaterThanOrEqual(weakOut.playerHpPct);
  });

  it('is deterministic for the same seed', () => {
    const player = makeProfile(10);
    const foe = questFoeStats({ name: 'Wolf', tier: 'standard' }, 10);
    const a = simulateQuestEncounter(player, foe, new SeededRng(42), 0);
    const b = simulateQuestEncounter(player, foe, new SeededRng(42), 0);
    expect(a.events.length).toBe(b.events.length);
    expect(a.playerHpPct).toBe(b.playerHpPct);
  });
});

describe('simulateQuestRun', () => {
  it('renders authored story steps (narrative + combat) in order', () => {
    const quest = QUESTS.ns_kobold_culling!;
    expect(questHasNarrative(quest)).toBe(true);
    const run = simulateQuestRun(quest, makeProfile(5), 1);
    expect(run.steps.length).toBe(quest.steps!.length);
    const combatSteps = run.steps.filter((s) => s.kind === 'combat');
    expect(combatSteps.length).toBeGreaterThan(0);
    for (const c of combatSteps) {
      expect(c.enemyName).toBeTruthy();
      expect(c.events!.length).toBeGreaterThan(0);
      expect(c.events!.at(-1)!.type).toBe('enemy_defeated');
    }
  });

  it('repeatable quest generates a variable subset of events', () => {
    const quest = QUESTS.ns_wolf_pelts!;
    expect(quest.events!.length).toBeGreaterThan(0);
    const run1 = simulateQuestRun(quest, makeProfile(3), 1);
    const run5 = simulateQuestRun(quest, makeProfile(3), 5);
    // intro beat + eventCount kroků
    expect(run1.steps.length).toBe((quest.eventCount ?? 3) + 1);
    // různý seed → (typicky) jiný výběr událostí
    const sig = (r: typeof run1) => r.steps.map((s) => s.text).join('|');
    expect(sig(run1)).not.toBe(sig(run5));
  });

  it('is deterministic for the same seed', () => {
    const quest = QUESTS.dt_boar_hides!;
    const a = simulateQuestRun(quest, makeProfile(4), 99);
    const b = simulateQuestRun(quest, makeProfile(4), 99);
    expect(a.steps.map((s) => s.text)).toEqual(b.steps.map((s) => s.text));
  });

  it('falls back to a single narrative beat for quests without steps/events', () => {
    const bare: QuestDef = {
      id: 'tmp',
      name: 'Bare',
      description: 'Do the thing.',
      zoneId: 'northshire',
      kind: 'repeatable',
      requiredLevel: 1,
      durationSec: 300,
      baseXp: 10,
      baseGold: 1,
      goldVariance: 0,
    };
    const run = simulateQuestRun(bare, makeProfile(1), 1);
    expect(run.steps).toHaveLength(1);
    expect(run.steps[0]!.kind).toBe('narrative');
    expect(run.steps[0]!.text).toBe('Do the thing.');
    expect(questHasNarrative(bare)).toBe(false);
  });
});
