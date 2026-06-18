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
import { CLASS_BASELINE_ABILITIES } from './data/abilities';
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

  it('uses the per-class weapon die (barbarian d12, wizard d10, rogue d6)', () => {
    expect(weaponDamageSpec(hero(20, 'barbarian')).sides).toBe(12);
    expect(weaponDamageSpec(hero(20, 'wizard')).sides).toBe(10);
    expect(weaponDamageSpec(hero(20, 'rogue')).sides).toBe(6);
  });

  it('a bigger die yields fewer dice at the same magnitude (preserved average)', () => {
    const barb = hero(20, 'barbarian'); // d12
    const rogue = hero(20, 'rogue'); // d6
    // Stejná postava-level magnitude → větší kostka = méně kostek.
    const barbSpec = weaponDamageSpec(barb);
    const rogueSpec = weaponDamageSpec(rogue);
    expect(barbSpec.sides).toBeGreaterThan(rogueSpec.sides);
    // Průměr drží attackPower (≈), ne počet kostek.
    expect(Math.abs(diceAverage(barbSpec) - barb.attackPower) / barb.attackPower).toBeLessThan(0.15);
    expect(Math.abs(diceAverage(rogueSpec) - rogue.attackPower) / rogue.attackPower).toBeLessThan(0.15);
  });

  it('enemies fall back to a generic d6 (no attackDie)', () => {
    const goblin = buildEnemyActor({ name: 'Goblin', maxHealth: 100, attackPower: 20, swingInterval: 2.4 });
    expect(weaponDamageSpec(goblin).sides).toBe(6);
  });
});

describe('per-class damage type (MR-10b)', () => {
  it('martials deal physical damage, casters their signature element', () => {
    expect(hero(10, 'fighter').damageType).toBe('slashing');
    expect(hero(10, 'rogue').damageType).toBe('piercing');
    expect(hero(10, 'monk').damageType).toBe('bludgeoning');
    expect(hero(10, 'wizard').damageType).toBe('fire');
    expect(hero(10, 'warlock').damageType).toBe('force');
    expect(hero(10, 'cleric').damageType).toBe('radiant');
  });

  it('per-ability damage type overrides the class type (MR-10d): Magic Missile = force', () => {
    const wizard = CLASS_BASELINE_ABILITIES.wizard;
    const magicMissile = wizard.find((a) => a.id === 'wiz_magic_missile')!;
    const fireBolt = wizard.find((a) => a.id === 'wiz_fire_bolt')!;
    expect(magicMissile.damageType).toBe('force');
    // Fire Bolt sdílí typ classy (fire) → damageType nedefinováno (zdědí).
    expect(fireBolt.damageType).toBeUndefined();

    // Proti fire-immune cíli: ability typovaná force projde, fire (class) je 0.
    const fireImmune = buildEnemyActor({
      name: 'Flamelord', maxHealth: 1_000_000, attackPower: 1, swingInterval: 99,
      immunities: ['fire'],
    });
    const a = hero(20, 'wizard');
    let forceDmg = 0;
    let fireDmg = 0;
    for (let s = 0; s < 100; s++) {
      forceDmg += resolveAttack(a, fireImmune, new SeededRng(s), { autoHit: true, damageType: magicMissile.damageType }).amount;
      fireDmg += resolveAttack(a, fireImmune, new SeededRng(s), { autoHit: true, damageType: fireBolt.damageType ?? a.damageType }).amount;
    }
    expect(forceDmg).toBeGreaterThan(0);
    expect(fireDmg).toBe(0);
  });

  it("a player's typed attack interacts with enemy resistances (MR-7 live for players)", () => {
    const wizard = hero(10, 'wizard'); // fire
    const fireResistant = buildEnemyActor({
      name: 'Salamander', maxHealth: 100000, attackPower: 1, swingInterval: 99,
      resistances: ['fire'],
    });
    const normalFoe = buildEnemyActor({
      name: 'Bandit', maxHealth: 100000, attackPower: 1, swingInterval: 99,
    });
    let resisted = 0;
    let normal = 0;
    for (let s = 0; s < 200; s++) {
      resisted += resolveAttack(wizard, fireResistant, new SeededRng(s), { autoHit: true }).amount;
      normal += resolveAttack(wizard, normalFoe, new SeededRng(s), { autoHit: true }).amount;
    }
    // Resistance ≈ poloviční celkové poškození.
    expect(resisted).toBeLessThan(normal);
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
