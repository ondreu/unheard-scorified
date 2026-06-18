import { describe, expect, it } from 'vitest';
import { deriveCombatProfile, type CombatActor } from './combat';
import { QUESTS, type QuestDef, type QuestEnemyTier } from './data/quests';
import {
  questFoeStats,
  questHasNarrative,
  simulateQuestEncounter,
  simulateQuestRun,
} from './quest-run';
import { baseStatsFor } from './character';
import { EMPTY_PROGRESSION } from './levelup';
import { SeededRng } from './rng';

function makeProfile(level: number): CombatActor {
  return deriveCombatProfile({
    name: 'Hero',
    level,
    klass: 'fighter',
    primary: baseStatsFor('human', 'fighter', level),
    equipment: {},
    progression: EMPTY_PROGRESSION,
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

  // ── MR-5: dice-roll combat ────────────────────────────────────────────────
  it('logs d20 attack rolls vs AC, hits/misses and initiative', () => {
    const player = makeProfile(20);
    const foe = questFoeStats({ name: 'Wolf', tier: 'standard' }, 18);
    const out = simulateQuestEncounter(player, foe, new SeededRng(13), 0);
    // initiative ve startovní hlášce
    expect(out.events[0]!.message).toContain('Initiative');
    const joined = out.events.map((e) => e.message).join('\n');
    // formát „rolls N + M = T vs AC X → HIT/MISS"
    expect(joined).toMatch(/rolls \d+ [+−] \d+ = \d+ vs AC \d+ → (HIT|MISS)/);
    expect(out.events.some((e) => e.message.includes('→ HIT'))).toBe(true);
  });

  it('a wizard spends spell slots on leveled spells (slot note in log)', () => {
    const wiz = deriveCombatProfile({
      name: 'Mage',
      level: 14,
      klass: 'wizard',
      primary: baseStatsFor('human', 'wizard', 14),
      equipment: {},
      progression: EMPTY_PROGRESSION,
    });
    // dlouhý boj proti silnému nepříteli → projeví se sloty + fallback
    const foe = questFoeStats({ name: 'Ancient Wyrm', tier: 'boss' }, 30);
    const out = simulateQuestEncounter(wiz, foe, new SeededRng(99), 0);
    const joined = out.events.map((e) => e.message).join('\n');
    expect(joined).toMatch(/-level slot\)/);
  });

  it('bosses trigger DEX saving throws (half damage on success)', () => {
    const player = makeProfile(10);
    const boss = questFoeStats({ name: 'Dread Lord', tier: 'boss' }, 30);
    const out = simulateQuestEncounter(player, boss, new SeededRng(4), 0, true);
    const joined = out.events.map((e) => e.message).join('\n');
    expect(joined).toMatch(/rolls a DEX save: \d+ [+−] \d+ = \d+ vs DC \d+/);
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

  it('repeatable quest generates a variable subset of events (engine, dormantní data)', () => {
    // Repeatable questy nahradil generický grind (žádná repeatable data), ale
    // engine náhodných událostí (`quest.events`) zůstává — ověř syntetickým questem.
    const quest: QuestDef = {
      id: 'rep_synthetic',
      name: 'Synthetic Repeatable',
      description: 'You set out hunting.',
      zoneId: 'northshire',
      kind: 'repeatable',
      requiredLevel: 1,
      durationSec: 300,
      baseXp: 10,
      baseGold: 1,
      goldVariance: 0,
      eventCount: 3,
      events: [
        { text: 'A trail in the brush.' },
        { text: 'A lean wolf lunges.', foe: { name: 'Timber Wolf', tier: 'minion' } },
        { text: 'The pack leader stalks you.', foe: { name: 'Elder Wolf', tier: 'standard' } },
        { text: 'A scavenger circles a carcass.', foe: { name: 'Starving Wolf', tier: 'minion' } },
        { text: 'A den mother charges.', foe: { name: 'Den Mother', tier: 'standard' } },
        { text: 'You bundle the pelts.' },
      ],
    };
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
    const quest = QUESTS.dt_scorpid_sting!;
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

  it('flavor (non combat-objective) quests always succeed', () => {
    const run = simulateQuestRun(QUESTS.ns_kobold_culling!, makeProfile(1), 1);
    expect(run.success).toBe(true);
  });
});

// ── Combat-objective questy (M12): souboj se vyhodnotí doopravdy, lze prohrát ──
function challengeQuest(foeLevel: number, tier: QuestEnemyTier): QuestDef {
  return {
    id: 'chal_synthetic',
    name: 'Prove Yourself',
    description: 'A real fight.',
    zoneId: 'northshire',
    kind: 'story',
    requiredLevel: foeLevel,
    durationSec: 600,
    baseXp: 100,
    baseGold: 10,
    goldVariance: 0,
    combatObjective: true,
    steps: [
      { kind: 'narrative', text: 'You set out to prove yourself.' },
      { kind: 'combat', intro: 'The foe attacks!', foe: { name: 'Dread Champion', tier } },
      { kind: 'narrative', text: 'Victorious, you return home.' },
    ],
  };
}

describe('simulateQuestEncounter (combat objective, allowDefeat)', () => {
  it('lets a hopelessly outmatched character be defeated', () => {
    const weak = makeProfile(1);
    const foe = questFoeStats({ name: 'Dread Champion', tier: 'boss' }, 60);
    const out = simulateQuestEncounter(weak, foe, new SeededRng(1), 0, true);
    expect(out.playerDefeated).toBe(true);
    expect(out.events.at(-1)!.type).toBe('player_defeated');
    expect(out.playerHpPct).toBe(0);
  });

  it('still resolves a win when the character is strong enough', () => {
    const strong = makeProfile(60);
    const foe = questFoeStats({ name: 'Whelp', tier: 'minion' }, 3);
    const out = simulateQuestEncounter(strong, foe, new SeededRng(1), 0, true);
    expect(out.playerDefeated).toBe(false);
    expect(out.events.at(-1)!.type).toBe('enemy_defeated');
  });

  it('without allowDefeat keeps the no-fail clamp even against an impossible foe', () => {
    const weak = makeProfile(1);
    const foe = questFoeStats({ name: 'Dread Champion', tier: 'boss' }, 60);
    const out = simulateQuestEncounter(weak, foe, new SeededRng(1), 0);
    expect(out.playerDefeated).toBe(false);
    expect(out.events.at(-1)!.type).toBe('enemy_defeated');
  });
});

describe('simulateQuestRun (combat objective)', () => {
  it('fails (success=false) and truncates the story at the lost fight', () => {
    const run = simulateQuestRun(challengeQuest(60, 'boss'), makeProfile(1), 1);
    expect(run.success).toBe(false);
    // příběh se utne na prohraném souboji → závěrečný narativní beat chybí
    expect(run.steps.at(-1)!.kind).toBe('combat');
    expect(run.steps.at(-1)!.defeated).toBe(true);
    expect(run.steps.some((s) => s.kind === 'narrative' && s.text.startsWith('Victorious'))).toBe(
      false,
    );
  });

  it('succeeds (success=true) and renders the whole story for a strong character', () => {
    const quest = challengeQuest(3, 'minion');
    const run = simulateQuestRun(quest, makeProfile(60), 1);
    expect(run.success).toBe(true);
    expect(run.steps.length).toBe(quest.steps!.length);
    expect(run.steps.some((s) => s.defeated)).toBe(false);
  });

  it('is deterministic for the same seed', () => {
    const quest = challengeQuest(60, 'boss');
    const a = simulateQuestRun(quest, makeProfile(5), 77);
    const b = simulateQuestRun(quest, makeProfile(5), 77);
    expect(a.success).toBe(b.success);
    expect(a.steps.map((s) => s.defeated ?? false)).toEqual(
      b.steps.map((s) => s.defeated ?? false),
    );
  });

  it('ships real combat-objective quests in the catalog', () => {
    expect(QUESTS.ns_padfoot_bounty!.combatObjective).toBe(true);
    expect(QUESTS.dt_skull_rock!.combatObjective).toBe(true);
    expect(QUESTS.epl_araj_reckoning!.combatObjective).toBe(true);
    expect(QUESTS.fw_jadefire_lord!.combatObjective).toBe(true);
  });
});
