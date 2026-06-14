import { describe, expect, it } from 'vitest';
import { availableQuests, isQuestAvailable, QUESTS, QUEST_IDS } from './quests';
import { ZONES } from './zones';

describe('katalog questů — integrita', () => {
  it('id záznamu = id questu', () => {
    for (const id of QUEST_IDS) {
      expect(QUESTS[id]!.id).toBe(id);
    }
  });

  it('každý quest má platnou zónu a kladné hodnoty', () => {
    for (const id of QUEST_IDS) {
      const q = QUESTS[id]!;
      expect(ZONES[q.zoneId]).toBeDefined();
      expect(q.durationSec).toBeGreaterThan(0);
      expect(q.baseXp).toBeGreaterThan(0);
      expect(q.goldVariance).toBeGreaterThanOrEqual(0);
      expect(q.goldVariance).toBeLessThanOrEqual(1);
    }
  });

  it('prerekvizity ukazují na existující questy', () => {
    for (const id of QUEST_IDS) {
      const req = QUESTS[id]!.requiresQuest;
      if (req) expect(QUESTS[req]).toBeDefined();
    }
  });
});

describe('isQuestAvailable', () => {
  it('gate na requiredLevel', () => {
    expect(isQuestAvailable(QUESTS.ns_brotherhood_intel!, 3, [])).toBe(false);
    // má prerekvizitu, takže ani na správném levelu bez ní nepustí
    expect(isQuestAvailable(QUESTS.ns_brotherhood_intel!, 4, [])).toBe(false);
    expect(isQuestAvailable(QUESTS.ns_brotherhood_intel!, 4, ['ns_kobold_culling'])).toBe(true);
  });

  it('story quest po dokončení už není dostupný', () => {
    expect(isQuestAvailable(QUESTS.ns_kobold_culling!, 1, [])).toBe(true);
    expect(isQuestAvailable(QUESTS.ns_kobold_culling!, 1, ['ns_kobold_culling'])).toBe(false);
  });

  it('repeatable je dostupný i opakovaně', () => {
    expect(isQuestAvailable(QUESTS.ns_wolf_pelts!, 1, ['ns_wolf_pelts'])).toBe(true);
  });
});

describe('availableQuests', () => {
  it('lvl 1 bez progresu: jen northshire úvodní questy', () => {
    const ids = availableQuests(1, []).map((q) => q.id);
    expect(ids).toContain('ns_kobold_culling');
    expect(ids).toContain('ns_wolf_pelts');
    expect(ids).not.toContain('ns_brotherhood_intel'); // chybí prerekvizita
    expect(ids).not.toContain('wf_defias_raid'); // moc nízký level
  });

  it('řadí podle requiredLevel vzestupně', () => {
    const levels = availableQuests(40, [
      'ns_kobold_culling',
      'ns_brotherhood_intel',
      'wf_defias_raid',
      'wf_harvest_watchers',
      'dw_nightbane',
    ]).map((q) => q.requiredLevel);
    const sorted = [...levels].sort((a, b) => a - b);
    expect(levels).toEqual(sorted);
  });
});
