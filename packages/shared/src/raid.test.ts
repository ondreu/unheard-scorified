import { describe, expect, it } from 'vitest';
import {
  RAIDS,
  RAID_COMPOSITION,
  RAID_PARTY_SIZE,
  RAID_SIZES,
  buildRaidBoss,
  buildTrainingDummy,
  compositionSize,
  computeRaidReward,
  defaultRaidComposition,
  deriveRaidActor,
  isRaidRole,
  isRaidSize,
  isRaidUnlocked,
  isValidComposition,
  scaleBoss,
  simulateDummyFight,
  simulateRaidRun,
  type CombatActor,
  type RaidActor,
  type RaidRole,
} from './index';
import { RAID_LOOT_TABLES } from './loot';
import { ITEMS } from './data/items';
import { QUESTS } from './data/quests';

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
    const boss = buildRaidBoss(RAIDS.molten_core!.bosses[0]!);
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

  it('a weak party hard-fails after exhausting attempts', () => {
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
    expect(result.wipes).toBeGreaterThan(1);
  });

  it('a clean clear reports zero wipes', () => {
    const bosses = RAIDS.molten_core!.bosses.map(buildRaidBoss);
    const result = simulateRaidRun(buildParty(3), bosses, 999);
    expect(result.victory).toBe(true);
    expect(result.wipes).toBe(0);
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

describe('isRaidUnlocked (attunement)', () => {
  it('requires level and an attunement quest', () => {
    expect(isRaidUnlocked('molten_core', 13, ['dw_morbent_fel'])).toBe(false);
    expect(isRaidUnlocked('molten_core', 14, [])).toBe(false);
    expect(isRaidUnlocked('molten_core', 14, ['tn_galak_ogres'])).toBe(true);
  });

  it('blackwing lair needs the drakefire attunement', () => {
    expect(isRaidUnlocked('blackwing_lair', 18, ['dw_morbent_fel'])).toBe(false);
    expect(isRaidUnlocked('blackwing_lair', 18, ['al_drakefire_attunement'])).toBe(true);
  });

  it('unknown raid is locked', () => {
    expect(isRaidUnlocked('nonsense', 20, ['al_drakefire_attunement'])).toBe(false);
  });

  it("Zul'Gurub needs level 17 and the Paragons of Power attunement", () => {
    expect(isRaidUnlocked('zulgurub', 16, ['al_paragons_of_power'])).toBe(false);
    expect(isRaidUnlocked('zulgurub', 17, [])).toBe(false);
    expect(isRaidUnlocked('zulgurub', 17, ['ho_paragons_of_power'])).toBe(true);
  });

  it("Temple of Ahn'Qiraj needs level 19 and the Scepter attunement", () => {
    expect(isRaidUnlocked('ahnqiraj', 18, ['al_scepter_of_the_sands'])).toBe(false);
    expect(isRaidUnlocked('ahnqiraj', 19, ['al_paragons_of_power'])).toBe(false);
    expect(isRaidUnlocked('ahnqiraj', 19, ['al_scepter_of_the_sands'])).toBe(true);
  });
});

describe('raid data integrity', () => {
  it('every raid has a loot table and all loot entries reference real items', () => {
    for (const [id, raid] of Object.entries(RAIDS)) {
      const table = RAID_LOOT_TABLES[id];
      expect(table, `missing loot table for ${id}`).toBeDefined();
      for (const entry of table!.entries) {
        expect(ITEMS[entry.itemId], `unknown item ${entry.itemId} in ${id}`).toBeDefined();
      }
      // Attunement questy musí existovat (gate nesmí ukazovat na neznámý quest).
      for (const q of raid.attunement.questAnyOf) {
        expect(QUESTS[q], `unknown attunement quest ${q} for ${id}`).toBeDefined();
      }
    }
  });

  it("M12 raids drop their bind-on-pickup loot on victory", () => {
    for (const id of ['zulgurub', 'ahnqiraj']) {
      const raid = RAIDS[id]!;
      // Projdi řadu seedů — alespoň jeden musí vyrolovat item z tabulky.
      const dropped = new Set<string>();
      for (let seed = 0; seed < 60; seed++) {
        for (const item of computeRaidReward(raid, true, seed).items) dropped.add(item);
      }
      expect(dropped.size).toBeGreaterThan(0);
    }
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

  it('hard fail grants no reward (no consolation)', () => {
    const raid = RAIDS.molten_core!;
    const r = computeRaidReward(raid, false, 1);
    expect(r).toEqual({ xp: 0, gold: 0, items: [] });
  });

  it('reward scales down with wipes (max at 0 wipes)', () => {
    const raid = RAIDS.blackwing_lair!;
    const clean = computeRaidReward(raid, true, 123, 0);
    const wiped = computeRaidReward(raid, true, 123, 3);
    expect(clean.xp).toBe(raid.baseXp);
    expect(wiped.xp).toBeLessThan(clean.xp);
    expect(wiped.gold).toBeLessThanOrEqual(clean.gold);
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
