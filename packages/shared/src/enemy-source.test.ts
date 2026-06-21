/**
 * Single-source-of-truth guard (roadmap „Bestiář = jediný zdroj nepřátel"):
 * ověřuje, že **všichni** nepřátelé z katalogem-řízených systémů (dungeon +
 * Gauntlet) jdou přes `instantiateEnemy`/`BESTIARY` a žádný inline enemy mimo
 * katalog nezbyl. Quest foes jsou **záměrně** narativní (template je optional);
 * ty, které template mají, ale nesmí odkazovat na neexistující šablonu.
 *
 * Regrese: nový dungeon/gauntlet pool/quest s nekatalogovým nepřítelem tu spadne.
 */
import { describe, expect, it } from 'vitest';
import { DUNGEONS, dungeonEnemies } from './data/dungeons';
import { BESTIARY } from './data/enemies';
import { QUESTS } from './data/quests';
import { buildGauntletEnemy } from './gauntlet';
import { SeededRng } from './rng';

describe('enemy single source — dungeons', () => {
  it('every dungeon encounter enemy is instantiated from a BESTIARY template', () => {
    for (const dungeon of Object.values(DUNGEONS)) {
      for (const enemy of dungeonEnemies(dungeon)) {
        expect(enemy.templateId, `${dungeon.id}: ${enemy.name}`).toBeDefined();
        expect(enemy.templateId! in BESTIARY, `${dungeon.id}: ${enemy.name} (${enemy.templateId})`).toBe(true);
      }
    }
  });
});

describe('enemy single source — Gauntlet', () => {
  it('every drawn Gauntlet enemy (normal + elite) carries a valid catalog templateId', () => {
    // Pokrytí normálních i elite vln napříč úrovněmi/seedy.
    for (let level = 1; level <= 20; level += 3) {
      for (let wave = 1; wave <= 12; wave++) {
        for (let seed = 0; seed < 8; seed++) {
          const enemy = buildGauntletEnemy(level, wave, new SeededRng(seed));
          expect(enemy.templateId, `L${level} W${wave} S${seed}`).toBeDefined();
          expect(enemy.templateId! in BESTIARY, `${enemy.name} (${enemy.templateId})`).toBe(true);
          expect(enemy.name).toBe(BESTIARY[enemy.templateId!]!.name);
        }
      }
    }
  });
});

describe('enemy single source — quests', () => {
  it('quest foes with a template reference an existing catalog entry (no dangling)', () => {
    for (const quest of Object.values(QUESTS)) {
      const foes = [
        ...(quest.steps ?? []).filter((s) => s.kind === 'combat').map((s) => s.foe),
        ...(quest.events ?? []).map((e) => e.foe),
      ];
      for (const foe of foes) {
        if (foe?.template) {
          expect(foe.template in BESTIARY, `${quest.id}: ${foe.name} (${foe.template})`).toBe(true);
        }
      }
    }
  });
});
