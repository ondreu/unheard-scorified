import { describe, expect, it } from 'vitest';
import {
  allBestiaryEntries,
  bestiaryEntry,
  buildBestiaryView,
  dungeonTemplateCounts,
  questTemplateCounts,
} from './bestiary';
import { BESTIARY, BESTIARY_IDS, instantiateEnemy } from './data/enemies';
import { DUNGEONS } from './data/dungeons';
import { QUESTS } from './data/quests';

describe('bestiary', () => {
  it('katalog → entries: jeden záznam per šablona, validní pole', () => {
    const entries = allBestiaryEntries();
    expect(entries.length).toBe(BESTIARY_IDS.length);
    for (const e of entries) {
      expect(e.name.length).toBeGreaterThan(0);
      expect(e.crLabel.length).toBeGreaterThan(0);
      expect(e.xp).toBeGreaterThanOrEqual(0);
      expect(e.creatureTypeLabel.length).toBeGreaterThan(0);
    }
    // seřazeno vzestupně dle CR
    for (let i = 1; i < entries.length; i++) {
      expect(entries[i]!.cr).toBeGreaterThanOrEqual(entries[i - 1]!.cr);
    }
  });

  it('bestiaryEntry přenese obrany a abilities ze šablony', () => {
    const dragon = bestiaryEntry(BESTIARY['young_red_dragon']!);
    expect(dragon.immunities).toContain('fire');
    expect(dragon.creatureType).toBe('dragon');
  });

  it('instantiateEnemy nese templateId pro spárování s katalogem', () => {
    const inst = instantiateEnemy('skeleton_warrior', { id: 'skel_b', name: 'Bone Thrall' });
    expect(inst.id).toBe('skel_b');
    expect(inst.templateId).toBe('skeleton_warrior');
  });

  it('dungeonTemplateCounts vrací jen katalogová id s kladnými počty', () => {
    const dungeonId = Object.keys(DUNGEONS)[0]!;
    const counts = dungeonTemplateCounts(dungeonId);
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(0);
    for (const [id, n] of Object.entries(counts)) {
      expect(id in BESTIARY).toBe(true);
      expect(n).toBeGreaterThan(0);
    }
  });

  it('questTemplateCounts ignoruje neznámé/generické foe', () => {
    // libovolný quest — nesmí spadnout a nesmí vrátit ne-katalogová id
    for (const id of Object.keys(QUESTS)) {
      const counts = questTemplateCounts(id);
      for (const tid of Object.keys(counts)) expect(tid in BESTIARY).toBe(true);
    }
    expect(questTemplateCounts('does_not_exist')).toEqual({});
  });

  it('buildBestiaryView: neobjevené = kills 0, počítadla sedí', () => {
    const firstId = BESTIARY_IDS[0]!;
    const view = buildBestiaryView({ [firstId]: { discovered: true, kills: 3 } });
    expect(view.totalCount).toBe(BESTIARY_IDS.length);
    expect(view.discoveredCount).toBe(1);
    expect(view.totalKills).toBe(3);
    const undiscovered = view.entries.find((e) => e.templateId !== firstId)!;
    expect(undiscovered.discovered).toBe(false);
    expect(undiscovered.kills).toBe(0);
  });
});
