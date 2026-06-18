import { describe, expect, it } from 'vitest';
import { availableQuests, isQuestAvailable, QUESTS, QUEST_IDS, type QuestDef } from './quests';
import { ZONES, ZONE_IDS } from './zones';
import { ZONE_TO_BRACKET, ZONE_LOOT_TABLES } from '../loot';
import { questHasNarrative } from '../quest-run';

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

  it('repeatable je dostupný i opakovaně (engine, dormantní data)', () => {
    // Repeatable questy nahradil generický grind (žádná repeatable data), ale
    // logika `isQuestAvailable` pro `kind: 'repeatable'` zůstává — ověř syntetickým.
    const rep: QuestDef = {
      id: 'rep_synthetic',
      name: 'Synthetic Repeatable',
      description: 'x',
      zoneId: 'northshire',
      kind: 'repeatable',
      requiredLevel: 1,
      durationSec: 300,
      baseXp: 10,
      baseGold: 1,
      goldVariance: 0,
    };
    expect(isQuestAvailable(rep, 1, ['rep_synthetic'])).toBe(true);
  });

  it('frakce odstraněny — questy z obou dřívějších sad jsou dostupné', () => {
    // Po deWoWčení vidí každá postava všechny questline (gating jen levelem/prereqy).
    expect(isQuestAvailable(QUESTS.ns_kobold_culling!, 1, [])).toBe(true);
    expect(isQuestAvailable(QUESTS.dt_scorpid_sting!, 1, [])).toBe(true);
  });
});

describe('availableQuests', () => {
  it('lvl 1: obě úvodní story questy z dřívějších frakcí, žádné gated', () => {
    const ids = availableQuests(1, []).map((q) => q.id);
    expect(ids).toContain('ns_kobold_culling');
    expect(ids).toContain('dt_scorpid_sting'); // dříve horde, teď taky dostupné
    expect(ids).not.toContain('ns_brotherhood_intel'); // chybí prerekvizita
    expect(ids).not.toContain('wf_defias_raid'); // moc nízký level
  });

  it('na lvl 60 jsou dostupné zóny z celého neutrálního tracku', () => {
    const zones = new Set(availableQuests(60, []).map((q) => q.zoneId));
    for (const z of zones) expect(ZONE_IDS).toContain(z);
    // viditelné questy z obou dřívějších paralelních sad (např. northshire i durotar bracket)
    expect(zones.has('northshire')).toBe(true);
    expect(zones.has('durotar')).toBe(true);
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

describe('M12 — 40–60 frontier zóny (Eastern Plaguelands / Felwood)', () => {
  it('každá zóna má přiřazený loot bracket (a ten existuje)', () => {
    for (const z of ZONE_IDS) {
      const bracket = ZONE_TO_BRACKET[z];
      expect(bracket, `zóna ${z} nemá loot bracket`).toBeDefined();
      expect(ZONE_LOOT_TABLES[bracket!], `bracket ${bracket} chybí v ZONE_LOOT_TABLES`).toBeDefined();
    }
  });

  it('nové story questy mají vícekrokový narativ (steps)', () => {
    const storyIds = [
      'epl_argent_dawn', 'epl_scarlet_crusade', 'epl_scourge_necropolis',
      'fw_cenarion_aid', 'fw_shadow_council', 'fw_deadwind_ritual',
    ];
    for (const id of storyIds) {
      const q = QUESTS[id]!;
      expect(q, `quest ${id} chybí`).toBeDefined();
      expect(questHasNarrative(q), `quest ${id} nemá narativ`).toBe(true);
      expect(q.steps!.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('frontier story chain je gated předchozí zónou a levelem 40', () => {
    // Bez dokončené předchozí zóny ani na správném levelu nepustí.
    expect(isQuestAvailable(QUESTS.epl_argent_dawn!, 40, [])).toBe(false);
    expect(isQuestAvailable(QUESTS.epl_argent_dawn!, 40, ['dw_shadow_of_tyrol'])).toBe(true);
    expect(isQuestAvailable(QUESTS.fw_cenarion_aid!, 40, ['tn_highperch_aerie'])).toBe(true);
  });

  it('frontier zóny jsou paralelní (stejné levely/odměny — sdílený track)', () => {
    const pairs: [string, string][] = [
      ['epl_argent_dawn', 'fw_cenarion_aid'],
      ['epl_scarlet_crusade', 'fw_shadow_council'],
      ['epl_scourge_necropolis', 'fw_deadwind_ritual'],
    ];
    for (const [a, b] of pairs) {
      const qa = QUESTS[a]!;
      const qb = QUESTS[b]!;
      expect(qa.requiredLevel).toBe(qb.requiredLevel);
      expect(qa.durationSec).toBe(qb.durationSec);
      expect(qa.baseXp).toBe(qb.baseXp);
      expect(qa.baseGold).toBe(qb.baseGold);
    }
  });
});
