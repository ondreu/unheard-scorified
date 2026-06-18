import { describe, expect, it } from 'vitest';
import { DUNGEONS } from './dungeons';
import { buildEnemyActor, deriveCombatProfile, resolveAttack, type CombatActor } from '../combat';
import { baseStatsFor } from '../character';
import { EMPTY_PROGRESSION } from '../levelup';
import { SeededRng } from '../rng';
import { type ClassId } from './classes';

function hero(klass: ClassId, level = 20): CombatActor {
  return deriveCombatProfile({
    name: 'Hero',
    level,
    klass,
    primary: baseStatsFor('human', klass, level),
    equipment: {},
    progression: EMPTY_PROGRESSION,
  });
}

/** Součet poškození útoku přes mnoho seedů (autoHit → izoluje typovou interakci). */
function totalDamage(attacker: CombatActor, defender: CombatActor): number {
  let sum = 0;
  for (let s = 0; s < 300; s++) {
    sum += resolveAttack(attacker, defender, new SeededRng(s), { autoHit: true }).amount;
  }
  return sum;
}

describe('MR-10d — typed late-game content', () => {
  it('Pyrehold (Stratholme) undead are vulnerable to radiant — holy classes shine', () => {
    const baron = buildEnemyActor(DUNGEONS.stratholme!.encounters.at(-1)!);
    expect(baron.vulnerabilities).toContain('radiant');
    const cleric = hero('cleric'); // radiant
    const rogue = hero('rogue'); // piercing
    const radiantDmg = totalDamage(cleric, baron);
    const physicalDmg = totalDamage(rogue, baron);
    // Radiant je vůči undead vulnerable (×2), piercing normální → cleric bije tvrději.
    expect(radiantDmg).toBeGreaterThan(physicalDmg);
  });

  it('Maradoth (Maraudon) treant resists physical but is vulnerable to fire', () => {
    const treant = DUNGEONS.maraudon!.encounters.find((e) => e.id === 'mar_treant')!;
    expect(treant.resistances).toEqual(expect.arrayContaining(['bludgeoning', 'piercing']));
    expect(treant.vulnerabilities).toContain('fire');
    const actor = buildEnemyActor(treant);
    const wizard = hero('wizard'); // fire → vulnerable
    const fighter = hero('fighter'); // slashing → normal
    expect(totalDamage(wizard, actor)).toBeGreaterThan(totalDamage(fighter, actor));
  });

  it('Cinderdeep (Blackrock) fire dwellers resist fire — fire casters do less', () => {
    const emperor = buildEnemyActor(DUNGEONS.blackrock_depths!.encounters.at(-1)!);
    expect(emperor.resistances).toContain('fire');
    const wizard = hero('wizard'); // fire → resisted
    const fighter = hero('fighter'); // slashing → normal
    expect(totalDamage(wizard, emperor)).toBeLessThan(totalDamage(fighter, emperor));
  });

  it('every late-game (14+) dungeon has at least one typed enemy', () => {
    for (const id of ['zulfarrak', 'maraudon', 'blackrock_depths', 'stratholme']) {
      const typed = DUNGEONS[id]!.encounters.some(
        (e) => e.damageType || e.resistances || e.vulnerabilities || e.immunities,
      );
      expect(typed, `dungeon ${id} has no typed enemy`).toBe(true);
    }
  });
});
