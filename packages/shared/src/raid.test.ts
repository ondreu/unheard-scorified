import { describe, expect, it } from 'vitest';
import {
  RAID_COMPOSITION,
  RAID_PARTY_SIZE,
  RAID_SIZES,
  buildTrainingDummy,
  compositionSize,
  defaultRaidComposition,
  deriveRaidActor,
  isRaidRole,
  isRaidSize,
  isValidComposition,
  scaleBoss,
  simulateDummyFight,
  simulateRaidRun,
  type CombatActor,
  type RaidActor,
  type RaidRole,
} from './index';

// Group PVE run engine (legacy `raid` název, ADR 0033). Raidy jako herní mód byly
// vyříznuty → testy běží na syntetických bossech, ne na (smazaných) raid datech.

/** Silný generický bojový profil pro testy. */
function strongActor(name: string, attackPower = 60, maxHealth = 800): CombatActor {
  return {
    name,
    maxHealth,
    attackPower,
    swingInterval: 2.0,
    critChance: 0.2,
    critMultiplier: 2,
    armor: 40,
    lifesteal: 0,
    shield: 0,
    signatureAbilities: [],
  };
}

/** Syntetický boss-encounter (CombatActor) pro testy enginu. */
function bossActor(name: string, attackPower = 40, maxHealth = 4000): CombatActor {
  return { ...strongActor(name, attackPower, maxHealth), swingInterval: 2.5 };
}

/** Postaví standardní party 1 tank / 1 heal / 3 dps. */
function buildParty(scale = 1): RaidActor[] {
  const party: RaidActor[] = [];
  party.push(deriveRaidActor(strongActor('Tanky', 50 * scale, 900 * scale), 'tank'));
  party.push(deriveRaidActor(strongActor('Healy', 70 * scale, 700 * scale), 'healer'));
  for (let i = 0; i < RAID_COMPOSITION.dps; i++) {
    party.push(deriveRaidActor(strongActor(`Dps${i}`, 80 * scale, 650 * scale), 'dps'));
  }
  return party;
}

describe('raid composition', () => {
  it('party size matches composition', () => {
    expect(RAID_PARTY_SIZE).toBe(
      RAID_COMPOSITION.tank + RAID_COMPOSITION.healer + RAID_COMPOSITION.dps,
    );
    expect(RAID_PARTY_SIZE).toBe(5);
  });

  it('isRaidRole validates roles', () => {
    for (const r of ['tank', 'healer', 'dps'] as RaidRole[]) expect(isRaidRole(r)).toBe(true);
    expect(isRaidRole('bard')).toBe(false);
  });
});

describe('raid sizes & composition', () => {
  it('supports 5/10/20 and validates size', () => {
    expect([...RAID_SIZES]).toEqual([5, 10, 20]);
    expect(isRaidSize(10)).toBe(true);
    expect(isRaidSize(7)).toBe(false);
  });

  it('default composition sums to the size', () => {
    for (const size of RAID_SIZES) {
      expect(compositionSize(defaultRaidComposition(size))).toBe(size);
    }
  });

  it('validates custom composition (sum + player role present)', () => {
    expect(isValidComposition({ tank: 2, healer: 2, dps: 6 }, 10, 'dps')).toBe(true);
    // Hráč dps, ale dps=0 → neplatné.
    expect(isValidComposition({ tank: 3, healer: 7, dps: 0 }, 10, 'dps')).toBe(false);
    // Součet nesedí.
    expect(isValidComposition({ tank: 1, healer: 1, dps: 3 }, 10, 'tank')).toBe(false);
    // Záporné / necelé.
    expect(isValidComposition({ tank: -1, healer: 2, dps: 9 }, 10, 'healer')).toBe(false);
    // Extrémní (0 healerů) je povoleno — strategická volba hráče.
    expect(isValidComposition({ tank: 1, healer: 0, dps: 9 }, 10, 'tank')).toBe(true);
  });

  it('scaleBoss scales HP and damage with size', () => {
    const boss = bossActor('Cinderwarden', 40, 5000);
    const scaled = scaleBoss(boss, 20);
    expect(scaled.maxHealth).toBe(boss.maxHealth * 4);
    expect(scaled.attackPower).toBe(boss.attackPower * 4);
    // Base size = identita.
    expect(scaleBoss(boss, 5)).toEqual(boss);
  });
});

describe('deriveRaidActor', () => {
  it('tank gains health and loses damage', () => {
    const base = strongActor('T', 100, 1000);
    const tank = deriveRaidActor(base, 'tank');
    expect(tank.maxHealth).toBeGreaterThan(base.maxHealth);
    expect(tank.attackPower).toBeLessThan(base.attackPower);
    expect(tank.healPower).toBe(0);
  });

  it('healer gains heal power and loses damage', () => {
    const base = strongActor('H', 100, 800);
    const healer = deriveRaidActor(base, 'healer');
    expect(healer.healPower).toBeGreaterThan(0);
    expect(healer.attackPower).toBeLessThan(base.attackPower);
  });

  it('dps is unchanged in core stats', () => {
    const base = strongActor('D', 100, 700);
    const dps = deriveRaidActor(base, 'dps');
    expect(dps.attackPower).toBe(base.attackPower);
    expect(dps.maxHealth).toBe(base.maxHealth);
  });
});

describe('simulateRaidRun', () => {
  const bosses = (): CombatActor[] => [
    bossActor('Boss One', 35, 3500),
    bossActor('Boss Two', 38, 4000),
    bossActor('Boss Three', 42, 4500),
  ];

  it('is deterministic for the same seed', () => {
    const a = simulateRaidRun(buildParty(), bosses(), 12345);
    const b = simulateRaidRun(buildParty(), bosses(), 12345);
    expect(a.victory).toBe(b.victory);
    expect(a.durationSec).toBe(b.durationSec);
    expect(a.events.length).toBe(b.events.length);
  });

  it('a strong party defeats the encounter sequence', () => {
    const result = simulateRaidRun(buildParty(3), bosses(), 999);
    expect(result.victory).toBe(true);
    expect(result.events.at(-1)?.type).toBe('victory');
  });

  it('a weak party hard-fails after exhausting attempts', () => {
    const weak: RaidActor[] = [
      deriveRaidActor(strongActor('T', 2, 50), 'tank'),
      deriveRaidActor(strongActor('H', 2, 50), 'healer'),
      deriveRaidActor(strongActor('D', 2, 50), 'dps'),
    ];
    const tough: CombatActor[] = [bossActor('Wall', 80, 20000), bossActor('Gate', 90, 25000)];
    const result = simulateRaidRun(weak, tough, 7);
    expect(result.victory).toBe(false);
    expect(result.defeatedAtBoss).toBeDefined();
    expect(result.events.at(-1)?.type).toBe('defeat');
    expect(result.wipes).toBeGreaterThan(1);
  });

  it('a clean clear reports zero wipes', () => {
    const result = simulateRaidRun(buildParty(3), bosses(), 999);
    expect(result.victory).toBe(true);
    expect(result.wipes).toBe(0);
  });

  it('produces heal events from the healer', () => {
    // Velký, dlouho žijící boss → party utrží poškození a healer léčí.
    const tanky = [scaleBoss(bossActor('Endless', 45, 6000), 60)];
    const result = simulateRaidRun(buildParty(2), tanky, 42);
    expect(result.events.some((e) => e.type === 'heal')).toBe(true);
  });

  it('all event times are non-decreasing', () => {
    const result = simulateRaidRun(buildParty(2), bosses(), 314);
    for (let i = 1; i < result.events.length; i++) {
      expect(result.events[i]!.t).toBeGreaterThanOrEqual(result.events[i - 1]!.t);
    }
  });
});

describe('spell sloty v group PVE (ADR 0034)', () => {
  // Caster s jedním kouzlem (cd 4 s) proti nekonečnému terči (60 s) → kdyby nebyl
  // slot limit, kouzlo se sešle ~15×. Sloty ho omezí na per-encounter rozpočet.
  const caster = (slots: Record<number, number>, tier: number): CombatActor => ({
    ...strongActor('Mage', 60, 800),
    signatureAbilities: [
      { id: 'spell_x', name: 'Spell X', kind: 'strike', cooldownSec: 4, damageMult: 1.5, spellTier: tier },
    ],
    spellSlots: slots,
  });
  const castCount = (slots: Record<number, number>, tier: number): number =>
    simulateDummyFight(caster(slots, tier), 'dps', 60, 5).events.filter((e) => e.ability === 'Spell X').length;

  it('tier ≥ 1 kouzlo je omezené počtem slotů (per-encounter rozpočet)', () => {
    expect(castCount({ 1: 2 }, 1)).toBe(2);
    expect(castCount({ 1: 1 }, 1)).toBe(1);
  });

  it('bez slotu se tier ≥ 1 kouzlo vůbec nesešle (fizzles → basic swing)', () => {
    expect(castCount({}, 1)).toBe(0);
  });

  it('cantrip (tier 0) je neomezený i bez slotů', () => {
    expect(castCount({}, 0)).toBeGreaterThan(2);
  });
});

describe('Ki v group PVE (ADR 0034)', () => {
  // Monk-like aktér s jednou technikou (cd 4 s) proti nekonečnému terči (60 s) →
  // bez Ki limitu by se sešla ~15×. Ki pool ji omezí na per-encounter rozpočet.
  const kiUser = (kiPoints: number, cost: number): CombatActor => ({
    ...strongActor('Monk', 60, 800),
    kiPoints,
    signatureAbilities: [
      { id: 'ki_x', name: 'Ki Strike', kind: 'strike', cooldownSec: 4, damageMult: 1.5, kiCost: cost },
    ],
  });
  const castCount = (kiPoints: number, cost: number): number =>
    simulateDummyFight(kiUser(kiPoints, cost), 'dps', 60, 5).events.filter((e) => e.ability === 'Ki Strike').length;

  it('technika s kiCost je omezená Ki poolem', () => {
    expect(castCount(2, 1)).toBe(2);
    expect(castCount(3, 1)).toBe(3);
    expect(castCount(0, 1)).toBe(0);
  });

  it('technika bez kiCost je neomezená', () => {
    expect(castCount(0, 0)).toBeGreaterThan(2);
  });
});

describe('training dummy sandbox (MIL)', () => {
  it('runs for the requested duration and stays alive (huge HP)', () => {
    const dps = strongActor('Garrosh', 60, 800);
    const result = simulateDummyFight(dps, 'dps', 30, 42);
    expect(result.durationSec).toBeLessThanOrEqual(30);
    expect(result.durationSec).toBeGreaterThan(20);
    expect(result.events.some((e) => e.type === 'attack' && e.source === 'Garrosh')).toBe(true);
    expect(result.events.some((e) => e.type === 'enemy_defeated')).toBe(false);
  });

  it('is deterministic for the same seed', () => {
    const dps = strongActor('Thrall', 55, 700);
    const a = simulateDummyFight(dps, 'dps', 20, 7);
    const b = simulateDummyFight(dps, 'dps', 20, 7);
    expect(a).toEqual(b);
  });

  it('healer role can self-heal off the dummy chip damage', () => {
    const healer = strongActor('Tyrande', 40, 500);
    const result = simulateDummyFight(healer, 'healer', 60, 9);
    expect(result.events.some((e) => e.type === 'heal' && e.source === 'Tyrande')).toBe(true);
  });

  it('tank role takes mitigated, survivable chip damage from the dummy', () => {
    const tank = strongActor('Magni', 35, 400);
    const result = simulateDummyFight(tank, 'tank', 60, 3);
    expect(result.events.some((e) => e.type === 'player_defeated')).toBe(false);
  });

  it('buildTrainingDummy scales chip damage off the reference max health', () => {
    const small = buildTrainingDummy(100);
    const big = buildTrainingDummy(1000);
    expect(big.attackPower).toBeGreaterThan(small.attackPower);
    expect(small.maxHealth).toBe(big.maxHealth);
  });
});
