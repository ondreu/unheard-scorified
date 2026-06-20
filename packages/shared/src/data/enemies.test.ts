import { describe, expect, it } from 'vitest';
import {
  BESTIARY,
  BESTIARY_IDS,
  bestiaryEnemyById,
  buildBestiaryEnemy,
  enemiesByChallengeRating,
  enemiesByCreatureType,
  getEnemyTemplate,
  instantiateEnemy,
} from './enemies';
import { CHALLENGE_RATINGS, CREATURE_TYPES, DAMAGE_TYPES, crStatGuide } from './damage';
import { CONDITION_TYPES } from '../conditions';
import { buildEnemyActor, resolveAttack, type CombatActor } from '../combat';
import { SeededRng } from '../rng';

describe('bestiary integrity', () => {
  it('every template has a unique, key-matching id', () => {
    expect(new Set(BESTIARY_IDS).size).toBe(BESTIARY_IDS.length);
    for (const id of BESTIARY_IDS) expect(BESTIARY[id]!.id).toBe(id);
  });

  it('every template uses valid CR, creature type and damage type', () => {
    for (const t of Object.values(BESTIARY)) {
      expect(CHALLENGE_RATINGS).toContain(t.cr);
      expect(CREATURE_TYPES).toContain(t.creatureType);
      expect(DAMAGE_TYPES).toContain(t.attackType);
      for (const list of [t.resistances, t.vulnerabilities, t.immunities]) {
        for (const dt of list ?? []) expect(DAMAGE_TYPES).toContain(dt);
      }
    }
  });

  it('never lists a damage type as both resistant and immune (redundant)', () => {
    for (const t of Object.values(BESTIARY)) {
      const immune = new Set(t.immunities ?? []);
      for (const r of t.resistances ?? []) expect(immune.has(r)).toBe(false);
    }
  });

  it('every ability uses a valid damage type and a non-trivial multiplier', () => {
    for (const t of Object.values(BESTIARY)) {
      for (const ab of t.abilities ?? []) {
        expect(DAMAGE_TYPES).toContain(ab.damageType);
        expect(ab.damageMult).toBeGreaterThan(1);
        expect(ab.cooldownSec).toBeGreaterThan(0);
      }
    }
  });

  it('condition rider abilities require a save and a valid condition type (Slice 2a)', () => {
    const seen = new Set<string>();
    for (const t of Object.values(BESTIARY)) {
      for (const ab of t.abilities ?? []) {
        if (!ab.condition) continue;
        expect(CONDITION_TYPES).toContain(ab.condition.type);
        expect(ab.condition.durationTurns).toBeGreaterThan(0);
        expect(ab.save).toBeDefined(); // condition se uplatní jen na neúspěšný save
        seen.add(ab.condition.type);
      }
    }
    // Katalog pokrývá všech 5 condition typů (mind_blast/pack_takedown/frost_nova/…).
    expect(seen.size).toBe(CONDITION_TYPES.length);
  });

  it('threads the condition rider into the combat-actor signature ability', () => {
    const enemy = buildBestiaryEnemy(BESTIARY['mind_devourer']!);
    const sig = enemy.signatureAbilities?.find((a) => a.id === 'mind_blast');
    expect(sig?.condition).toEqual({ type: 'stunned', durationTurns: 1 });
  });

  it('indexes by creature type and CR', () => {
    expect(enemiesByCreatureType('undead').length).toBeGreaterThan(0);
    expect(enemiesByChallengeRating(5).every((t) => t.cr === 5)).toBe(true);
    expect(getEnemyTemplate('skeleton_warrior')?.creatureType).toBe('undead');
    expect(getEnemyTemplate('nope')).toBeUndefined();
  });
});

describe('buildBestiaryEnemy', () => {
  it('derives stats from CR guide and carries the damage profile', () => {
    const wraith = buildBestiaryEnemy(BESTIARY['grave_wraith']!);
    const guide = crStatGuide(5);
    expect(wraith.armorClass).toBe(guide.armorClass);
    expect(wraith.attackBonus).toBe(guide.attackBonus);
    expect(wraith.maxHealth).toBe(guide.hitPoints);
    expect(wraith.attackPower).toBe(guide.damagePerRound);
    expect(wraith.damageType).toBe('necrotic');
    expect(wraith.immunities).toContain('necrotic');
    expect(wraith.vulnerabilities).toContain('radiant');
  });

  it('gives bosses +2 AC over the CR guide', () => {
    const dragon = buildBestiaryEnemy(BESTIARY['young_red_dragon']!);
    expect(dragon.isBoss).toBe(true);
    expect(dragon.armorClass).toBe(crStatGuide(10).armorClass + 2);
  });

  it('honours stat overrides', () => {
    const ogre = buildBestiaryEnemy(BESTIARY['hill_ogre']!, { maxHealth: 999, attackPower: 50 });
    expect(ogre.maxHealth).toBe(999);
    expect(ogre.attackPower).toBe(50);
  });

  it('bestiaryEnemyById resolves and returns undefined for unknown id', () => {
    expect(bestiaryEnemyById('fire_elemental')?.name).toBe('Fire Elemental');
    expect(bestiaryEnemyById('ghost_of_christmas')).toBeUndefined();
  });
});

describe('instantiateEnemy — unified enemy resolver (ADR 0043)', () => {
  it('inherits identity (type + defenses) from the template', () => {
    const z = instantiateEnemy('strat_zombie');
    expect(z.id).toBe('strat_zombie');
    expect(z.name).toBe('Plagued Zombie');
    expect(z.damageType).toBe('necrotic');
    expect(z.resistances).toContain('necrotic');
    expect(z.immunities).toContain('poison');
    expect(z.vulnerabilities).toContain('radiant');
  });

  it('applies contextual overrides (id/name/level/armor/isBoss) for variants', () => {
    const ghoul = instantiateEnemy('strat_zombie', {
      id: 'strat_zombie_b',
      name: 'Plagued Ghoul',
      level: 17,
    });
    expect(ghoul.id).toBe('strat_zombie_b');
    expect(ghoul.name).toBe('Plagued Ghoul');
    expect(ghoul.level).toBe(17);
    // Identita (obrany) se dědí i u varianty.
    expect(ghoul.vulnerabilities).toContain('radiant');
  });

  it('preserves level-scaling: no challengeRating baked when only level/swing given', () => {
    // Dungeon model: magnituda plyne z content levelu (group.ts default), ne z
    // template.cr → resolver NEpřebírá template.cr do challengeRating.
    const cultist = instantiateEnemy('rfc_cultist', { swingInterval: 2.6 });
    expect(cultist.challengeRating).toBeUndefined();
    expect(cultist.level).toBeUndefined();
    expect(cultist.maxHealth).toBeUndefined();
    expect(cultist.attackPower).toBeUndefined();
  });

  it('previously-untyped enemies get a physical attack type (rage-resist neutral)', () => {
    const cultist = instantiateEnemy('rfc_cultist');
    expect(['slashing', 'piercing', 'bludgeoning']).toContain(cultist.damageType);
  });

  it('throws on an unknown template id (authoring error, not runtime)', () => {
    expect(() => instantiateEnemy('not_a_real_enemy')).toThrow(/unknown enemy template/);
  });

  it('threads catalog abilities into the combat actor (Enemy schopnosti)', () => {
    // grave_wraith má v katalogu „Life Drain" (necrotic, save) — musí dotéct až
    // do CombatActor.signatureAbilities přes buildEnemyActor.
    const stats = instantiateEnemy('grave_wraith');
    expect(stats.signatureAbilities?.map((a) => a.id)).toContain('life_drain');
    const actor = buildEnemyActor(stats);
    const drain = actor.signatureAbilities.find((a) => a.id === 'life_drain');
    expect(drain).toBeDefined();
    expect(drain!.damageType).toBe('necrotic');
    expect(drain!.damageMult).toBeGreaterThan(1);
    expect(drain!.save?.effect).toBe('half');
  });

  it('enemies without abilities get an empty kit (today\'s content → basic attacks)', () => {
    const actor = buildEnemyActor(instantiateEnemy('rfc_cultist'));
    expect(actor.signatureAbilities).toEqual([]);
  });
});

describe('resistance / vulnerability in dice-roll combat (MR-7)', () => {
  function attacker(damageType: CombatActor['damageType']): CombatActor {
    return {
      name: 'Hero',
      maxHealth: 100,
      attackPower: 28,
      swingInterval: 2.4,
      critChance: 0,
      critMultiplier: 2,
      armor: 0,
      lifesteal: 0,
      shield: 0,
      attackBonus: 8,
      damageType,
      signatureAbilities: [],
    };
  }

  /** Poškození jednoho auto-hit útoku daného typu proti danému cíli (fixní seed). */
  function autoHitDamage(atk: CombatActor, def: CombatActor): number {
    const rng = new SeededRng(424242);
    return resolveAttack(atk, def, rng, { autoHit: true }).amount;
  }

  const baseline = buildEnemyActor({
    name: 'Dummy',
    maxHealth: 200,
    attackPower: 10,
    swingInterval: 2.4,
  });
  const resistant = buildEnemyActor({
    name: 'Fire Resistant',
    maxHealth: 200,
    attackPower: 10,
    swingInterval: 2.4,
    resistances: ['fire'],
  });
  const immune = buildEnemyActor({
    name: 'Fire Immune',
    maxHealth: 200,
    attackPower: 10,
    swingInterval: 2.4,
    immunities: ['fire'],
  });
  const vulnerable = buildEnemyActor({
    name: 'Fire Vulnerable',
    maxHealth: 200,
    attackPower: 10,
    swingInterval: 2.4,
    vulnerabilities: ['fire'],
  });

  it('resistance halves, vulnerability doubles, immunity zeroes — vs the same roll', () => {
    const fire = attacker('fire');
    const normal = autoHitDamage(fire, baseline);
    expect(normal).toBeGreaterThan(1);
    expect(autoHitDamage(fire, resistant)).toBe(Math.floor(normal / 2));
    expect(autoHitDamage(fire, vulnerable)).toBe(normal * 2);
    expect(autoHitDamage(fire, immune)).toBe(0);
  });

  it('only the matching damage type is affected', () => {
    const cold = attacker('cold');
    // Cold útok proti fire-resistantnímu cíli = plné poškození.
    expect(autoHitDamage(cold, resistant)).toBe(autoHitDamage(cold, baseline));
  });

  it('ability damage type override can bypass a physical default', () => {
    const physical = attacker('bludgeoning');
    const rng = new SeededRng(99001);
    const hit = resolveAttack(physical, immune, rng, { autoHit: true, damageType: 'fire' });
    expect(hit.damageInteraction).toBe('immune');
    expect(hit.amount).toBe(0);
  });
});
