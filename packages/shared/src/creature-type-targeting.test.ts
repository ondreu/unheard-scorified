import { describe, expect, it } from 'vitest';
import { EXTRA_SPELLS } from './data/abilities';
import {
  EMPTY_PROGRESSION,
  baseStatsFor,
  canTargetCreatureType,
  deriveCombatProfile,
  hasCondition,
  resolveDungeonTurn,
  startDungeonRun,
  type CombatActor,
  type SignatureAbility,
} from './index';

function hero(klass: Parameters<typeof baseStatsFor>[1], level = 20): CombatActor {
  return deriveCombatProfile({
    name: 'Hero',
    level,
    klass,
    primary: baseStatsFor('human', klass, level),
    equipment: { attack_power: 200, strength: 60, constitution: 120, armor: 200 },
    progression: EMPTY_PROGRESSION,
  });
}

describe('canTargetCreatureType', () => {
  const holdPerson: SignatureAbility = {
    id: 'x_hold', name: 'Hold Person', kind: 'strike', cooldownSec: 0, damageMult: 0,
    save: { ability: 'wisdom', effect: 'negate' }, condition: { type: 'stunned', durationTurns: 1 },
    validTargetTypes: ['humanoid'],
  };
  const fireball: SignatureAbility = {
    id: 'x_fb', name: 'Fireball', kind: 'strike', cooldownSec: 0, damageMult: 1,
    dice: { count: 8, sides: 6, bonus: 0 },
  };

  it('ability bez omezení cílí cokoli (i undefined typ)', () => {
    expect(canTargetCreatureType(fireball, 'undead')).toBe(true);
    expect(canTargetCreatureType(fireball, undefined)).toBe(true);
  });

  it('Hold Person jde na humanoida, ne na beast', () => {
    expect(canTargetCreatureType(holdPerson, 'humanoid')).toBe(true);
    expect(canTargetCreatureType(holdPerson, 'beast')).toBe(false);
    expect(canTargetCreatureType(holdPerson, 'undead')).toBe(false);
  });

  it('neznámý typ cíle (ad-hoc/narativní nepřítel) projde (graceful)', () => {
    expect(canTargetCreatureType(holdPerson, undefined)).toBe(true);
  });
});

describe('Hold Person katalog', () => {
  it('všechny class varianty jsou humanoid-only', () => {
    const holds = Object.values(EXTRA_SPELLS)
      .flat()
      .filter((a) => a.name === 'Hold Person');
    expect(holds.length).toBeGreaterThanOrEqual(6);
    for (const h of holds) {
      expect(h.validTargetTypes).toEqual(['humanoid']);
    }
  });
});

describe('resolveDungeonTurn — creature type targeting', () => {
  const hold: SignatureAbility = {
    id: 'test_hold_person', name: 'Hold Person', kind: 'strike', cooldownSec: 0, damageMult: 0,
    save: { ability: 'wisdom', effect: 'negate' }, condition: { type: 'stunned', durationTurns: 2 },
    validTargetTypes: ['humanoid'],
  };

  it('odmítne Hold Person na ne-humanoidním cíli (žádné seslání ani condition)', () => {
    const base = hero('wizard');
    base.signatureAbilities = [...base.signatureAbilities, hold];
    base.spellSaveDc = 99;
    const state = startDungeonRun(base, 'ragefire_chasm', 1, 20, 7);
    const e = state.enemies[0]!;
    e.maxHealth = 1_000_000;
    e.currentHealth = 1_000_000;
    e.actor.creatureType = 'beast';
    state.enemies = [e];

    const before = state.turn;
    const { events } = resolveDungeonTurn(base, state, 'test_hold_person', 0);
    expect(events).toHaveLength(0); // odmítnuto bez efektu
    expect(state.turn).toBe(before); // tah se neposunul
    expect(hasCondition(state.enemies[0]?.conditions, 'stunned')).toBe(false);
  });

  it('povolí Hold Person na humanoidním cíli (condition padne)', () => {
    const base = hero('wizard');
    base.signatureAbilities = [...base.signatureAbilities, hold];
    base.spellSaveDc = 99; // cíl save vždy selže
    const state = startDungeonRun(base, 'ragefire_chasm', 1, 20, 7);
    const e = state.enemies[0]!;
    e.maxHealth = 1_000_000;
    e.currentHealth = 1_000_000;
    e.actor.creatureType = 'humanoid';
    state.enemies = [e];

    let applied = false;
    for (let i = 0; i < 4 && state.status === 'in_combat'; i++) {
      resolveDungeonTurn(base, state, 'test_hold_person', 0);
      if (hasCondition(state.enemies[0]?.conditions, 'stunned')) applied = true;
    }
    expect(applied).toBe(true);
  });
});
