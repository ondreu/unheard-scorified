import { describe, expect, it } from 'vitest';
import { DUNGEONS, dungeonBoss, dungeonEnemies } from './dungeons';
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

describe('Enemy schopnosti — boss abilities (Slice 2c)', () => {
  it('every dungeon boss has a signature ability with a typed strike + condition rider', () => {
    for (const dungeon of Object.values(DUNGEONS)) {
      const boss = dungeonBoss(dungeon);
      expect(boss, `${dungeon.id} has a boss`).toBeDefined();
      const abilities = boss!.signatureAbilities ?? [];
      expect(abilities.length, `${boss!.name} has ≥1 ability`).toBeGreaterThan(0);
      // Aspoň jedna ability nese condition rider (Enemy schopnosti živé v obsahu).
      expect(abilities.some((a) => a.condition != null), `${boss!.name} applies a condition`).toBe(true);
      for (const a of abilities) {
        if (!a.condition) continue;
        expect(a.save, `${a.name} has a save`).toBeDefined();
        expect(a.condition.durationTurns).toBeGreaterThan(0);
      }
    }
  });

  it('boss abilities survive into the combat actor (buildEnemyActor)', () => {
    const baron = buildEnemyActor(dungeonBoss(DUNGEONS.stratholme!)!);
    expect(baron.signatureAbilities.some((a) => a.condition?.type === 'frightened')).toBe(true);
  });
});

describe('Enemy schopnosti — trash abilities (Slice 2d, živá aktivace)', () => {
  /** Živý (ne-boss) dungeon trash napříč všemi dungeony. */
  const trash = Object.values(DUNGEONS).flatMap((d) =>
    dungeonEnemies(d).filter((e) => !e.isBoss),
  );

  it('several live trash enemies carry a typed ability with a condition rider', () => {
    const withCondition = trash.filter((e) =>
      (e.signatureAbilities ?? []).some((a) => a.condition != null),
    );
    // Kurátorská sada (≥1 notable trash per dungeon) → conditiony žijí i mimo bosse.
    expect(withCondition.length).toBeGreaterThanOrEqual(8);
    // Každý condition rider trash ability má i save (jako u bossů — neúspěch = condition).
    for (const e of trash) {
      for (const a of e.signatureAbilities ?? []) {
        if (!a.condition) continue;
        expect(a.save, `${e.name}/${a.name} has a save`).toBeDefined();
        expect(a.condition.durationTurns).toBeGreaterThan(0);
      }
    }
  });

  it('trash conditions cover the full variety of condition types', () => {
    const types = new Set(
      trash.flatMap((e) => (e.signatureAbilities ?? []).map((a) => a.condition?.type)).filter(Boolean),
    );
    // Trash pokrývají všech 8 condition typů (stunned/prone/restrained/frightened/
    // slowed/poisoned/charmed/blinded) — ne jen bosse.
    for (const t of [
      'stunned',
      'prone',
      'restrained',
      'frightened',
      'slowed',
      'poisoned',
      'charmed',
      'blinded',
    ] as const) {
      expect(types.has(t), `some trash applies ${t}`).toBe(true);
    }
  });

  it('trash abilities survive into the combat actor (buildEnemyActor)', () => {
    const monk = dungeonEnemies(DUNGEONS.scarlet_monastery!).find((e) => e.id === 'sm_monk')!;
    const actor = buildEnemyActor(monk);
    expect(actor.signatureAbilities.some((a) => a.condition?.type === 'stunned')).toBe(true);
  });
});

describe('MR-10d — typed late-game content', () => {
  it('Pyrehold (Stratholme) undead are vulnerable to radiant — holy classes shine', () => {
    const baron = buildEnemyActor(dungeonBoss(DUNGEONS.stratholme!)!);
    expect(baron.vulnerabilities).toContain('radiant');
    const cleric = hero('cleric'); // radiant
    const rogue = hero('rogue'); // piercing
    const radiantDmg = totalDamage(cleric, baron);
    const physicalDmg = totalDamage(rogue, baron);
    // Radiant je vůči undead vulnerable (×2), piercing normální → cleric bije tvrději.
    expect(radiantDmg).toBeGreaterThan(physicalDmg);
  });

  it('Maradoth (Maraudon) treant resists physical but is vulnerable to fire', () => {
    const treant = dungeonEnemies(DUNGEONS.maraudon!).find((e) => e.id === 'mar_treant')!;
    expect(treant.resistances).toEqual(expect.arrayContaining(['bludgeoning', 'piercing']));
    expect(treant.vulnerabilities).toContain('fire');
    const actor = buildEnemyActor(treant);
    const wizard = hero('wizard'); // fire → vulnerable
    const fighter = hero('fighter'); // slashing → normal
    expect(totalDamage(wizard, actor)).toBeGreaterThan(totalDamage(fighter, actor));
  });

  it('Cinderdeep (Blackrock) fire dwellers resist fire — fire casters do less', () => {
    const emperor = buildEnemyActor(dungeonBoss(DUNGEONS.blackrock_depths!)!);
    expect(emperor.resistances).toContain('fire');
    const wizard = hero('wizard'); // fire → resisted
    const fighter = hero('fighter'); // slashing → normal
    expect(totalDamage(wizard, emperor)).toBeLessThan(totalDamage(fighter, emperor));
  });

  it('every dungeon ends on a boss encounter (dungeonBoss resolves a boss)', () => {
    for (const d of Object.values(DUNGEONS)) {
      const boss = dungeonBoss(d);
      expect(boss, `${d.id} has no boss`).toBeDefined();
      expect(boss!.isBoss, `${d.id} last encounter is not a boss`).toBe(true);
      // Boss žije v posledním encounteru.
      expect(d.encounters.at(-1)!.enemies).toContain(boss);
    }
  });

  it('dungeon overhaul (ADR 0037): multi-enemy packy s oslabenými miniony', () => {
    // Aspoň jeden dungeon má encounter s víc nepřáteli (pack).
    const hasPack = Object.values(DUNGEONS).some((d) =>
      d.encounters.some((e) => e.enemies.length > 1),
    );
    expect(hasPack).toBe(true);
    // Trash minioni v packu mají nižší efektivní level než requiredLevel (slabší CR).
    for (const d of Object.values(DUNGEONS)) {
      for (const enc of d.encounters) {
        if (enc.enemies.length < 2) continue;
        const minions = enc.enemies.filter((e) => !e.isBoss && e.level !== undefined);
        for (const m of minions) {
          expect(m.level!, `${d.id}/${m.id} minion not weakened`).toBeLessThan(d.requiredLevel);
        }
      }
    }
  });

  it('every late-game (14+) dungeon has at least one typed enemy', () => {
    for (const id of ['zulfarrak', 'maraudon', 'blackrock_depths', 'stratholme']) {
      const typed = dungeonEnemies(DUNGEONS[id]!).some(
        (e) => e.damageType || e.resistances || e.vulnerabilities || e.immunities,
      );
      expect(typed, `dungeon ${id} has no typed enemy`).toBe(true);
    }
  });
});
