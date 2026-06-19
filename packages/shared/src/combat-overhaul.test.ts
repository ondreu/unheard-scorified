import { describe, expect, it } from 'vitest';
import {
  CLASS_BASELINE_ABILITIES,
  SIGNATURE_ABILITIES,
  SUBCLASS_ABILITIES,
  abilityDamageMult,
  aggregateProgression,
  applyAbsorb,
  baseStatsFor,
  deriveCombatProfile,
  deriveRaidActor,
  resolveAbilities,
  simulatePvpDuel,
  simulateRaidRun,
  EMPTY_PROGRESSION,
  CLASSES,
  type ClassId,
  type FeatId,
  type ProgressionEffects,
  type CombatActor,
  type RaidActor,
} from './index';

/** Sestaví progresi z featů (každý feat = jeden ASI/feat slot). */
function featProg(...featIds: FeatId[]): ProgressionEffects {
  return aggregateProgression(
    featIds.map((featId, i) => ({ slotId: `asi@${i}`, choice: { kind: 'feat', featId } })),
  );
}

describe('ability descriptions & execute', () => {
  it('every player ability (class kit + subclass + draft pool) has a description', () => {
    for (const list of Object.values(CLASS_BASELINE_ABILITIES)) {
      for (const ab of list) expect(ab.description, ab.id).toBeTruthy();
    }
    for (const [id, ab] of Object.entries(SUBCLASS_ABILITIES)) {
      expect(ab.description, id).toBeTruthy();
    }
    for (const [id, spec] of Object.entries(SIGNATURE_ABILITIES)) {
      expect(spec.description, id).toBeTruthy();
    }
  });

  it('no ability uses the WoW execute mechanic anymore (ADR 0036)', () => {
    // „Fix kouzla": execute (víc damage pod prahem HP) je WoW-ismus, ne D&D — smazán.
    for (const kit of Object.values(CLASS_BASELINE_ABILITIES)) {
      for (const ab of kit) {
        expect(ab.executeBelowPct).toBeUndefined();
        expect(ab.executeDamageMult).toBeUndefined();
      }
    }
  });

  it('abilityDamageMult returns the base mult (execute fields gone)', () => {
    const strike = CLASS_BASELINE_ABILITIES.fighter!.find((a) => a.id === 'fighter_weapon_strike')!;
    expect(abilityDamageMult(strike, 0.1)).toBe(strike.damageMult);
  });
});

describe('resolveAbilities (class kit + subclass)', () => {
  it('grants class abilities by level, gating higher ones', () => {
    const low = resolveAbilities('fighter', null, 1).map((a) => a.id);
    expect(low).toContain('fighter_weapon_strike'); // unlock 1
    expect(low).not.toContain('fighter_onslaught'); // unlock 20
    const high = resolveAbilities('fighter', null, 40).map((a) => a.id);
    expect(high).toContain('fighter_action_surge');
    expect(high).toContain('fighter_onslaught');
  });

  it('adds the subclass signature ability at the subclass level', () => {
    const ids = resolveAbilities('fighter', 'champion', 60).map((a) => a.id);
    expect(ids).toContain('champion_heroic_surge');
    // Without a subclass the signature is absent.
    expect(resolveAbilities('fighter', null, 60).map((a) => a.id)).not.toContain('champion_heroic_surge');
  });

  it('healer classes expose heal abilities', () => {
    const cleric = resolveAbilities('cleric', null, 60);
    expect(cleric.some((a) => a.kind === 'heal')).toBe(true);
  });
});

function profile(
  klass: ClassId,
  progression: ProgressionEffects = EMPTY_PROGRESSION,
  level = 50,
): CombatActor {
  return deriveCombatProfile({
    name: `${klass}-hero`,
    level,
    klass,
    subclass: CLASSES[klass].subclasses[0]!.id,
    primary: baseStatsFor('human', klass, level),
    equipment: { attack_power: 60, constitution: 60, armor: 100 },
    progression,
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
  it('a shield feat grants an absorb pool; without it shield is 0', () => {
    const withBarrier = profile('wizard', featProg('defensive_duelist'));
    const without = profile('wizard');
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
  it('class kit abilities carry the right kind', () => {
    const warlock = profile('warlock');
    expect(warlock.signatureAbilities.find((a) => a.id === 'warlock_hex')?.kind).toBe('dot');
    expect(warlock.signatureAbilities.find((a) => a.id === 'warlock_vampiric_touch')?.kind).toBe('drain');
  });
});

describe('rich combat log (raid/dungeon engine)', () => {
  const boss = [tankyBoss()];

  it('lifesteal dps produces drain events', () => {
    const party: RaidActor[] = [
      deriveRaidActor(profile('fighter'), 'tank'),
      deriveRaidActor(profile('cleric'), 'healer'),
      deriveRaidActor(profile('warlock', featProg('lucky')), 'dps'),
    ];
    const r = simulateRaidRun(party, boss, 4242);
    expect(r.events.some((e) => e.type === 'drain')).toBe(true);
  });

  it('MR-5: raid combat běží na dice-roll modelu (d20 vs AC v logu)', () => {
    const party: RaidActor[] = [
      deriveRaidActor(profile('fighter'), 'tank'),
      deriveRaidActor(profile('cleric'), 'healer'),
      deriveRaidActor(profile('warlock'), 'dps'),
    ];
    const joined = simulateRaidRun(party, boss, 4242)
      .events.map((e) => e.message)
      .join('\n');
    expect(joined).toMatch(/vs AC \d+/);
  });

  it('a dot caster produces dot tick events', () => {
    const party: RaidActor[] = [
      deriveRaidActor(profile('fighter'), 'tank'),
      deriveRaidActor(profile('cleric'), 'healer'),
      deriveRaidActor(profile('warlock'), 'dps'),
    ];
    const r = simulateRaidRun(party, boss, 13);
    expect(r.events.some((e) => e.type === 'dot')).toBe(true);
  });

  it('a healer casts heal abilities (not just auto-heals)', () => {
    const hardBoss: CombatActor = { ...tankyBoss('Pressure'), attackPower: 220, swingInterval: 1, maxHealth: 6000 };
    const party: RaidActor[] = [
      deriveRaidActor(profile('fighter'), 'tank'),
      deriveRaidActor(profile('cleric'), 'healer'),
      deriveRaidActor(profile('fighter'), 'dps'),
      deriveRaidActor(profile('fighter'), 'dps'),
    ];
    const r = simulateRaidRun(party, [hardBoss], 808);
    expect(r.events.some((e) => e.type === 'heal' && e.ability === 'Cure Wounds')).toBe(true);
  });

  it('a shielded tank produces absorb events', () => {
    const party: RaidActor[] = [
      deriveRaidActor(profile('wizard', featProg('defensive_duelist')), 'tank'),
      deriveRaidActor(profile('cleric'), 'healer'),
      deriveRaidActor(profile('fighter'), 'dps'),
    ];
    const r = simulateRaidRun(party, boss, 77);
    expect(r.events.some((e) => e.type === 'absorb')).toBe(true);
  });

  it('stays deterministic with the new mechanics', () => {
    const make = (): RaidActor[] => [
      deriveRaidActor(profile('wizard', featProg('defensive_duelist')), 'tank'),
      deriveRaidActor(profile('cleric'), 'healer'),
      deriveRaidActor(profile('warlock'), 'dps'),
      deriveRaidActor(profile('fighter', featProg('lucky')), 'dps'),
    ];
    const a = simulateRaidRun(make(), boss, 9001);
    const b = simulateRaidRun(make(), boss, 9001);
    expect(a.events.length).toBe(b.events.length);
    expect(a.events).toEqual(b.events);
  });
});

describe('tank mitigation (engine path)', () => {
  /** Tank s mitigation ability ze sdíleného poolu (Shield of Faith). */
  function mitTank(withMit: boolean): RaidActor {
    const base = deriveCombatProfile({
      name: 'Protector',
      level: 60,
      klass: 'fighter',
      subclass: 'champion',
      primary: baseStatsFor('human', 'fighter', 60),
      equipment: { attack_power: 150, strength: 200, constitution: 400, armor: 200 },
      progression: featProg('tough'),
    });
    if (withMit) {
      base.signatureAbilities = [
        ...base.signatureAbilities,
        { id: 'shield_of_faith', ...SIGNATURE_ABILITIES.shield_of_faith! },
      ];
    }
    return deriveRaidActor(base, 'tank');
  }
  const pressureBoss: CombatActor = {
    name: 'Boss', maxHealth: 200000, attackPower: 400, swingInterval: 1.5,
    critChance: 0.1, critMultiplier: 2, armor: 0, lifesteal: 0, shield: 0,
    signatureAbilities: [], isBoss: true,
  };

  it('shield_of_faith is a mitigation ability', () => {
    expect(SIGNATURE_ABILITIES.shield_of_faith!.kind).toBe('mitigation');
  });

  it('a mitigation cooldown reduces damage taken by the tank', () => {
    const dmgTaken = (party: RaidActor[], seed: number): number => {
      const r = simulateRaidRun(party, [pressureBoss], seed);
      let d = 0;
      for (const e of r.events) {
        if (e.t > 60) break;
        if (e.source === 'Boss' && (e.type === 'attack' || e.type === 'ability') && e.amount) d += e.amount;
      }
      return d;
    };
    const withMit = simulateRaidRun([mitTank(true)], [pressureBoss], 999);
    expect(withMit.events.some((e) => e.ability === 'Shield of Faith')).toBe(true);
    // Dice-roll combat (MR-5) přidává hit/miss varianci → porovnání agreguj přes víc
    // seedů, ať mitigace (snižuje každý zásah) převáží šum jednotlivého běhu.
    let totalWith = 0;
    let totalWithout = 0;
    for (let seed = 1; seed <= 12; seed++) {
      totalWith += dmgTaken([mitTank(true)], seed);
      totalWithout += dmgTaken([mitTank(false)], seed);
    }
    expect(totalWith).toBeLessThan(totalWithout);
  });
});

describe('healer offensive vs defensive rotation modes', () => {
  function clericHealer(rotation?: import('./index').CharacterRotation): RaidActor {
    const base = deriveCombatProfile({
      name: 'Cleric',
      level: 60,
      klass: 'cleric',
      subclass: 'life_domain',
      primary: baseStatsFor('human', 'cleric', 60),
      equipment: { spell_power: 150, wisdom: 150, constitution: 150 },
      progression: EMPTY_PROGRESSION,
    });
    return deriveRaidActor({ ...base, rotation }, 'healer');
  }
  function fighterTank(): RaidActor {
    const base = deriveCombatProfile({
      name: 'Tank', level: 60, klass: 'fighter', subclass: 'champion',
      primary: baseStatsFor('human', 'fighter', 60),
      equipment: { attack_power: 100, constitution: 300, armor: 200 },
      progression: EMPTY_PROGRESSION,
    });
    return deriveRaidActor(base, 'tank');
  }
  const boss: CombatActor = {
    name: 'Boss', maxHealth: 400000, attackPower: 260, swingInterval: 1.4,
    critChance: 0.1, critMultiplier: 2, armor: 0, lifesteal: 0, shield: 0,
    signatureAbilities: [], isBoss: true,
  };

  function tally(rotation?: import('./index').CharacterRotation): { heal: number; dmg: number } {
    const r = simulateRaidRun([fighterTank(), clericHealer(rotation)], [boss], 321);
    let heal = 0, dmg = 0;
    for (const e of r.events) {
      if (e.source !== 'Cleric' || typeof e.amount !== 'number') continue;
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
        { abilityId: 'cleric_sacred_flame', enabled: false, conditionType: 'always' },
        { abilityId: 'cleric_guiding_bolt', enabled: false, conditionType: 'always' },
        { abilityId: 'cleric_spirit_guardians', enabled: false, conditionType: 'always' },
      ],
    };
    const t = tally(pureHps);
    expect(t.heal).toBeGreaterThan(0);
    expect(t.dmg).toBe(0);
  });

  it('pure DPS (niche): disabling heal spells → damage only, no healing', () => {
    const pureDps: import('./index').CharacterRotation = {
      rules: [
        { abilityId: 'cleric_cure_wounds', enabled: false, conditionType: 'always' },
        { abilityId: 'life_preserve_life', enabled: false, conditionType: 'always' },
      ],
    };
    const t = tally(pureDps);
    expect(t.dmg).toBeGreaterThan(0);
    expect(t.heal).toBe(0);
  });
});

describe('rich combat log (pvp)', () => {
  it('lifesteal duelist produces drain events', () => {
    const drainer = profile('warlock', featProg('blood_drinker'), 50);
    const dummy = profile('fighter', EMPTY_PROGRESSION, 50);
    const r = simulatePvpDuel(drainer, dummy, 5);
    expect(r.events.some((e) => e.type === 'drain')).toBe(true);
  });
});
