import { describe, expect, it } from 'vitest';
import { DUNGEONS } from './dungeons';
import { RAIDS, buildRaidBoss } from './raids';
import { buildEnemyActor, deriveCombatProfile, resolveAttack, resolveAbilities, type CombatActor } from '../combat';
import { baseStatsFor } from '../character';
import { EMPTY_PROGRESSION } from '../levelup';
import { SeededRng } from '../rng';
import { CLASSES, type ClassId } from './classes';

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

  it('Cinderforge raid (Molten Core) Flamelord is fire-immune, but casters stay viable via per-ability types', () => {
    const ignaroth = buildRaidBoss(RAIDS.molten_core!.bosses.at(-1)!, 14);
    expect(ignaroth.immunities).toContain('fire');
    // Per-ability typy (MR-10d): každá caster classa má aspoň 1 ofenzivní ability,
    // jejíž typ se LIŠÍ od typu classy → fire-immune boss je nezneškodní úplně.
    for (const klass of ['wizard', 'sorcerer', 'druid'] as ClassId[]) {
      const classType = CLASSES[klass].attackDamageType;
      const offTypeAbility = resolveAbilities(klass, null, 20).some(
        (a) => (a.kind === 'strike' || a.kind === 'dot' || a.kind === 'drain') &&
          a.damageType != null && a.damageType !== classType,
      );
      expect(offTypeAbility, `${klass} has no off-element ability`).toBe(true);
    }
  });

  it('every late-game raid boss carries a damage type', () => {
    for (const id of ['molten_core', 'zulgurub', 'blackwing_lair', 'ahnqiraj']) {
      for (const b of RAIDS[id]!.bosses) {
        expect(b.damageType, `raid ${id} boss ${b.id} has no damageType`).toBeDefined();
      }
    }
  });
});
