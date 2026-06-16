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

  // ── Eastern Plaguelands (40–60) — M12 frontier ──────────────────────────
  epl_argent_dawn: {
    id: 'epl_argent_dawn',
    name: 'The Argent Stand',
    description: 'Answer the Argent Dawn\'s call and hold the line against the Scourge in the blighted east.',
    zoneId: 'eastern_plaguelands',
    kind: 'story',
    requiredLevel: 40,
    requiresQuest: 'dw_morbent_fel',
    durationSec: 7200,
    baseXp: 7589,
    baseGold: 506,
    goldVariance: 0.2,
    steps: [
      n('The road east ends in ash. Where farmland once rolled there is only the Plaguelands — soil gone grey, rivers run black, the air thick with the sweet rot of the Scourge. At Light\'s Hope Chapel a weary Argent Dawn knight presses a vial of holy water into your hand. "The dead walk these fields, friend. Burn what you can, bless what you can\'t, and do not let them take you."'),
      c('A ghoul claws its way out of the poisoned earth, jaw unhinged, reaching for warm flesh.', 'Plagued Ghoul', 'standard'),
      n('You scatter the ghoul\'s remains with holy water and press on across the dead fields. Even the wildlife has turned — a great shape lumbers from the blighted treeline, fur sloughing from diseased flesh.'),
      c('A bear maddened by the plague charges, foaming and feverish.', 'Plaguemaw the Rotting', 'elite'),
      n('You lay the beast to rest with a clean stroke — a mercy more than a kill. The Argent Dawn marks your tabard with their crest. You have earned a place on the line. But the living here are nearly as dangerous as the dead.'),
    ],
  },
  epl_scarlet_crusade: {
    id: 'epl_scarlet_crusade',
    name: 'Crimson Madness',
    description: 'The fanatical Scarlet Crusade burns the innocent as "infected". Break their grip on Tyr\'s Hand.',
    zoneId: 'eastern_plaguelands',
    kind: 'story',
    requiredLevel: 48,
    requiresQuest: 'epl_argent_dawn',
    durationSec: 9000,
    baseXp: 10392,
    baseGold: 693,
    goldVariance: 0.2,
    steps: [
      n('Smoke rises from Tyr\'s Hand — not Scourge fire, but pyres. The Scarlet Crusade, zealots who once fought the undead, have gone mad with suspicion: they now burn refugees, pilgrims, anyone they brand "infected". The Argent Dawn asks you to spare those you can and answer the Crusade\'s steel in kind.'),
      c('A Scarlet zealot bars the gate, eyes wild beneath a blood-red hood. "Stand aside, plague-bearer — the Light demands your ashes!"', 'Scarlet Zealot', 'standard'),
      n('Behind the gate, a huddle of terrified farmers cowers from the flames. You cut their bonds and turn them toward Light\'s Hope. Heavy boots ring on the cobbles — the Crusade\'s commander, in crimson plate, has come to finish what his zealots began.'),
      c('Commander Lothradin levels his greatsword. "Traitor to the Light! I\'ll add your skull to the cathedral wall!"', 'Commander Lothradin', 'elite'),
      n('The commander falls, and with him the Crusade\'s hold on Tyr\'s Hand breaks. The freed villagers flee west under Argent escort. Yet to the north a shadow hangs over the land that neither plague nor crusade can explain — a floating fortress of bone, drifting on the dead wind.'),
    ],
  },
  epl_scourge_necropolis: {
    id: 'epl_scourge_necropolis',
    name: 'Shadow of Naxxramas',
    description: 'Scout the floating necropolis and sever the cult feeding the Scourge from below.',
    zoneId: 'eastern_plaguelands',
    kind: 'story',
    requiredLevel: 55,
    requiresQuest: 'epl_scarlet_crusade',
    durationSec: 10800,
    baseXp: 13349,
    baseGold: 890,
    goldVariance: 0.2,
    steps: [
      n('The necropolis has a name now, whispered by Argent scouts who did not return: Naxxramas. It hovers above the Plaguelands like a tombstone for the whole world, and from its shadow a cult of the living feeds it corpses and worship. The Argent Dawn cannot yet assault the fortress itself — but its earthbound cultists can be broken, and their ritual circles unmade.'),
      n('You follow the procession of cowled figures to a circle of profane runes carved into a barrow-mound, the air shivering with necromantic cold.'),
      c('A cult necromancer turns from the ritual, frost rimming his lips. "You are too late, mortal. The Architect has already chosen this world."', 'Cult Necromancer', 'elite'),
      n('You shatter the runestones one by one; the unholy chill recedes a fraction. But the necromancer\'s death-cry summons his masterwork — a towering horror stitched from a dozen dead, dragging a hook on a length of chain.'),
      c('The abomination bellows and swings its hook in a screaming arc.', 'Stitched Horror', 'boss'),
      n('The horror collapses into the offal it was sewn from. The barrow-circle is silent, the necropolis\' shadow no nearer than before. It is not victory — Naxxramas still looms — but the line holds another day, and the Argent Dawn will remember who held it. Word of your deeds has reached the war-leaders; greater battles await at the cap of your strength.'),
    ],
  },
  epl_cleansing_crystals: {
    id: 'epl_cleansing_crystals',
    name: 'Cleansing the Fields',
    description: 'Plant Argent cleansing crystals across the blighted fields and defend them while they work.',
    zoneId: 'eastern_plaguelands',
    kind: 'repeatable',
    requiredLevel: 42,
    durationSec: 900,
    baseXp: 972,
    baseGold: 65,
    goldVariance: 0.35,
    eventCount: 3,
    events: [
      ev('You range across the dead fields, driving Argent crystals into the poisoned soil where the Light still has purchase.'),
      ev('A plaguehound catches your scent and bursts snarling from a ditch of black water.', 'Plaguehound', 'minion'),
      ev('A cloud of diseased carrion-flies coalesces into something almost solid, buzzing toward the nearest crystal.', 'Carrion Swarm', 'standard'),
      ev('A shambling corpse drags itself toward a humming crystal, drawn to disrupt the cleansing.', 'Rotting Dead', 'minion'),
      ev('The soil heaves and a plague-bloated maggot the size of a man erupts beneath your feet.', 'Devouring Maggot', 'standard'),
      ev('The crystals flare clean white and a patch of green dares to show through the grey. You log the reclaimed ground for the Dawn.'),
    ],
  },
  epl_plague_cauldrons: {
    id: 'epl_plague_cauldrons',
    name: 'Foul Brews',
    description: 'Hunt down and destroy the Scourge plague cauldrons seeding the fields — a long, grim patrol.',
    zoneId: 'eastern_plaguelands',
    kind: 'repeatable',
    requiredLevel: 52,
    durationSec: 7200,
    baseXp: 8653,
    baseGold: 577,
    goldVariance: 0.3,
    eventCount: 4,
    events: [
      ev('You quarter the dead farmsteads one by one, following the reek of bubbling corruption to where the Scourge has set its cauldrons.'),
      ev('A cultist tends a steaming cauldron, ladling plague into the wind. He turns at your approach, knife in hand.', 'Plague Brewer', 'standard'),
      ev('The cauldron\'s fumes coalesce into a bound elemental of pure contagion.', 'Cauldron Wraith', 'elite'),
      ev('A patrol of skeletal guardians clatters out of a ruined barn to defend the brew.', 'Skeletal Warden', 'standard'),
      ev('You find the largest cauldron yet, watched over by a bloated overseer who has drunk too deeply of his own poison.', 'Bilebrood Overseer', 'elite'),
      ev('The last cauldron cracks and drains into the dirt. You scatter the embers and trudge back, lungs aching, to report another nest cleared.'),
    ],
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

  // ── Felwood (40–60) — M12 frontier ──────────────────────────────────────
  fw_cenarion_aid: {
    id: 'fw_cenarion_aid',
    name: 'Roots of Corruption',
    description: 'Lend your axe to the Cenarion Circle and beat back the fel taint rotting the ancient wood.',
    zoneId: 'felwood',
    kind: 'story',
    requiredLevel: 40,
    requiresQuest: 'tn_galak_ogres',
    durationSec: 7200,
    baseXp: 7589,
    baseGold: 506,
    goldVariance: 0.2,
    steps: [
      n('North of the Needles the land turns wrong. Felwood was emerald once; now the trees weep black sap and the air tastes of sulphur. At the Emerald Sanctuary a druid of the Cenarion Circle — green-skinned tauren, eyes ringed with sleeplessness — clasps your arm. "The corruption spreads faster than we can cleanse it, outsider. Even the beasts have turned. Help us hold the heart of the wood, and the Circle will not forget the Horde\'s aid."'),
      c('A furbolg, once a gentle forest-keeper, lurches from the brush with fel-green eyes and froth on its tusks.', 'Tainted Furbolg', 'standard'),
      n('You free the poor creature from its torment and burn a censer of cleansing herbs over the soil. Deeper in, where the sap runs thickest, the trees themselves have woken to malice.'),
      c('A treant heaves itself up on root-legs, bark cracking to show fel-fire beneath.', 'Felwarped Ancient', 'elite'),
      n('The ancient topples and the fel-fire gutters in its heartwood. The druids chant the soil clean behind you. You have proven yourself to the Circle — but they warn that the corruption is no accident. Something is feeding it on purpose.'),
    ],
  },
  fw_shadow_council: {
    id: 'fw_shadow_council',
    name: 'The Shadow Council',
    description: 'Hunt the satyr cultists of the Shadow Council channeling fel power into Felwood\'s veins.',
    zoneId: 'felwood',
    kind: 'story',
    requiredLevel: 48,
    requiresQuest: 'fw_cenarion_aid',
    durationSec: 9000,
    baseXp: 10392,
    baseGold: 693,
    goldVariance: 0.2,
    steps: [
      n('The Circle\'s scouts traced the corruption to its tenders: satyrs of the Shadow Council, demon-sworn and gleeful, who pour fel into the land from hidden glades. The druids cannot strike openly without spreading the taint they fight. That work, they say, is better suited to a warrior of the Horde.'),
      c('A satyr lopes from behind a blackened stump, cackling, his clawed hands wreathed in green flame.', 'Shadow Council Trickster', 'standard'),
      n('You run the laughing thing down among the dead trees. On its belt hangs a fel-iron key and a map to a deeper glade — a ritual site, where the Council\'s true work is done.'),
      c('Within the glade a robed summoner stands before a rift of swirling green, an imp gibbering at his heel. "You\'ve come far to die, mortal."', 'Council Summoner Xareth', 'elite'),
      n('You cut down the summoner and stamp out the rift before it can widen. The fel-fire here dies — but the corruption still pulses from somewhere yet deeper, in time with a slow, vast heartbeat. The druids name it with dread: the Emerald Nightmare reaches into the waking world through Felwood\'s roots.'),
    ],
  },
  fw_deadwind_ritual: {
    id: 'fw_deadwind_ritual',
    name: 'Severing the Taint',
    description: 'Break the great ritual feeding the Nightmare into Felwood before the corruption takes root forever.',
    zoneId: 'felwood',
    kind: 'story',
    requiredLevel: 55,
    requiresQuest: 'fw_shadow_council',
    durationSec: 10800,
    baseXp: 13349,
    baseGold: 890,
    goldVariance: 0.2,
    steps: [
      n('The Cenarion Circle has found the wound: at the rotted heart of Felwood, an ancient of the wood — vast, age-old, beloved — has been bent into a conduit, its roots drinking the Nightmare and bleeding it into all the land. The druids weep to ask it, but the ancient must be put down, and the ritual binding it severed. They give you a seed of pure life to plant when the deed is done.'),
      n('You descend into the corrupted hollow, hacking through tendrils of pulsing fel-vine that lash at every step.'),
      c('A pack of nightmare-spawned wolves, their hides translucent and dripping shadow, lunge from the gloom.', 'Nightmare Stalker', 'elite'),
      n('Past the stalkers, the heart-glade opens: the great ancient towers there, groaning, its eyes two wells of green sorrow. It does not want to fight. It cannot stop itself.'),
      c('The corrupted ancient turns upon you, the Nightmare driving its boughs like battering rams.', 'Nemar the Defiled', 'boss'),
      n('With the last blow the ancient sighs and crumbles, free at last. You plant the Circle\'s seed in the ash; already a single green shoot uncurls toward a sky no longer the colour of bile. The Nightmare\'s grip on Felwood is broken. The druids bow to you as kin — and warn that this was but one root of a far older evil, waiting at the limits of your strength.'),
    ],
  },
  fw_felpine_cleanup: {
    id: 'fw_felpine_cleanup',
    name: 'Tainted Glades',
    description: 'Cleanse fel-soaked soil and put the corrupted wildlife of Felwood out of its misery.',
    zoneId: 'felwood',
    kind: 'repeatable',
    requiredLevel: 42,
    durationSec: 900,
    baseXp: 972,
    baseGold: 65,
    goldVariance: 0.35,
    eventCount: 3,
    events: [
      ev('You move from glade to glade with the Circle\'s censer, burning the taint out of the soil one scorched patch at a time.'),
      ev('A fel-touched wolf, ribs showing through patchy green-lit fur, bursts from the ferns.', 'Felpine Wolf', 'minion'),
      ev('A swarm of corrupted sprites flits from a dead tree, flinging stinging motes of fel.', 'Corrupt Sprite', 'standard'),
      ev('A diseased boar, tusks dripping ichor, charges blindly through the underbrush.', 'Tainted Boar', 'minion'),
      ev('A lashing fel-vine, thick as a leg, rips itself from the ground to throttle the nearest sapling.', 'Strangling Felvine', 'standard'),
      ev('The last glade flares clean and the soil steams as the taint lifts. You note the reclaimed ground for the Emerald Sanctuary.'),
    ],
  },
  fw_demon_wardens: {
    id: 'fw_demon_wardens',
    name: 'Wardens of the Wood',
    description: 'Patrol Felwood\'s long trails hunting the demons the Shadow Council loosed — a marathon hunt.',
    zoneId: 'felwood',
    kind: 'repeatable',
    requiredLevel: 52,
    durationSec: 7200,
    baseXp: 8653,
    baseGold: 577,
    goldVariance: 0.3,
    eventCount: 4,
    events: [
      ev('You walk the wardens\' long circuit through the rotting wood, tracking the demons that slipped loose when the Council\'s rifts were torn open.'),
      ev('A felhound prowls a dead clearing, draining the green from everything it nears.', 'Loosed Felhound', 'standard'),
      ev('An imp warren erupts in shrieking chaos as you stumble onto its nest.', 'Imp Warren-Keeper', 'elite'),
      ev('A voidwalker, summoned and abandoned, drifts the trail in mindless hunger.', 'Forsaken Voidwalker', 'standard'),
      ev('At a ruined shrine a doomguard stands sentinel, too proud to flee the world it was dragged into.', 'Stranded Doomguard', 'elite'),
      ev('The last of the loosed demons is banished in a clap of foul air. You drag yourself back to the Sanctuary, the wood a fraction safer for your long walk.'),
    ],
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
