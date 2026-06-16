/**
 * Katalog questů (idle aktivity typu 'quest'). Statická herní data —
 * jediný zdroj pravdy pro API i web. Balanc (doba trvání, odměny) se ladí ZDE.
 *
 * - `story`   = jednorázové questy tvořící lineární questline (chain přes
 *               `requiresQuest`); po dokončení už nejsou dostupné.
 * - `repeatable` = filler aktivity, lze opakovat libovolně (gated jen levelem/zónou).
 *
 * Frakce questu se ODVOZUJE z jeho zóny (`ZONES[zoneId].faction`) — žádná
 * duplicita. Aliance a horda mají paralelní questline se stejnými level reqy,
 * dobami i odměnami (frakce kosmetická, viz ADR 0003).
 *
 * Balanc (M9 pass): `durationSec` ∈ [5 min, 3 h] (idle cadence) a `baseXp`/
 * `baseGold` jsou kalibrované jako odměna při efektivitě 1.0 =
 * `referenceXpPerHour(requiredLevel) × durationHours` (resp. gold rate). Skutečná
 * odměna se násobí `activityEfficiency(durationSec)` (mírný punish za dlouhý běh)
 * a zlato navíc variancí přes SeededRng. Viz `activity.ts → computeQuestReward`
 * a `docs/systems/progression.md`.
 */
import type { Faction } from './races';
import { ZONES, type ZoneId } from './zones';

export type QuestKind = 'story' | 'repeatable';

export interface QuestDef {
  id: string;
  /** Anglický herní název (game language = EN). */
  name: string;
  /** Flavor popis (anglicky). */
  description: string;
  zoneId: ZoneId;
  kind: QuestKind;
  /** Minimální level postavy pro přijetí questu (= referenční level pro odměnu). */
  requiredLevel: number;
  /** Story chain: id questu, který musí být dokončen jako první. */
  requiresQuest?: string;
  /** Doba trvání idle běhu v sekundách (laditelný balanc parametr, 5 min–3 h). */
  durationSec: number;
  /** Základní XP odměna při efektivitě 1.0 (násobí se `activityEfficiency`). */
  baseXp: number;
  /** Základní zlato při efektivitě 1.0; rolluje se s variancí a efektivitou. */
  baseGold: number;
  /** Frakce variance zlata (0..1), aplikovaná přes SeededRng. */
  goldVariance: number;
}

export const QUESTS: Record<string, QuestDef> = {
  // ╔══ ALLIANCE ════════════════════════════════════════════════════════════╗
  // ── Northshire Valley (1–10) ─────────────────────────────────────────────
  ns_kobold_culling: {
    id: 'ns_kobold_culling',
    name: 'A Threat Within',
    description: 'Cull the kobolds infesting the Echo Ridge Mine.',
    zoneId: 'northshire',
    kind: 'story',
    requiredLevel: 1,
    durationSec: 600,
    baseXp: 100,
    baseGold: 7,
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
    durationSec: 1200,
    baseXp: 400,
    baseGold: 27,
    goldVariance: 0.3,
  },
  ns_wolf_pelts: {
    id: 'ns_wolf_pelts',
    name: 'Wolves Across the Border',
    description: 'Hunt the timber wolves and bring back their pelts.',
    zoneId: 'northshire',
    kind: 'repeatable',
    requiredLevel: 1,
    durationSec: 300,
    baseXp: 50,
    baseGold: 3,
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
    durationSec: 1800,
    baseXp: 949,
    baseGold: 63,
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
    durationSec: 3600,
    baseXp: 2400,
    baseGold: 160,
    goldVariance: 0.25,
  },
  wf_murloc_scales: {
    id: 'wf_murloc_scales',
    name: 'Murlocs on the Coast',
    description: 'Clear the murloc camps along the Longshore.',
    zoneId: 'westfall',
    kind: 'repeatable',
    requiredLevel: 12,
    durationSec: 900,
    baseXp: 520,
    baseGold: 35,
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
    durationSec: 5400,
    baseXp: 4500,
    baseGold: 300,
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
    durationSec: 7200,
    baseXp: 6788,
    baseGold: 453,
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
    baseXp: 1039,
    baseGold: 69,
    goldVariance: 0.3,
  },

  // ── Raid attunement (Alliance, M8) — gate to Blackwing Lair ──────────────
  al_drakefire_attunement: {
    id: 'al_drakefire_attunement',
    name: 'The Drakefire Amulet',
    description: 'Forge the Drakefire Amulet to breach the wards of Blackwing Lair.',
    zoneId: 'duskwood',
    kind: 'story',
    requiredLevel: 50,
    requiresQuest: 'dw_morbent_fel',
    durationSec: 10800,
    baseXp: 12728,
    baseGold: 849,
    goldVariance: 0.2,
  },

  // ╔══ HORDE ═══════════════════════════════════════════════════════════════╗
  // ── Durotar (1–10) ───────────────────────────────────────────────────────
  dt_scorpid_sting: {
    id: 'dt_scorpid_sting',
    name: 'Cutting Teeth',
    description: 'Prove yourself by slaying the scorpids prowling the Valley of Trials.',
    zoneId: 'durotar',
    kind: 'story',
    requiredLevel: 1,
    durationSec: 600,
    baseXp: 100,
    baseGold: 7,
    goldVariance: 0.3,
  },
  dt_burning_blade: {
    id: 'dt_burning_blade',
    name: 'Shadows of the Burning Blade',
    description: 'Root out the Burning Blade cultists hiding in the coastal caves.',
    zoneId: 'durotar',
    kind: 'story',
    requiredLevel: 4,
    requiresQuest: 'dt_scorpid_sting',
    durationSec: 1200,
    baseXp: 400,
    baseGold: 27,
    goldVariance: 0.3,
  },
  dt_boar_hides: {
    id: 'dt_boar_hides',
    name: 'Tusks and Hides',
    description: 'Hunt the razormane boars and gather their tough hides.',
    zoneId: 'durotar',
    kind: 'repeatable',
    requiredLevel: 1,
    durationSec: 300,
    baseXp: 50,
    baseGold: 3,
    goldVariance: 0.4,
  },

  // ── The Barrens (10–25) ──────────────────────────────────────────────────
  ba_quilboar_war: {
    id: 'ba_quilboar_war',
    name: 'War on the Quilboar',
    description: 'Break the Bristleback quilboar raids threatening the Crossroads.',
    zoneId: 'barrens',
    kind: 'story',
    requiredLevel: 10,
    requiresQuest: 'dt_burning_blade',
    durationSec: 1800,
    baseXp: 949,
    baseGold: 63,
    goldVariance: 0.25,
  },
  ba_centaur_menace: {
    id: 'ba_centaur_menace',
    name: 'The Centaur Menace',
    description: 'Push back the centaur clans roaming the southern Barrens.',
    zoneId: 'barrens',
    kind: 'story',
    requiredLevel: 16,
    requiresQuest: 'ba_quilboar_war',
    durationSec: 3600,
    baseXp: 2400,
    baseGold: 160,
    goldVariance: 0.25,
  },
  ba_plainstrider_meat: {
    id: 'ba_plainstrider_meat',
    name: 'Plainstrider Hunt',
    description: 'Bring down plainstriders and harvest their meat for the caravans.',
    zoneId: 'barrens',
    kind: 'repeatable',
    requiredLevel: 12,
    durationSec: 900,
    baseXp: 520,
    baseGold: 35,
    goldVariance: 0.35,
  },

  // ── Thousand Needles (25–40) ─────────────────────────────────────────────
  tn_grimtotem: {
    id: 'tn_grimtotem',
    name: 'The Grimtotem Threat',
    description: 'Drive the treacherous Grimtotem tauren from the high mesas.',
    zoneId: 'thousand_needles',
    kind: 'story',
    requiredLevel: 25,
    requiresQuest: 'ba_centaur_menace',
    durationSec: 5400,
    baseXp: 4500,
    baseGold: 300,
    goldVariance: 0.2,
  },
  tn_galak_ogres: {
    id: 'tn_galak_ogres',
    name: 'Ogres of the Needles',
    description: 'Crush the Galak ogres fortified in Roguefeather Den.',
    zoneId: 'thousand_needles',
    kind: 'story',
    requiredLevel: 32,
    requiresQuest: 'tn_grimtotem',
    durationSec: 7200,
    baseXp: 6788,
    baseGold: 453,
    goldVariance: 0.2,
  },
  tn_salt_flats: {
    id: 'tn_salt_flats',
    name: 'Salt of the Shimmering Flats',
    description: 'Scavenge salvage and salt from the dried Shimmering Flats.',
    zoneId: 'thousand_needles',
    kind: 'repeatable',
    requiredLevel: 27,
    durationSec: 1200,
    baseXp: 1039,
    baseGold: 69,
    goldVariance: 0.3,
  },

  // ── Raid attunement (Horde, M8) — gate to Blackwing Lair ─────────────────
  ho_drakefire_attunement: {
    id: 'ho_drakefire_attunement',
    name: 'The Drakefire Amulet',
    description: 'Forge the Drakefire Amulet to breach the wards of Blackwing Lair.',
    zoneId: 'thousand_needles',
    kind: 'story',
    requiredLevel: 50,
    requiresQuest: 'tn_galak_ogres',
    durationSec: 10800,
    baseXp: 12728,
    baseGold: 849,
    goldVariance: 0.2,
  },

  // ── Doplňkové repeatable questy (M9): RŮZNÉ délky napříč brackety ───────────
  // Délka jen mění objem odměny (≈ délka × referenční rychlost); XP/h drží
  // konstantní per bracket. Mírný „punish" za dlouhý běh řeší `activityEfficiency`
  // (ne per-quest), takže nejdelší repeatable je o ~10–20 % méně efektivní.

  // Low bracket (1–10): quick (Alliance) vs long (Horde).
  ns_riverpaw_scouts: {
    id: 'ns_riverpaw_scouts',
    name: 'Riverpaw Scouts',
    description: 'Drive off a Riverpaw gnoll scout probing the abbey approaches — quick work.',
    zoneId: 'northshire',
    kind: 'repeatable',
    requiredLevel: 6,
    durationSec: 600,
    baseXp: 245,
    baseGold: 16,
    goldVariance: 0.45,
  },
  dt_scorpid_venom: {
    id: 'dt_scorpid_venom',
    name: 'Venom for the Brew',
    description: 'Harvest a full batch of Venomtail venom across the Valley of Trials — a long haul.',
    zoneId: 'durotar',
    kind: 'repeatable',
    requiredLevel: 6,
    durationSec: 1800,
    baseXp: 735,
    baseGold: 49,
    goldVariance: 0.35,
  },

  // Mid bracket (10–25): quick (Alliance) vs long (Horde).
  wf_harvest_golems: {
    id: 'wf_harvest_golems',
    name: 'Malfunctioning Golems',
    description: 'Down a rogue harvest golem before it reaches the farmsteads — fast strike.',
    zoneId: 'westfall',
    kind: 'repeatable',
    requiredLevel: 18,
    durationSec: 600,
    baseXp: 424,
    baseGold: 28,
    goldVariance: 0.4,
  },
  ba_quilboar_raid: {
    id: 'ba_quilboar_raid',
    name: 'Bristleback Incursion',
    description: 'Break a sustained Bristleback quilboar assault on the Crossroads caravans.',
    zoneId: 'barrens',
    kind: 'repeatable',
    requiredLevel: 18,
    durationSec: 3600,
    baseXp: 2546,
    baseGold: 170,
    goldVariance: 0.3,
  },

  // High bracket (25–40): quick (Alliance) vs long (Horde).
  dw_worgen_cull: {
    id: 'dw_worgen_cull',
    name: 'Night of the Worgen',
    description: 'Cull a worgen pack on the Darkshire treeline at dusk — short but vicious.',
    zoneId: 'duskwood',
    kind: 'repeatable',
    requiredLevel: 33,
    durationSec: 900,
    baseXp: 862,
    baseGold: 57,
    goldVariance: 0.35,
  },
  tn_harpy_feathers: {
    id: 'tn_harpy_feathers',
    name: 'Wings of the Wyvern Hunters',
    description: 'Clear the Screeching harpy roosts above the Shimmering Flats — a marathon hunt.',
    zoneId: 'thousand_needles',
    kind: 'repeatable',
    requiredLevel: 33,
    durationSec: 7200,
    baseXp: 6893,
    baseGold: 460,
    goldVariance: 0.3,
  },
};

export const QUEST_IDS = Object.keys(QUESTS);

export function isQuestId(value: string): value is string {
  return value in QUESTS;
}

/** Frakce questu — odvozená z jeho zóny (jediný zdroj pravdy). */
export function questFaction(quest: QuestDef): Faction {
  return ZONES[quest.zoneId].faction;
}

/**
 * Je quest dostupný pro danou frakci, level a sadu dokončených story questů?
 *  - quest patří frakci postavy (kosmetické dělení)
 *  - level >= requiredLevel
 *  - story prerekvizita (pokud je) je dokončená
 *  - story quest už není dokončený (jednorázový); repeatable je vždy dostupný
 */
export function isQuestAvailable(
  quest: QuestDef,
  level: number,
  completedQuestIds: ReadonlySet<string> | readonly string[],
  faction: Faction,
): boolean {
  if (questFaction(quest) !== faction) return false;
  const completed =
    completedQuestIds instanceof Set ? completedQuestIds : new Set(completedQuestIds);
  if (level < quest.requiredLevel) return false;
  if (quest.requiresQuest && !completed.has(quest.requiresQuest)) return false;
  if (quest.kind === 'story' && completed.has(quest.id)) return false;
  return true;
}

/** Seznam dostupných questů pro frakci (seřazený podle requiredLevel). */
export function availableQuests(
  level: number,
  completedQuestIds: ReadonlySet<string> | readonly string[],
  faction: Faction,
): QuestDef[] {
  const completed =
    completedQuestIds instanceof Set ? completedQuestIds : new Set(completedQuestIds);
  return QUEST_IDS.map((id) => QUESTS[id]!)
    .filter((q) => isQuestAvailable(q, level, completed, faction))
    .sort((a, b) => a.requiredLevel - b.requiredLevel);
}
