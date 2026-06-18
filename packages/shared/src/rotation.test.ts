import { describe, expect, it } from 'vitest';
import {
  EMPTY_PROGRESSION,
  baseStatsFor,
  defaultRotation,
  deriveCombatProfile,
  deriveRaidActor,
  evaluateRotationRule,
  sanitizeRotation,
  shouldCastAbility,
  simulateRaidRun,
  type CharacterRotation,
  type CombatActor,
  type RaidActor,
} from './index';

describe('defaultRotation', () => {
  it('enables every ability with an always condition', () => {
    const rot = defaultRotation(['fighter_action_surge', 'fighter_execute']);
    expect(rot.rules).toHaveLength(2);
    expect(rot.rules.every((r) => r.enabled && r.conditionType === 'always')).toBe(true);
  });
});

describe('evaluateRotationRule', () => {
  const ctx = { enemyHpPct: 0.25, selfHpPct: 0.5 };
  it('always is unconditional', () => {
    expect(evaluateRotationRule({ abilityId: 'x', enabled: true, conditionType: 'always' }, ctx)).toBe(true);
  });
  it('disabled rule never fires', () => {
    expect(evaluateRotationRule({ abilityId: 'x', enabled: false, conditionType: 'always' }, ctx)).toBe(false);
  });
  it('enemy_hp_below fires only at/under threshold', () => {
    expect(evaluateRotationRule({ abilityId: 'x', enabled: true, conditionType: 'enemy_hp_below', threshold: 0.3 }, ctx)).toBe(true);
    expect(evaluateRotationRule({ abilityId: 'x', enabled: true, conditionType: 'enemy_hp_below', threshold: 0.2 }, ctx)).toBe(false);
  });
  it('self_hp_below fires when low', () => {
    expect(evaluateRotationRule({ abilityId: 'x', enabled: true, conditionType: 'self_hp_below', threshold: 0.6 }, ctx)).toBe(true);
    expect(evaluateRotationRule({ abilityId: 'x', enabled: true, conditionType: 'self_hp_below', threshold: 0.4 }, ctx)).toBe(false);
  });
});

describe('shouldCastAbility', () => {
  const ctx = { enemyHpPct: 0.8, selfHpPct: 1 };
  it('defaults to true with no rotation or no rule', () => {
    expect(shouldCastAbility(undefined, 'foo', ctx)).toBe(true);
    expect(shouldCastAbility({ rules: [] }, 'foo', ctx)).toBe(true);
  });
  it('respects a matching rule', () => {
    const rot: CharacterRotation = {
      rules: [{ abilityId: 'execute', enabled: true, conditionType: 'enemy_hp_below', threshold: 0.3 }],
    };
    expect(shouldCastAbility(rot, 'execute', ctx)).toBe(false);
    expect(shouldCastAbility(rot, 'execute', { ...ctx, enemyHpPct: 0.2 })).toBe(true);
  });
});

describe('sanitizeRotation', () => {
  const valid = ['a', 'b', 'c'];
  it('drops unknown abilities, clamps thresholds, appends missing as default', () => {
    const out = sanitizeRotation(
      {
        rules: [
          { abilityId: 'b', enabled: false, conditionType: 'enemy_hp_below', threshold: 5 },
          { abilityId: 'zzz', enabled: true, conditionType: 'always' },
          { abilityId: 'a', enabled: true, conditionType: 'nonsense' },
        ],
      },
      valid,
    );
    // Order preserved (b, a), missing c appended.
    expect(out.rules.map((r) => r.abilityId)).toEqual(['b', 'a', 'c']);
    expect(out.rules[0]).toMatchObject({ abilityId: 'b', enabled: false, conditionType: 'enemy_hp_below', threshold: 1 });
    // 'a' had an invalid condition → falls back to always (no threshold).
    expect(out.rules[1]).toMatchObject({ abilityId: 'a', conditionType: 'always' });
    expect(out.rules[1]!.threshold).toBeUndefined();
  });
  it('garbage input yields a full default rotation', () => {
    expect(sanitizeRotation(null, valid).rules.map((r) => r.abilityId)).toEqual(valid);
  });
});

describe('rotation in the engine', () => {
  function dpsWithExecute(rotation?: CharacterRotation): RaidActor {
    const base = deriveCombatProfile({
      name: 'Exec',
      level: 50,
      klass: 'fighter',
      primary: baseStatsFor('half_orc', 'fighter', 50),
      equipment: { attack_power: 60, strength: 40 },
      progression: EMPTY_PROGRESSION,
    });
    return deriveRaidActor({ ...base, rotation }, 'dps');
  }

  const boss: CombatActor = {
    name: 'Dummy',
    maxHealth: 3000,
    attackPower: 20,
    swingInterval: 2.5,
    critChance: 0.05,
    critMultiplier: 2,
    armor: 0,
    lifesteal: 0,
    shield: 0,
    signatureAbilities: [],
    isBoss: true,
  };

  it('default (no rotation) casts the ability; a never-true condition suppresses it', () => {
    const party = (rot?: CharacterRotation): RaidActor[] => [
      deriveRaidActor(dpsWithExecute(rot), 'tank'),
      dpsWithExecute(rot),
    ];
    const withDefault = simulateRaidRun(party(), [boss], 123);
    // Hold Action Surge until boss < 1% HP → effectively never in this fight.
    const held: CharacterRotation = {
      rules: [{ abilityId: 'fighter_action_surge', enabled: true, conditionType: 'enemy_hp_below', threshold: 0.01 }],
    };
    const withHold = simulateRaidRun(party(held), [boss], 123);
    const msDefault = withDefault.events.filter((e) => e.ability === 'Action Surge').length;
    const msHeld = withHold.events.filter((e) => e.ability === 'Action Surge').length;
    expect(msDefault).toBeGreaterThan(0);
    expect(msHeld).toBeLessThan(msDefault);
  });

  it('is deterministic with a custom rotation', () => {
    const held: CharacterRotation = {
      rules: [{ abilityId: 'fighter_action_surge', enabled: false, conditionType: 'always' }],
    };
    const mk = (): RaidActor[] => [deriveRaidActor(dpsWithExecute(held), 'tank'), dpsWithExecute(held)];
    const a = simulateRaidRun(mk(), [boss], 555);
    const b = simulateRaidRun(mk(), [boss], 555);
    expect(a.events).toEqual(b.events);
  });
});
