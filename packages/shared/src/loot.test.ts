import { describe, expect, it } from 'vitest';
import {
  DUNGEON_LOOT_TABLES,
  RARITY_DROP_WEIGHT,
  ZONE_LOOT_TABLES,
  rollLoot,
  type LootTable,
} from './loot';
import { ITEMS } from './data/items';
import { SeededRng } from './rng';

const ALL_TABLES: [string, LootTable][] = [
  ...Object.entries(ZONE_LOOT_TABLES),
  ...Object.entries(DUNGEON_LOOT_TABLES),
];

/** Loot tabulka s alespoň dvěma různými raritami (pro porovnání drop rate). */
const MIXED_TABLE: LootTable = Object.values(DUNGEON_LOOT_TABLES).find((t) => {
  const rarities = new Set(t.entries.map((e) => ITEMS[e.itemId]!.rarity));
  return rarities.size > 1;
})!;

describe('rarity-driven loot weights (MR-10c)', () => {
  it('rarity weights are monotonically decreasing (common > … > legendary)', () => {
    const { common, uncommon, rare, epic, legendary } = RARITY_DROP_WEIGHT;
    expect(common).toBeGreaterThan(uncommon);
    expect(uncommon).toBeGreaterThan(rare);
    expect(rare).toBeGreaterThan(epic);
    expect(epic).toBeGreaterThan(legendary);
    expect(legendary).toBeGreaterThan(0);
  });

  it('every loot entry weight equals its item rarity weight', () => {
    for (const [id, table] of ALL_TABLES) {
      for (const entry of table.entries) {
        const item = ITEMS[entry.itemId];
        expect(item, `unknown item ${entry.itemId} in ${id}`).toBeDefined();
        expect(entry.dropChance, `${entry.itemId} in ${id}`).toBe(
          RARITY_DROP_WEIGHT[item!.rarity],
        );
      }
    }
  });

  it('a rarer item drops less often than a common one in the same table', () => {
    const table = MIXED_TABLE;
    const rarest = [...table.entries].sort((a, b) => a.dropChance - b.dropChance)[0]!;
    const commoner = [...table.entries].sort((a, b) => b.dropChance - a.dropChance)[0]!;
    expect(rarest.dropChance).toBeLessThan(commoner.dropChance);

    const counts: Record<string, number> = {};
    for (let s = 0; s < 5000; s++) {
      for (const id of rollLoot(table, new SeededRng(s))) counts[id] = (counts[id] ?? 0) + 1;
    }
    expect(counts[rarest.itemId] ?? 0).toBeLessThan(counts[commoner.itemId] ?? 0);
  });

  it('rollLoot is deterministic and only yields items from the table', () => {
    const table = DUNGEON_LOOT_TABLES.deadmines!;
    const ids = new Set(table.entries.map((e) => e.itemId));
    for (let s = 0; s < 50; s++) {
      const a = rollLoot(table, new SeededRng(s));
      const b = rollLoot(table, new SeededRng(s));
      expect(a).toEqual(b);
      for (const id of a) expect(ids.has(id)).toBe(true);
    }
  });

  it('dropChanceMult lowers the chance that anything drops (wipe coupling)', () => {
    const table = DUNGEON_LOOT_TABLES.stratholme!;
    let full = 0;
    let halved = 0;
    for (let s = 0; s < 2000; s++) {
      if (rollLoot(table, new SeededRng(s), 1).length > 0) full++;
      if (rollLoot(table, new SeededRng(s), 0.5).length > 0) halved++;
    }
    expect(halved).toBeLessThan(full);
  });
});
