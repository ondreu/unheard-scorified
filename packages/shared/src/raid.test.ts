import { describe, expect, it } from 'vitest';
import {
  RAIDS,
  RAID_COMPOSITION,
  RAID_PARTY_SIZE,
  buildCompanionBase,
  buildRaidBoss,
  computeRaidReward,
  deriveRaidActor,
  isRaidRole,
  isRaidUnlocked,
  simulateRaidRun,
  type CombatActor,
  type RaidActor,
  type RaidRole,
} from './index';

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
    signatureAbilities: [],
  };
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
  it('is deterministic for the same seed', () => {
    const bosses = RAIDS.molten_core!.bosses.map(buildRaidBoss);
    const a = simulateRaidRun(buildParty(), bosses, 12345);
    const b = simulateRaidRun(buildParty(), bosses, 12345);
    expect(a.victory).toBe(b.victory);
    expect(a.durationSec).toBe(b.durationSec);
    expect(a.events.length).toBe(b.events.length);
  });

  it('a strong party defeats Molten Core', () => {
    const bosses = RAIDS.molten_core!.bosses.map(buildRaidBoss);
    const result = simulateRaidRun(buildParty(3), bosses, 999);
    expect(result.victory).toBe(true);
    expect(result.events.at(-1)?.type).toBe('victory');
  });

  it('a weak party wipes (defeat)', () => {
    const weak: RaidActor[] = [
      deriveRaidActor(strongActor('T', 2, 50), 'tank'),
      deriveRaidActor(strongActor('H', 2, 50), 'healer'),
      deriveRaidActor(strongActor('D', 2, 50), 'dps'),
    ];
    const bosses = RAIDS.blackwing_lair!.bosses.map(buildRaidBoss);
    const result = simulateRaidRun(weak, bosses, 7);
    expect(result.victory).toBe(false);
    expect(result.defeatedAtBoss).toBeDefined();
    expect(result.events.at(-1)?.type).toBe('defeat');
  });

  it('produces heal events from the healer', () => {
    const bosses = RAIDS.molten_core!.bosses.map(buildRaidBoss);
    const result = simulateRaidRun(buildParty(2), bosses, 42);
    expect(result.events.some((e) => e.type === 'heal')).toBe(true);
  });

  it('all event times are non-decreasing', () => {
    const bosses = RAIDS.molten_core!.bosses.map(buildRaidBoss);
    const result = simulateRaidRun(buildParty(2), bosses, 314);
    for (let i = 1; i < result.events.length; i++) {
      expect(result.events[i]!.t).toBeGreaterThanOrEqual(result.events[i - 1]!.t);
    }
  });
});

describe('companion backfill', () => {
  it('builds a usable companion actor per role', () => {
    const raid = RAIDS.molten_core!;
    const tank = deriveRaidActor(buildCompanionBase(raid, 'NPC'), 'tank');
    expect(tank.role).toBe('tank');
    expect(tank.maxHealth).toBeGreaterThan(raid.companion.maxHealth - 1);
  });
});

describe('isRaidUnlocked (attunement)', () => {
  it('requires level and an attunement quest', () => {
    expect(isRaidUnlocked('molten_core', 39, ['dw_morbent_fel'])).toBe(false);
    expect(isRaidUnlocked('molten_core', 40, [])).toBe(false);
    expect(isRaidUnlocked('molten_core', 40, ['tn_galak_ogres'])).toBe(true);
  });

  it('blackwing lair needs the drakefire attunement', () => {
    expect(isRaidUnlocked('blackwing_lair', 55, ['dw_morbent_fel'])).toBe(false);
    expect(isRaidUnlocked('blackwing_lair', 55, ['al_drakefire_attunement'])).toBe(true);
  });

  it('unknown raid is locked', () => {
    expect(isRaidUnlocked('nonsense', 60, ['al_drakefire_attunement'])).toBe(false);
  });
});

describe('computeRaidReward', () => {
  it('victory grants full xp and rolls loot deterministically', () => {
    const raid = RAIDS.blackwing_lair!;
    const a = computeRaidReward(raid, true, 123);
    const b = computeRaidReward(raid, true, 123);
    expect(a).toEqual(b);
    expect(a.xp).toBe(raid.baseXp);
  });

  it('wipe grants only consolation xp and no loot', () => {
    const raid = RAIDS.molten_core!;
    const r = computeRaidReward(raid, false, 1);
    expect(r.xp).toBeLessThan(raid.baseXp);
    expect(r.gold).toBe(0);
    expect(r.items).toHaveLength(0);
  });
});
