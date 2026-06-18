import { describe, expect, it } from 'vitest';
import {
  deriveCombatProfile,
  buildEnemyActor,
  actorAc,
  actorAttackBonus,
  resolveAttack,
  weaponDamageSpec,
  type CombatActor,
} from './combat';
import { buildDndAttackMessage, rollInitiative } from './dnd-combat';
import { diceAverage } from './dice';
import { baseStatsFor } from './character';
import { EMPTY_PROGRESSION } from './levelup';
import { SeededRng } from './rng';

function hero(level: number, klass: Parameters<typeof baseStatsFor>[1] = 'fighter'): CombatActor {
  return deriveCombatProfile({
    name: 'Hero',
    level,
    klass,
    primary: baseStatsFor('human', klass, level),
    equipment: {},
    progression: EMPTY_PROGRESSION,
  });
}

describe('deriveCombatProfile — D&D fields (MR-5)', () => {
  it('populates AC, attack bonus, save mods and spell slots', () => {
    const wiz = hero(5, 'wizard');
    expect(wiz.armorClass).toBeGreaterThanOrEqual(10);
    expect(wiz.attackBonus).toBeGreaterThan(0);
    expect(wiz.saveMods?.dexterity).toBeDefined();
    expect(wiz.spellSaveDc).toBeGreaterThan(8);
    // full caster lvl 5 má spell sloty
    expect(Object.keys(wiz.spellSlots ?? {}).length).toBeGreaterThan(0);
  });

  it('higher level raises attack bonus (proficiency + stat growth)', () => {
    expect(hero(20).attackBonus!).toBeGreaterThan(hero(1).attackBonus!);
  });
});

describe('weaponDamageSpec calibration', () => {
  it('average damage stays close to attackPower (balanc preserved)', () => {
    for (const lvl of [1, 10, 30, 60]) {
      const a = hero(lvl);
      const spec = weaponDamageSpec(a);
      const avg = diceAverage(spec);
      // do 15 % od attackPower
      expect(Math.abs(avg - a.attackPower) / a.attackPower).toBeLessThan(0.15);
    }
  });

  it('crit doubles the dice count, not the bonus', () => {
    const a = hero(10);
    const normal = weaponDamageSpec(a, false);
    const crit = weaponDamageSpec(a, true);
    expect(crit.count).toBe(normal.count * 2);
    expect(crit.bonus).toBe(normal.bonus);
  });
});

describe('resolveAttack', () => {
  const enemy = buildEnemyActor({
    name: 'Dummy',
    maxHealth: 1000,
    attackPower: 10,
    swingInterval: 2.4,
    armorClass: 13,
    attackBonus: 3,
  });

  it('produces hits and misses against a finite AC', () => {
    const a = hero(10);
    let hits = 0;
    let misses = 0;
    for (let s = 0; s < 200; s++) {
      const r = resolveAttack(a, enemy, new SeededRng(s));
      if (r.hit) {
        hits++;
        expect(r.amount).toBeGreaterThanOrEqual(1);
        expect(r.damage).toBeDefined();
      } else {
        misses++;
        expect(r.amount).toBe(0);
      }
    }
    expect(hits).toBeGreaterThan(0);
    expect(misses).toBeGreaterThan(0);
  });

  it('autoHit ignores the AC roll', () => {
    const a = hero(10);
    for (let s = 0; s < 50; s++) {
      const r = resolveAttack(a, enemy, new SeededRng(s), { autoHit: true });
      expect(r.hit).toBe(true);
    }
  });

  it('abilityMult scales damage', () => {
    // stejný seed → stejný d20 a damage dice; mult 2 ~ dvojnásobek base
    const a = hero(20);
    const base = resolveAttack(a, enemy, new SeededRng(5), { autoHit: true, abilityMult: 1 });
    const big = resolveAttack(a, enemy, new SeededRng(5), { autoHit: true, abilityMult: 2 });
    expect(big.amount).toBeGreaterThan(base.amount);
  });

  it('is deterministic for the same seed', () => {
    const a = hero(15);
    const r1 = resolveAttack(a, enemy, new SeededRng(11));
    const r2 = resolveAttack(a, enemy, new SeededRng(11));
    expect(r1).toEqual(r2);
  });
});

describe('helpers + message format', () => {
  it('actorAc / actorAttackBonus fall back when D&D fields absent', () => {
    const bare: CombatActor = {
      name: 'X',
      maxHealth: 100,
      attackPower: 36,
      swingInterval: 2.4,
      critChance: 0.05,
      critMultiplier: 2,
      armor: 100,
      lifesteal: 0,
      shield: 0,
      signatureAbilities: [],
    };
    expect(actorAc(bare)).toBe(10 + 2); // 100/50 = 2
    expect(actorAttackBonus(bare)).toBe(6); // round(sqrt(36))
  });

  it('builds the MR-5 hit / miss / crit log lines', () => {
    const hit = buildDndAttackMessage({
      attackerName: 'Hero',
      targetName: 'Goblin',
      result: {
        hit: true,
        crit: false,
        roll: { natural: 14, modifier: 6, total: 20, isCrit: false, isFumble: false },
        targetAc: 13,
        amount: 28,
      },
    });
    expect(hit).toBe('Hero attacks Goblin: rolls 14 + 6 = 20 vs AC 13 → HIT for 28 damage.');

    const miss = buildDndAttackMessage({
      attackerName: 'Hero',
      targetName: 'Goblin',
      result: {
        hit: false,
        crit: false,
        roll: { natural: 4, modifier: 6, total: 10, isCrit: false, isFumble: false },
        targetAc: 16,
        amount: 0,
      },
    });
    expect(miss).toContain('→ MISS.');

    const crit = buildDndAttackMessage({
      attackerName: 'Mage',
      targetName: 'Ogre',
      result: {
        hit: true,
        crit: true,
        roll: { natural: 20, modifier: 7, total: 27, isCrit: true, isFumble: false },
        targetAc: 15,
        amount: 60,
      },
      abilityName: 'Fireball',
      slotNote: ' (3rd-level slot)',
    });
    expect(crit).toContain('casts Fireball (3rd-level slot)');
    expect(crit).toContain('CRITICAL HIT for 60 damage');
  });

  it('rollInitiative returns d20 + DEX mod in range', () => {
    const a = hero(10);
    const dex = a.saveMods?.dexterity ?? 0;
    for (let s = 0; s < 50; s++) {
      const init = rollInitiative(a, new SeededRng(s));
      expect(init).toBeGreaterThanOrEqual(1 + dex);
      expect(init).toBeLessThanOrEqual(20 + dex);
    }
  });
});
