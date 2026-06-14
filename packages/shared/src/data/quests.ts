/**
 * Katalog questů (idle aktivity typu 'quest'). Statická herní data —
 * jediný zdroj pravdy pro API i web. Balanc (doba trvání, odměny) se ladí ZDE.
 *
 * - `story`   = jednorázové questy tvořící lineární questline (chain přes
 *               `requiresQuest`); po dokončení už nejsou dostupné.
 * - `repeatable` = filler aktivity, lze opakovat libovolně (gated jen levelem/zónou).
 *
 * Odměny: XP je fixní (předvídatelný leveling), zlato má deterministickou
 * varianci přes SeededRng (viz `activity.ts` → `computeQuestReward`).
 */
import type { ZoneId } from './zones';

export type QuestKind = 'story' | 'repeatable';

export interface QuestDef {
  id: string;
  /** Anglický herní název (game language = EN). */
  name: string;
  /** Flavor popis (anglicky). */
  description: string;
  zoneId: ZoneId;
  kind: QuestKind;
  /** Minimální level postavy pro přijetí questu. */
  requiredLevel: number;
  /** Story chain: id questu, který musí být dokončen jako první. */
  requiresQuest?: string;
  /** Doba trvání idle běhu v sekundách (laditelný balanc parametr). */
  durationSec: number;
  /** Základní XP odměna (fixní). */
  baseXp: number;
  /** Základní zlato (medění/„copper" jednotky); rolluje se s variancí. */
  baseGold: number;
  /** Frakce variance zlata (0..1), aplikovaná přes SeededRng. */
  goldVariance: number;
}

export const QUESTS: Record<string, QuestDef> = {
  // ── Northshire Valley (1–10) ─────────────────────────────────────────────
  ns_kobold_culling: {
    id: 'ns_kobold_culling',
    name: 'A Threat Within',
    description: 'Cull the kobolds infesting the Echo Ridge Mine.',
    zoneId: 'northshire',
    kind: 'story',
    requiredLevel: 1,
    durationSec: 60,
    baseXp: 60,
    baseGold: 5,
    goldVariance: 0.3,
  },
  ns_brotherhood_intel: {
    id: 'ns_brotherhood_intel',
    name: 'Whispers of the Brotherhood',
    description: 'Gather intelligence on the Defias agents lurking near the abbey.',
    zoneId: 'northshire',
    kind: 'story',
    requiredLevel: 4,
    requiresQuest: 'ns_kobold_culling',
    durationSec: 300,
    baseXp: 180,
    baseGold: 12,
    goldVariance: 0.3,
  },
  ns_wolf_pelts: {
    id: 'ns_wolf_pelts',
    name: 'Wolves Across the Border',
    description: 'Hunt the timber wolves and bring back their pelts.',
    zoneId: 'northshire',
    kind: 'repeatable',
    requiredLevel: 1,
    durationSec: 180,
    baseXp: 45,
    baseGold: 4,
    goldVariance: 0.4,
  },

  // ── Westfall (10–25) ─────────────────────────────────────────────────────
  wf_defias_raid: {
    id: 'wf_defias_raid',
    name: 'The Defias Raids',
    description: 'Strike back at the Defias bandits raiding the Westfall farmsteads.',
    zoneId: 'westfall',
    kind: 'story',
    requiredLevel: 10,
    requiresQuest: 'ns_brotherhood_intel',
    durationSec: 900,
    baseXp: 600,
    baseGold: 30,
    goldVariance: 0.25,
  },
  wf_harvest_watchers: {
    id: 'wf_harvest_watchers',
    name: 'The Harvest Golems',
    description: 'Dismantle the rogue harvest watchers stalking the fields.',
    zoneId: 'westfall',
    kind: 'story',
    requiredLevel: 16,
    requiresQuest: 'wf_defias_raid',
    durationSec: 1800,
    baseXp: 1100,
    baseGold: 55,
    goldVariance: 0.25,
  },
  wf_murloc_scales: {
    id: 'wf_murloc_scales',
    name: 'Murlocs on the Coast',
    description: 'Clear the murloc camps along the Longshore.',
    zoneId: 'westfall',
    kind: 'repeatable',
    requiredLevel: 12,
    durationSec: 600,
    baseXp: 350,
    baseGold: 20,
    goldVariance: 0.35,
  },

  // ── Duskwood (25–40) ─────────────────────────────────────────────────────
  dw_nightbane: {
    id: 'dw_nightbane',
    name: 'The Nightbane Worgen',
    description: 'Drive back the Nightbane worgen prowling the darkened roads.',
    zoneId: 'duskwood',
    kind: 'story',
    requiredLevel: 25,
    requiresQuest: 'wf_harvest_watchers',
    durationSec: 2700,
    baseXp: 3000,
    baseGold: 120,
    goldVariance: 0.2,
  },
  dw_morbent_fel: {
    id: 'dw_morbent_fel',
    name: 'Embalmer of the Damned',
    description: 'End the necromancer Morbent Fel and lay the restless dead to rest.',
    zoneId: 'duskwood',
    kind: 'story',
    requiredLevel: 32,
    requiresQuest: 'dw_nightbane',
    durationSec: 3600,
    baseXp: 5200,
    baseGold: 200,
    goldVariance: 0.2,
  },
  dw_grave_moss: {
    id: 'dw_grave_moss',
    name: 'Grave Moss for the Apothecary',
    description: 'Collect grave moss from the Raven Hill cemetery.',
    zoneId: 'duskwood',
    kind: 'repeatable',
    requiredLevel: 27,
    durationSec: 1200,
    baseXp: 2200,
    baseGold: 90,
    goldVariance: 0.3,
  },
};

export const QUEST_IDS = Object.keys(QUESTS);

export function isQuestId(value: string): value is string {
  return value in QUESTS;
}

/**
 * Je quest dostupný pro daný level a sadu dokončených story questů?
 *  - level >= requiredLevel
 *  - story prerekvizita (pokud je) je dokončená
 *  - story quest už není dokončený (jednorázový); repeatable je vždy dostupný
 */
export function isQuestAvailable(
  quest: QuestDef,
  level: number,
  completedQuestIds: ReadonlySet<string> | readonly string[],
): boolean {
  const completed =
    completedQuestIds instanceof Set ? completedQuestIds : new Set(completedQuestIds);
  if (level < quest.requiredLevel) return false;
  if (quest.requiresQuest && !completed.has(quest.requiresQuest)) return false;
  if (quest.kind === 'story' && completed.has(quest.id)) return false;
  return true;
}

/** Seznam dostupných questů (seřazený podle zóny → requiredLevel). */
export function availableQuests(
  level: number,
  completedQuestIds: ReadonlySet<string> | readonly string[],
): QuestDef[] {
  const completed =
    completedQuestIds instanceof Set ? completedQuestIds : new Set(completedQuestIds);
  return QUEST_IDS.map((id) => QUESTS[id]!)
    .filter((q) => isQuestAvailable(q, level, completed))
    .sort((a, b) => a.requiredLevel - b.requiredLevel);
}
