import { describe, expect, it } from 'vitest';
import {
  CLASS_BASELINE_ABILITIES,
  CLASS_TALENTS,
  SIGNATURE_ABILITIES,
  abilityDamageMult,
  aggregateTalentEffects,
  applyAbsorb,
  baseStatsFor,
  deriveCombatProfile,
  deriveRaidActor,
  resolveAbilities,
  simulatePvpDuel,
  simulateRaidRun,
  type CombatActor,
  type RaidActor,
} from './index';

describe('ability descriptions & execute', () => {
  it('every player ability (baseline + capstone) has a description', () => {
    for (const list of Object.values(CLASS_BASELINE_ABILITIES)) {
      for (const ab of list) {
        expect(ab.description, ab.id).toBeTruthy();
      }
    }
    for (const [id, spec] of Object.entries(SIGNATURE_ABILITIES)) {
      expect(spec.description, id).toBeTruthy();
    }
  });

  it('abilityDamageMult applies the execute bonus below the threshold', () => {
    const execute = CLASS_BASELINE_ABILITIES.warrior!.find((a) => a.id === 'warrior_execute')!;
    expect(execute.executeBelowPct).toBe(0.3);
    // Above threshold → base mult; at/below → boosted mult.
    expect(abilityDamageMult(execute, 0.5)).toBe(execute.damageMult);
    expect(abilityDamageMult(execute, 0.3)).toBe(execute.executeDamageMult);
    expect(abilityDamageMult(execute, 0.1)).toBe(execute.executeDamageMult);
  });

  it('a plain ability ignores execute (returns base mult)', () => {
    const heroic = CLASS_BASELINE_ABILITIES.warrior!.find((a) => a.id === 'warrior_heroic_strike')!;
    expect(abilityDamageMult(heroic, 0.1)).toBe(heroic.damageMult);
  });
});

describe('resolveAbilities (baseline + capstone kit)', () => {
  it('grants baseline abilities by level, gating higher ones', () => {
    const low = resolveAbilities('warrior', 1, []).map((a) => a.id);
    expect(low).toContain('warrior_heroic_strike'); // unlock 1
    expect(low).not.toContain('warrior_overpower'); // unlock 14
    const high = resolveAbilities('warrior', 40, []).map((a) => a.id);
    expect(high).toContain('warrior_overpower');
    expect(high).toContain('warrior_execute');
  });

  it('adds the capstone signature ability from talent tags', () => {
    const ids = resolveAbilities('warrior', 60, [{ tag: 'mortal_strike' }]).map((a) => a.id);
    expect(ids).toContain('mortal_strike');
  });

  it('healer classes expose heal abilities', () => {
    const priest = resolveAbilities('priest', 60, []);
    expect(priest.some((a) => a.kind === 'heal')).toBe(true);
  });
});

function profile(klass: Parameters<typeof aggregateTalentEffects>[0], allocations: Record<string, number>, level = 50): CombatActor {
  return deriveCombatProfile({
    name: `${klass}-hero`,
    level,
    klass,
    primary: baseStatsFor('human', klass, level),
    equipment: { attack_power: 60, constitution: 60, armor: 100 },
    talents: aggregateTalentEffects(klass, allocations),
  });
}

/** Tanky boss s vysokým HP, aby boj trval dost dlouho na proběhnutí mechanik. */
function tankyBoss(name = 'Test Boss'): CombatActor {
  return {
    name,
    maxHealth: 4000,
    attackPower: 40,
    swingInterval: 2.2,
    critChance: 0.05,
    critMultiplier: 2,
    armor: 0,
    lifesteal: 0,
    shield: 0,
    signatureAbilities: [],
    isBoss: true,
  };
}

describe('shield derivation (absorb)', () => {
  it('shield talent grants an absorb pool; without it shield is 0', () => {
    const withBarrier = profile('mage', { 'mage.frost.ice_barrier': 1 });
    const without = profile('mage', {});
    expect(withBarrier.shield).toBeGreaterThan(0);
    expect(without.shield).toBe(0);
  });
});

describe('applyAbsorb', () => {
  it('absorbs up to the shield, leaving the remainder as damage', () => {
    expect(applyAbsorb(100, 30)).toEqual({ netDamage: 70, absorbed: 30, shieldRemaining: 0 });
    expect(applyAbsorb(20, 50)).toEqual({ netDamage: 0, absorbed: 20, shieldRemaining: 30 });
    expect(applyAbsorb(50, 0)).toEqual({ netDamage: 50, absorbed: 0, shieldRemaining: 0 });
  });
});

describe('ability kinds', () => {
  it('capstone talents map to abilities with the right kind', () => {
    const warlock = profile('warlock', { 'warlock.aff.unstable_affliction': 1 });
    const ua = warlock.signatureAbilities.find((a) => a.id === 'unstable_affliction');
    expect(ua?.kind).toBe('dot');

    const warrior = profile('warrior', { 'warrior.fury.bloodthirst': 1 });
    const bt = warrior.signatureAbilities.find((a) => a.id === 'bloodthirst');
    expect(bt?.kind).toBe('drain');
  });
});

describe('rich combat log (raid/dungeon engine)', () => {
  const boss = [tankyBoss()];

  it('lifesteal dps produces drain events', () => {
    const party: RaidActor[] = [
      deriveRaidActor(profile('warrior', {}), 'tank'),
      deriveRaidActor(profile('priest', {}, 50), 'healer'),
      deriveRaidActor(profile('warrior', { 'warrior.fury.bloodthirst': 1, 'warrior.fury.cruelty': 5 }), 'dps'),
    ];
    const r = simulateRaidRun(party, boss, 4242);
    expect(r.events.some((e) => e.type === 'drain')).toBe(true);
  });

  it('a dot caster produces dot tick events', () => {
    const party: RaidActor[] = [
      deriveRaidActor(profile('warrior', {}), 'tank'),
      deriveRaidActor(profile('priest', {}, 50), 'healer'),
      deriveRaidActor(profile('warlock', { 'warlock.aff.unstable_affliction': 1 }), 'dps'),
    ];
    const r = simulateRaidRun(party, boss, 13);
    expect(r.events.some((e) => e.type === 'dot')).toBe(true);
  });

  it('a healer casts heal abilities (not just auto-heals)', () => {
    // High-pressure boss so the tank is frequently injured (heal abilities fire).
    const hardBoss: CombatActor = { ...tankyBoss('Pressure'), attackPower: 220, swingInterval: 1, maxHealth: 6000 };
    const party: RaidActor[] = [
      deriveRaidActor(profile('warrior', {}), 'tank'),
      deriveRaidActor(profile('priest', {}, 50), 'healer'),
      deriveRaidActor(profile('warrior', {}), 'dps'),
      deriveRaidActor(profile('warrior', {}), 'dps'),
    ];
    const r = simulateRaidRun(party, [hardBoss], 808);
    // At least one heal event from a named heal spell (Greater Heal / Renew).
    expect(
      r.events.some((e) => e.type === 'heal' && (e.ability === 'Greater Heal' || e.ability === 'Renew')),
    ).toBe(true);
  });

  it('a shielded tank produces absorb events', () => {
    const party: RaidActor[] = [
      deriveRaidActor(profile('mage', { 'mage.frost.ice_barrier': 1 }), 'tank'),
      deriveRaidActor(profile('priest', {}, 50), 'healer'),
      deriveRaidActor(profile('warrior', {}), 'dps'),
    ];
    const r = simulateRaidRun(party, boss, 77);
    expect(r.events.some((e) => e.type === 'absorb')).toBe(true);
  });

  it('stays deterministic with the new mechanics', () => {
    const make = (): RaidActor[] => [
      deriveRaidActor(profile('mage', { 'mage.frost.ice_barrier': 1 }), 'tank'),
      deriveRaidActor(profile('priest', {}, 50), 'healer'),
      deriveRaidActor(profile('warlock', { 'warlock.aff.unstable_affliction': 1 }), 'dps'),
      deriveRaidActor(profile('warrior', { 'warrior.fury.bloodthirst': 1 }), 'dps'),
    ];
    const a = simulateRaidRun(make(), boss, 9001);
    const b = simulateRaidRun(make(), boss, 9001);
    expect(a.events.length).toBe(b.events.length);
    expect(a.events).toEqual(b.events);
  });
});

describe('tank mitigation', () => {
  function protTank(withTalents: boolean): RaidActor {
    const tree = CLASS_TALENTS.warrior![2]!; // Protection
    const alloc: Record<string, number> = {};
    if (withTalents) for (const node of tree.nodes) alloc[node.id] = node.maxRanks;
    const base = deriveCombatProfile({
      name: 'Protector',
      level: 60,
      klass: 'warrior',
      primary: baseStatsFor('human', 'warrior', 60),
      equipment: { attack_power: 150, strength: 200, constitution: 400, armor: 200 },
      talents: aggregateTalentEffects('warrior', alloc),
    });
    return deriveRaidActor(base, 'tank');
  }
  const pressureBoss: CombatActor = {
    name: 'Boss', maxHealth: 200000, attackPower: 400, swingInterval: 1.5,
    critChance: 0.1, critMultiplier: 2, armor: 0, lifesteal: 0, shield: 0,
    signatureAbilities: [], isBoss: true,
  };

  it('prot capstone is a mitigation ability', () => {
    const cap = CLASS_TALENTS.warrior![2]!.nodes.at(-1)!;
    expect(SIGNATURE_ABILITIES[cap.effect.combatTags![0]!]!.kind).toBe('mitigation');
    expect(CLASS_TALENTS.paladin![1]!.nodes.at(-1)!.name).toBe('Ardent Defender');
  });

  it('a mitigation cooldown reduces damage taken by the tank', () => {
    const dmgTaken = (party: RaidActor[]): number => {
      const r = simulateRaidRun(party, [pressureBoss], 999);
      let d = 0;
      for (const e of r.events) {
        if (e.t > 60) break;
        if (e.source === 'Boss' && (e.type === 'attack' || e.type === 'ability') && e.amount) d += e.amount;
      }
      return d;
    };
    const withMit = simulateRaidRun([protTank(true)], [pressureBoss], 999);
    expect(withMit.events.some((e) => e.ability === 'Shield Wall')).toBe(true);
    expect(dmgTaken([protTank(true)])).toBeLessThan(dmgTaken([protTank(false)]));
  });
});

describe('healer offensive vs defensive rotation modes', () => {
  function priestHealer(rotation?: import('./index').CharacterRotation): RaidActor {
    const base = deriveCombatProfile({
      name: 'Priest',
      level: 60,
      klass: 'priest',
      primary: baseStatsFor('human', 'priest', 60),
      equipment: { spell_power: 150, intelligence: 150, constitution: 150 },
      talents: aggregateTalentEffects('priest', {}),
    });
    return deriveRaidActor({ ...base, rotation }, 'healer');
  }
  function warriorTank(): RaidActor {
    const base = deriveCombatProfile({
      name: 'Tank', level: 60, klass: 'warrior',
      primary: baseStatsFor('human', 'warrior', 60),
      equipment: { attack_power: 100, constitution: 300, armor: 200 },
      talents: aggregateTalentEffects('warrior', {}),
    });
    return deriveRaidActor(base, 'tank');
  }
  const boss: CombatActor = {
    name: 'Boss', maxHealth: 400000, attackPower: 260, swingInterval: 1.4,
    critChance: 0.1, critMultiplier: 2, armor: 0, lifesteal: 0, shield: 0,
    signatureAbilities: [], isBoss: true,
  };

  function tally(rotation?: import('./index').CharacterRotation): { heal: number; dmg: number } {
    const r = simulateRaidRun([warriorTank(), priestHealer(rotation)], [boss], 321);
    let heal = 0, dmg = 0;
    for (const e of r.events) {
      if (e.source !== 'Priest' || typeof e.amount !== 'number') continue;
      if (e.type === 'heal') heal += e.amount;
      else if (e.target === 'Boss') dmg += e.amount;
    }
    return { heal, dmg };
  }

  it('default (hybrid): healer both heals and deals some damage', () => {
    const t = tally();
    expect(t.heal).toBeGreaterThan(0);
    expect(t.dmg).toBeGreaterThan(0);
  });

  it('pure HPS: disabling damage spells → heals only, no damage', () => {
    const pureHps: import('./index').CharacterRotation = {
      rules: [
        { abilityId: 'priest_smite', enabled: false, conditionType: 'always' },
        { abilityId: 'priest_shadow_word_pain', enabled: false, conditionType: 'always' },
      ],
    };
    const t = tally(pureHps);
    expect(t.heal).toBeGreaterThan(0);
    expect(t.dmg).toBe(0);
  });

  it('pure DPS (niche): disabling heal spells → damage only, no healing', () => {
    const pureDps: import('./index').CharacterRotation = {
      rules: [
        { abilityId: 'priest_greater_heal', enabled: false, conditionType: 'always' },
        { abilityId: 'priest_renew', enabled: false, conditionType: 'always' },
      ],
    };
    const t = tally(pureDps);
    expect(t.dmg).toBeGreaterThan(0);
    expect(t.heal).toBe(0);
  });
});

describe('rich combat log (pvp)', () => {
  it('lifesteal duelist produces drain events', () => {
    const drainer = profile('warrior', { 'warrior.fury.bloodthirst': 1 }, 50);
    const dummy = profile('warrior', {}, 50);
    const r = simulatePvpDuel(drainer, dummy, 5);
    expect(r.events.some((e) => e.type === 'drain')).toBe(true);
  });
});
