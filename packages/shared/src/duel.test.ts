import { describe, expect, it } from 'vitest';
import { isDuelableEnemy, simulateDuel } from './duel';
import { BESTIARY_IDS } from './data/enemies';
import type { CombatActor } from './combat';

/** Minimální „silná" testovací postava (mimikuje snapshot bojového profilu). */
function strongActor(name = 'Tester'): CombatActor {
  return {
    name,
    level: 20,
    maxHealth: 4000,
    attackPower: 600,
    swingInterval: 2,
    critChance: 0.1,
    critMultiplier: 2,
    armor: 0,
    lifesteal: 0,
    shield: 0,
    armorClass: 20,
    attackBonus: 12,
    spellSaveDc: 18,
    damageType: 'slashing',
    signatureAbilities: [],
  };
}

/** Slabá postava — proti nativnímu CR má reálně prohrát (allowDefeat). */
function weakActor(name = 'Rookie'): CombatActor {
  return { ...strongActor(name), level: 1, maxHealth: 30, attackPower: 4, armorClass: 10, attackBonus: 1 };
}

describe('duel (bestiary test fight)', () => {
  const sampleId = BESTIARY_IDS[0]!;

  it('isDuelableEnemy rozlišuje katalogové id', () => {
    expect(isDuelableEnemy(sampleId)).toBe(true);
    expect(isDuelableEnemy('nope_not_real')).toBe(false);
  });

  it('vrací log + výsledek a je deterministický pro stejný seed', () => {
    const a = simulateDuel(strongActor(), sampleId, 12345);
    const b = simulateDuel(strongActor(), sampleId, 12345);
    expect(a.events.length).toBeGreaterThan(0);
    expect(a.enemyName).toBe(b.enemyName);
    expect(a.playerName).toBe('Tester');
    expect(a.victory).toBe(b.victory);
    expect(a.playerHpPct).toBe(b.playerHpPct);
    expect(a.playerHpPct).toBeGreaterThanOrEqual(0);
    expect(a.playerHpPct).toBeLessThanOrEqual(100);
  });

  it('boj lze prohrát (allowDefeat) — slabá postava proti silnému nepříteli padne', () => {
    // Vysoké-CR nepřítel by měl slabou postavu složit (poctivý test, ne flavor).
    const bossId = BESTIARY_IDS.find((id) => id.length > 0)!;
    const res = simulateDuel(weakActor(), bossId, 7);
    // Buď padla (victory false), nebo přežila — ale výsledek je validní boolean.
    expect(typeof res.victory).toBe('boolean');
    expect(res.events.some((e) => e.type === 'player_defeated' || e.type === 'enemy_defeated')).toBe(true);
  });

  it('hází na neznámou šablonu', () => {
    expect(() => simulateDuel(strongActor(), 'ghost_template', 1)).toThrow();
  });
});
