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

/**
 * Tier nepřítele v questovém combat kroku. Konkrétní HP/AP se NEpíše ručně —
 * odvodí se z levelu questu × násobič tieru (viz `quest-run.ts → questFoeStats`),
 * takže autor questu řeší jen jméno + tier (flavor), ne balanc čísla.
 */
export type QuestEnemyTier = 'minion' | 'standard' | 'elite' | 'boss';

/** Nepřítel v questovém combat kroku. */
export interface QuestFoe {
  /** Anglické jméno (game language = EN). */
  name: string;
  tier: QuestEnemyTier;
}

/** Narativní krok — příběhový beat (anglicky), bez boje. */
export interface QuestNarrativeStep {
  kind: 'narrative';
  text: string;
}

/**
 * Combat krok — auto-resolved souboj uvnitř questu. NELZE prohrát (silnější
 * postava = rychlejší/čistší boj, slabší = víc utržených ran), takže idle
 * progres nikdy nezamrzne (rozhodnutí PM).
 */
export interface QuestCombatStep {
  kind: 'combat';
  /** Úvodní věta před bojem (anglicky). */
  intro: string;
  foe: QuestFoe;
}

export type QuestStep = QuestNarrativeStep | QuestCombatStep;

/**
 * Šablona náhodné události pro repeatable quest. Z poolu se při každém běhu
 * deterministicky (seed = čas startu) vybere podmnožina → repeatable quest se
 * pokaždé „odehraje" trochu jinak (rozhodnutí PM: repeatable = generované události).
 */
export interface QuestEventDef {
  /** Narativní popis události (anglicky). */
  text: string;
  /** Volitelný souboj v rámci události. */
  foe?: QuestFoe;
}

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
  /**
   * Vícekrokový příběh (story questy): narativní beaty prokládané combaty. Při
   * claimu se z nich (+ seedu) vygeneruje příběhový log. Chybí ⇒ fallback
   * (jednoduchý log z `description`). Odměny tím NEjsou dotčené (flavor vrstva).
   */
  steps?: QuestStep[];
  /** Pool náhodných událostí pro repeatable quest (vybírá se podmnožina). */
  events?: QuestEventDef[];
  /** Kolik událostí z `events` se vygeneruje za běh (default 3, clamp na velikost poolu). */
  eventCount?: number;
}

// Pomocné buildery kroků/událostí (drží data čitelná, vynucují typy).
const n = (text: string): QuestNarrativeStep => ({ kind: 'narrative', text });
const c = (intro: string, name: string, tier: QuestEnemyTier): QuestCombatStep => ({
  kind: 'combat',
  intro,
  foe: { name, tier },
});
const ev = (text: string, name?: string, tier?: QuestEnemyTier): QuestEventDef =>
  name && tier ? { text, foe: { name, tier } } : { text };

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
    steps: [
      n('Marshal McBride hands you a worn shortsword. "The kobolds out of Echo Ridge Mine have grown bold — they raid our supplies at night. Thin them out before the Abbey goes hungry." You set off along the creek toward the mine.'),
      c('A candle-helmed kobold blocks the mine mouth, hissing "You no take candle!"', 'Kobold Tunneler', 'minion'),
      n('Inside, the tunnels reek of tallow and fear. Scratched into the rock you find a crude Defias brand — someone has been arming these creatures.'),
      c('A robed kobold raises a sputtering ward, the air crackling with stolen magic.', 'Kobold Geomancer', 'standard'),
      n('You pry a sealed letter from the geomancer\'s claws — Westfall wax, the mark of the Defias Brotherhood. The kobolds were only the first thread of something larger. You carry the letter back to the Abbey.'),
    ],
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
    steps: [
      n('The letter spoke of a courier moving through Northshire under cover of dusk. Brother Sammuel asks you to follow the old vineyard road and learn what the Brotherhood is planning so close to Stormwind.'),
      c('A masked lookout perched in the vines spots you and draws a dagger.', 'Defias Lookout', 'minion'),
      n('From the lookout\'s satchel spills a map dotted with marks across Elwynn and Westfall — supply caches, every one. You press on toward the rendezvous they\'d circled twice.'),
      c('The courier himself wheels his horse around, blade flashing. "You\'ve seen too much, whelp!"', 'Defias Courier', 'standard'),
      n('Among the courier\'s effects is a coded ledger naming the next strike: the farmsteads of Westfall. The Abbey can no longer pretend the war stays beyond its walls. You ride for the western road.'),
    ],
  },
  ns_wolf_pelts: {
    id: 'ns_wolf_pelts',
    name: 'Wolves Across the Border',
    description: 'The timber wolves have crossed from the Forest\'s Edge again. Cull the pack and bring back their pelts.',
    zoneId: 'northshire',
    kind: 'repeatable',
    requiredLevel: 1,
    durationSec: 300,
    baseXp: 50,
    baseGold: 3,
    goldVariance: 0.4,
    eventCount: 3,
    events: [
      ev('You pick up a fresh trail along the muddy creek bank and follow it into the brush.'),
      ev('A lean grey hunter breaks cover, hackles raised.', 'Timber Wolf', 'minion'),
      ev('The pack\'s scarred leader stalks you between the pines, eyes gleaming.', 'Elder Timber Wolf', 'standard'),
      ev('You find a half-eaten Abbey sheep and stake out the carcass until the scavenger returns.', 'Starving Wolf', 'minion'),
      ev('A thicket gives way to a den of yipping pups; their mother charges to defend them.', 'Den Mother', 'standard'),
      ev('You skin the kills by lantern-light and bundle the pelts for the tanner.'),
    ],
  },

  // ── Dungeon attunement (Alliance) — gate to Ragefire Chasm ───────────────
  al_ragefire_attunement: {
    id: 'al_ragefire_attunement',
    name: 'Into the Cleft of Shadow',
    description: 'Earn passage into Ragefire Chasm by proving your worth against the Searing Blade.',
    zoneId: 'northshire',
    kind: 'story',
    requiredLevel: 7,
    requiresQuest: 'ns_brotherhood_intel',
    durationSec: 900,
    baseXp: 397,
    baseGold: 26,
    goldVariance: 0.3,
    steps: [
      n('A wounded scout staggers into the Abbey with word of a fiery cult — the Searing Blade — gathering beneath distant Orgrimmar in a volcanic warren called Ragefire Chasm. The Stormwind agents need someone blooded enough to scout its mouth. First, prove you can stand against their kind.'),
      c('A cultist sentry wreathed in embers bars the warren\'s entrance.', 'Searing Blade Sentry', 'standard'),
      n('Past the sentry the heat is suffocating; cracked obsidian steps spiral down into red gloom. You scratch a sigil of passage into the stone as the agents instructed.'),
      c('A bound fire spirit lashes out from a brazier, testing your resolve.', 'Ragefire Wisp', 'elite'),
      n('The wisp dissipates into harmless sparks. The wards recognize you now — Ragefire Chasm will open to you and those you bring. You have earned your attunement.'),
    ],
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
    steps: [
      n('Overseer Gar\'thok eyes you from the dust of the Valley of Trials. "Every whelp who would call themselves Horde must spill blood first. The scorpids breed thick by the southern rocks — go cut your teeth on them." You heft a crude axe and stride into the heat.'),
      c('A clattering scorpid scuttles from beneath a flat rock, tail arched to strike.', 'Valley Scorpid', 'minion'),
      n('Venom hisses on the sand where your blade fell. Deeper among the boulders, the sand itself shifts — something far larger has been feeding on the rest.'),
      c('The brood-mother bursts from the dune, pincers wide, her sting dripping black.', 'Scorpid Broodmother', 'standard'),
      n('You sever the stinger as a trophy and return to the encampment. Gar\'thok grunts approval — for an outsider, you have the makings of a warrior. There is darker work waiting in the caves.'),
    ],
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
    steps: [
      n('Spiritcaller Dohgar\'s vision was grim: the Burning Blade — demon-worshipping traitors — have crept into the sea caves along Durotar\'s coast. "Their fel taint poisons the land, stranger. Burn it out before it spreads to the Den." You follow the tide-line to a smoke-stained cavern.'),
      c('A chanting acolyte turns from a bloody altar, eyes burning green.', 'Burning Blade Acolyte', 'minion'),
      n('The cave walls are scrawled with summoning marks still wet with ichor. Whatever they were calling, it has already half-answered. The air grows hot and wrong.'),
      c('A bound imp skitters from the shadows, flinging gouts of fel-fire and shrieking laughter.', 'Bound Felhound', 'standard'),
      n('You scatter the ritual stones and the green flame gutters out. On the altar lies a fragment of obsidian etched with a fiery sigil — the same warren the elders whisper of: Ragefire Chasm. You bring it back to Dohgar.'),
    ],
  },
  dt_boar_hides: {
    id: 'dt_boar_hides',
    name: 'Tusks and Hides',
    description: 'The Razormane boars are fat with the spring rains. Hunt them and bring back their tough hides.',
    zoneId: 'durotar',
    kind: 'repeatable',
    requiredLevel: 1,
    durationSec: 300,
    baseXp: 50,
    baseGold: 3,
    goldVariance: 0.4,
    eventCount: 3,
    events: [
      ev('You cut a wide circle through the scrub, reading the churned earth where the herd has rooted.'),
      ev('A young boar bursts squealing from a thornbush and lowers its tusks.', 'Razormane Boar', 'minion'),
      ev('A scarred old tusker — too cunning to be cornered easily — charges through the brush.', 'Elder Razortusk', 'standard'),
      ev('You spot a quilboar poacher trying to claim your kill for himself.', 'Bristleback Interloper', 'minion'),
      ev('The herd\'s great bull stamps and snorts, ready to gore anything that nears its sows.', 'Razormane Bull', 'standard'),
      ev('You dress the hides at a dry wash and lash the bundle across your shoulders.'),
    ],
  },

  // ── Dungeon attunement (Horde) — gate to Ragefire Chasm ──────────────────
  ho_ragefire_attunement: {
    id: 'ho_ragefire_attunement',
    name: 'The Cleft of Shadow',
    description: 'Earn passage into Ragefire Chasm by driving back the Searing Blade beneath Orgrimmar.',
    zoneId: 'durotar',
    kind: 'story',
    requiredLevel: 7,
    requiresQuest: 'dt_burning_blade',
    durationSec: 900,
    baseXp: 397,
    baseGold: 26,
    goldVariance: 0.3,
    steps: [
      n('The obsidian shard led the elders to a grim truth: the Searing Blade has dug into Ragefire Chasm, the volcanic warren beneath Orgrimmar itself. Neeru Fireblade of the Cleft of Shadow wants the warren\'s mouth scouted and its sentries broken before the cult can fortify. Prove you are worthy to descend.'),
      c('A Searing Blade enforcer guards the smoldering entrance, twin blades glowing red.', 'Searing Blade Enforcer', 'standard'),
      n('Beyond the gate the warren breathes heat like a forge. You mark the passage with the Cleft\'s sigil so the warchief\'s warriors can follow.'),
      c('A fire elemental, chained to the cult\'s will, erupts from a lava seam to test you.', 'Ragefire Shambler', 'elite'),
      n('The elemental collapses into cooling slag. The Cleft of Shadow recognizes your right of passage — Ragefire Chasm now opens to you and your war-band. The attunement is yours.'),
    ],
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
    eventCount: 3,
    events: [
      ev('You shadow the abbey\'s western approach, watching for gnoll sign in the long grass.'),
      ev('A Riverpaw scout breaks from cover, yipping a warning to its pack.', 'Riverpaw Scout', 'minion'),
      ev('The scouts have set a crude ambush; their pack-leader lunges first.', 'Riverpaw Pack-Leader', 'standard'),
      ev('You find a stolen Abbey strongbox half-buried by the creek — its thief still lurks nearby.', 'Riverpaw Thief', 'minion'),
      ev('A mangy gnoll mystic hurls a clay totem at your feet, calling on dark spirits.', 'Riverpaw Mystic', 'standard'),
      ev('You scatter the survivors back toward the river and report the approaches clear.'),
    ],
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
    eventCount: 4,
    events: [
      ev('You range across the sun-cracked valley, prying venom glands from every nest you can find.'),
      ev('A Venomtail scorpid skitters up from its burrow, tail snapping.', 'Venomtail Scorpid', 'minion'),
      ev('The sand erupts beneath you — an ambushing lurker the size of a kodu.', 'Venomtail Lurker', 'elite'),
      ev('A rival troll alchemist tries to poach the same nests; words turn to blows.', 'Darkspear Poacher', 'standard'),
      ev('You smoke out a deep den and seize a clutch of venom-heavy eggs.', 'Brood Guardian', 'standard'),
      ev('Vials full and sloshing, you trek back to the brewmaster under a blistering sun.'),
    ],
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
