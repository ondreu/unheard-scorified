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
    steps: [
      n('The road into Westfall is lined with smoke. Captain Dwight of the Westfall Militia meets you at Sentinel Hill, jaw tight. "The ledger you carried was right — the Defias have moved on us in force. Half the farms south of the road are burning. Drive the raiders back before there\'s nothing left to save."'),
      c('A Defias raider kicks open a farmhouse door ahead of you, torch in hand. "Nothing for you here but ash!"', 'Defias Raider', 'minion'),
      n('You beat back the raiders farm by farm. In a burned-out cellar you find crates stamped with the Brotherhood\'s seal — not loot, but tools. Heavy, deliberate, industrial. Someone is building something out here, not just looting it.'),
      c('A Defias brigand stands guard over the crates, hammer in hand. "These ain\'t yours to see, militia dog."', 'Defias Brigand', 'standard'),
      n('Among the brigand\'s effects is a set of schematics — crude but unmistakable: clockwork frames built into the shape of farm equipment. The Brotherhood isn\'t just raiding the harvest. They\'re arming it.'),
    ],
  },
  wf_sentinel_lookout: {
    id: 'wf_sentinel_lookout',
    name: 'Watch Along the Coast',
    description: 'Scout the coastal watchtowers for signs of new Defias landings.',
    zoneId: 'westfall',
    kind: 'story',
    requiredLevel: 12,
    requiresQuest: 'wf_defias_raid',
    durationSec: 1500,
    baseXp: 866,
    baseGold: 58,
    goldVariance: 0.25,
    steps: [
      n('Sentinel Hill\'s coastal lookout has gone dark three nights running. Captain Dwight wants eyes back on the road before whatever silenced it reaches the farms.'),
      c('A Defias scout drops from the tower stair, blade already drawn. "Nothing to see here, militia."', 'Defias Scout', 'minion'),
      n('At the tower\'s foot you find the missing lookout — alive, bound and gagged, his signal flags slashed to ribbons. He gasps that a ship unloaded crates of Brotherhood steel onto the beach two nights past, under cover of fog.'),
    ],
  },
  wf_saldeans_plea: {
    id: 'wf_saldeans_plea',
    name: "Saldean's Plea",
    description: "Defend farmer Saldean's stead from the Defias press-gangs.",
    zoneId: 'westfall',
    kind: 'story',
    requiredLevel: 14,
    requiresQuest: 'wf_sentinel_lookout',
    durationSec: 1800,
    baseXp: 1122,
    baseGold: 75,
    goldVariance: 0.25,
    steps: [
      n('Old man Saldean corners you on the road, hands shaking. "They came for my boy, said the Brotherhood needed hands or they\'d take the farm instead. I won\'t lose him to those murderers. Please."'),
      c('A Defias press-gang thug shoves Saldean\'s son toward a wagon, sneering at your approach. "Mind your business, militia."', 'Defias Press-Gang Thug', 'minion'),
      n('You send the press-gang running empty-handed. Saldean\'s son, white-faced, tells you they spoke of a "foreman" waiting on tribute from every farm between here and the coast — and of a deadline drawing near.'),
      c('A Defias enforcer doubles back to finish what the thugs couldn\'t, cudgel raised.', 'Defias Enforcer', 'standard'),
      n('The enforcer falls in the dirt of Saldean\'s own field. The old farmer presses a sack of seed-corn into your hands — all he has to give — and begs you to find whoever is squeezing Westfall dry before there\'s no harvest left for anyone.'),
    ],
  },
  wf_harvest_watchers: {
    id: 'wf_harvest_watchers',
    name: 'The Harvest Golems',
    description: 'Dismantle the rogue harvest watchers stalking the fields.',
    zoneId: 'westfall',
    kind: 'story',
    requiredLevel: 16,
    requiresQuest: 'wf_saldeans_plea',
    durationSec: 3600,
    baseXp: 2400,
    baseGold: 160,
    goldVariance: 0.25,
    steps: [
      n('The schematics were no idle threat. Out among the fallow fields, hulking shapes of scavenged plow-iron and boiler-brass now lurch between the furrows on their own, harvesting nothing but militia patrols. Captain Dwight wants them stopped before the Brotherhood fields an army of them.'),
      c('A harvest watcher pivots toward you on grinding treads, scythe-arms whirring to life.', 'Rogue Harvest Golem', 'standard'),
      n('You jam the golem\'s gears with its own scythe-arm. Welded to its boiler plate is a Defias work-order signed by a name that means nothing to you yet: a tinkerer going by "Foreman Thixx." The next watcher you find is bigger, meaner, and clearly his masterwork.'),
      c('A reinforced watcher rumbles up from a ditch, twice the size of the others, smoke pouring from its stack.', "Foreman Thixx's Reinforced Watcher", 'elite'),
      n('The reinforced watcher topples into the furrow with a final groan of tortured metal. Captain Dwight whistles low at the wreckage. "Whoever\'s building these has real coin behind them — and real reach. Word is there\'s someone new running the whole Brotherhood now. Best you watch your back out here."'),
    ],
  },
  wf_jansens_stead: {
    id: 'wf_jansens_stead',
    name: 'The Jansen Stead',
    description: 'Investigate the silence at the Jansen farmstead.',
    zoneId: 'westfall',
    kind: 'story',
    requiredLevel: 19,
    requiresQuest: 'wf_harvest_watchers',
    durationSec: 2700,
    baseXp: 1962,
    baseGold: 131,
    goldVariance: 0.25,
    steps: [
      n('The Jansen stead hasn\'t answered a militia rider in a week. Captain Dwight fears the worst — the Brotherhood has been making examples of farms that refuse their "protection."'),
      n('You find the farmhouse stripped bare, doors hanging open, but no bodies — only boot-prints leading toward the old windmill on the ridge, dozens of them, marching in step.'),
      c('A Defias drillmaster barks orders at conscripted farmhands inside the windmill, whip in hand.', 'Defias Drillmaster', 'standard'),
      n('The freed farmhands scatter for the road, weeping with relief. The drillmaster\'s ledger lists every able body taken from six farms — destined, it says, for "the Foreman\'s levy" at a stronghold somewhere south. Westfall is bleeding people, not just crops.'),
    ],
  },
  wf_furlbrows_secret: {
    id: 'wf_furlbrows_secret',
    name: "Furlbrow's Secret",
    description: 'Learn what farmer Furlbrow is hiding from the militia.',
    zoneId: 'westfall',
    kind: 'story',
    requiredLevel: 22,
    requiresQuest: 'wf_jansens_stead',
    durationSec: 3000,
    baseXp: 2345,
    baseGold: 156,
    goldVariance: 0.25,
    steps: [
      n('Furlbrow is the only farmer left untouched by the raids, and Captain Dwight finds that more suspicious than comforting. "Either he\'s paying them off, or he\'s one of them. Find out which."'),
      n('You shadow Furlbrow past midnight to a root cellar stacked floor to ceiling with Brotherhood crates — not stolen goods, but bribes. He has been buying his farm\'s safety with militia patrol routes.'),
      c('Furlbrow\'s hired muscle steps out of the dark when you\'re caught looking, hand on an axe. "You weren\'t meant to see that, friend."', "Furlbrow's Hired Blade", 'standard'),
      n('You leave the hired blade groaning in the dirt and Furlbrow on his knees, confessing everything. The patrol routes he sold lead straight to the lighthouse at Moonbrook — and straight to whoever the Brotherhood\'s new leader really is.'),
    ],
  },
  wf_vancleefs_gambit: {
    id: 'wf_vancleefs_gambit',
    name: "Vanessa's Gambit",
    description: "Confront the Defias lieutenant commanding Westfall's tribute levy.",
    zoneId: 'westfall',
    kind: 'story',
    requiredLevel: 24,
    requiresQuest: 'wf_furlbrows_secret',
    durationSec: 3300,
    baseXp: 2694,
    baseGold: 180,
    goldVariance: 0.25,
    steps: [
      n('The sold patrol routes lead to the old lighthouse at Moonbrook, ringed with Defias steel. Captain Dwight rallies what militia he can spare. "Whoever\'s in charge here, they\'ve turned half of Westfall into an army. End it."'),
      c('A Defias lieutenant blocks the lighthouse stair, twin blades catching the lamplight. "The Foreman warned me militia might come sniffing. Pity you won\'t live to report back."', 'Defias Lieutenant', 'elite'),
      n('The lieutenant falls, but her dying words are a warning, not a confession: "You\'re too late. She\'s already sailed for the mines. The Brotherhood\'s real work starts there." Whoever truly leads the Defias Brotherhood, she is far from finished — and far from here.'),
    ],
  },
  // ── Duskwood (25–40) ─────────────────────────────────────────────────────
  dw_nightbane: {
    id: 'dw_nightbane',
    name: 'The Nightbane Worgen',
    description: 'Drive back the Nightbane worgen prowling the darkened roads.',
    zoneId: 'duskwood',
    kind: 'story',
    requiredLevel: 25,
    requiresQuest: 'wf_vancleefs_gambit',
    durationSec: 5400,
    baseXp: 4500,
    baseGold: 300,
    goldVariance: 0.2,
    steps: [
      n('The road south from Westfall plunges into permanent dusk — Duskwood, where the sun never quite breaks through the canopy. Lord Ello Ebonlocke at Darkshire receives you grimly. "The Nightbane worgen have grown bolder by the week, prowling even the high road in daylight. Something is driving them to it. Thin their numbers and learn what you can."'),
      c('A Nightbane worgen lunges from the gloom between the trees, slick with foul ichor.', 'Nightbane Worgen', 'standard'),
      n('The worgen you fell bears no collar, no brand — yet its eyes, even in death, hold an unnatural clarity, as if something has been thinking through it. Deeper in the woods, a larger shape watches from the dark, patient as a held breath.'),
      c('A massive Nightbane alpha steps from the shadows, fur bristling, eyes burning with an intelligence no beast should have.', 'Nightbane Alpha', 'elite'),
      n('The alpha falls, the unnatural light in its eyes guttering out. Pressed into its hide is a sliver of grave-wax — the kind used to seal funeral shrouds. Something is binding these beasts to its will from beyond the grave, and the trail leads toward the old manor district above Raven Hill.'),
    ],
  },
  dw_vanished_village: {
    id: 'dw_vanished_village',
    name: 'The Vanished Village',
    description: 'Investigate the silence at Brightwood Grove.',
    zoneId: 'duskwood',
    kind: 'story',
    requiredLevel: 28,
    requiresQuest: 'dw_nightbane',
    durationSec: 4500,
    baseXp: 3969,
    baseGold: 265,
    goldVariance: 0.2,
    steps: [
      n('Darkshire\'s scouts report the hamlet of Brightwood Grove silent for three days — no smoke, no lanterns, no answer to the watch-bell. Lord Ebonlocke fears the worst and asks you to look before he commits what few militia he can spare.'),
      n('You find Brightwood Grove standing, untouched, and utterly empty — beds slept in, suppers half-eaten, doors unlocked. Not a struggle, not a drop of blood. Only a smell of formaldehyde and lily, sweet and wrong, hanging in every room.'),
      c('A grave-wax shade slips out from beneath a cellar door, its face a smear of borrowed features.', 'Grave-Wax Shade', 'standard'),
      n('The shade dissolves into wax and ash. Scratched into the cellar floor beneath it is a sigil you have seen before — the same mark sealed into the Nightbane alpha\'s grave-wax. Whoever is harvesting these villagers whole is no mere necromancer dabbling in corpses. They want something more.'),
      c('A second shade rises from the well, wearing the face of someone who clearly used to draw water there.', 'Grave-Wax Shade', 'elite'),
      n('You burn the well and salt the cellar, though it feels like too little, too late for Brightwood Grove. Lord Ebonlocke takes the news hard. "Embalmer\'s work," he mutters. "There\'s a name from the old records — Morbent Fel. Pray it isn\'t him risen again."'),
    ],
  },
  dw_morbent_fel: {
    id: 'dw_morbent_fel',
    name: 'Embalmer of the Damned',
    description: 'End the necromancer Morbent Fel and lay the restless dead to rest.',
    zoneId: 'duskwood',
    kind: 'story',
    requiredLevel: 32,
    requiresQuest: 'dw_vanished_village',
    durationSec: 7200,
    baseXp: 6788,
    baseGold: 453,
    goldVariance: 0.2,
    steps: [
      n('The old records were right to fear the name. Morbent Fel, embalmer and necromancer, was driven from Duskwood a generation past — and has returned to an old manor north of Raven Hill, his "work" now measured in villages instead of corpses. Lord Ebonlocke arms you himself. "End this before Brightwood Grove is only the first."'),
      c('A thrall stitched from a dozen borrowed faces lurches up the manor steps, Fel\'s mark branded into its brow.', "Embalmer's Thrall", 'standard'),
      n('Inside, the manor halls are lined with sealed jars, each labeled in a careful, looping hand — names, ages, occupations. An entire vanished village catalogued like specimens. At the heart of the house, Morbent Fel waits among his work, unsurprised by your arrival.'),
      c('Morbent Fel rises from his embalming table, wax-pale and smiling. "Another guest for my collection. How thoughtful of you to deliver yourself."', 'Morbent Fel', 'boss'),
      n('Fel collapses into the wax and dust of his own making, and with him the borrowed faces of Brightwood Grove finally still. Lord Ebonlocke orders the manor burned to the foundations. Duskwood\'s nights grow no brighter — but for the first time in weeks, no one in Darkshire dies in their sleep.'),
    ],
  },
  dw_raven_hill: {
    id: 'dw_raven_hill',
    name: 'The Raven Hill Haunting',
    description: "Quiet the restless dead rising from Raven Hill Cemetery.",
    zoneId: 'duskwood',
    kind: 'story',
    requiredLevel: 34,
    requiresQuest: 'dw_morbent_fel',
    durationSec: 5400,
    baseXp: 5248,
    baseGold: 350,
    goldVariance: 0.2,
    steps: [
      n("Fel's death should have settled Duskwood, but Raven Hill Cemetery has only grown louder — graves disturbed from within, watchmen reporting figures that walk but do not breathe. Whatever this is, it began before Fel and will outlast his ashes."),
      c('A risen watchman shambles between the headstones, lantern still clutched in a rotted hand.', 'Risen Cemetery Watchman', 'standard'),
      n('You find the cemetery\'s old keeper bricked into his own crypt — not buried, hidden, as if something wanted him kept rather than killed. His ledger of burials stops abruptly a decade past, the final page torn away.'),
      c('The cryptkeeper himself rises from behind a shattered vault door, keys still jangling at his belt, eyes long gone white.', 'The Cryptkeeper', 'elite'),
      n('The cryptkeeper crumbles to bone and cobweb. Among the keys on his belt is one stamped with a crest you do not recognize — old nobility, by the look of it. It fits a tomb on the hill\'s far side, sealed with a name half worn away: Aubrey.'),
    ],
  },
  dw_aubreys_tomb: {
    id: 'dw_aubreys_tomb',
    name: "Lord Aubrey's Tomb",
    description: 'Open the sealed tomb of Lord Aubrey and learn why it was hidden.',
    zoneId: 'duskwood',
    kind: 'story',
    requiredLevel: 36,
    requiresQuest: 'dw_raven_hill',
    durationSec: 6000,
    baseXp: 6000,
    baseGold: 400,
    goldVariance: 0.2,
    steps: [
      n('The cryptkeeper\'s key turns in a lock no one has opened in a generation. Lord Ebonlocke recognizes the family name at once — Aubrey, Duskwood nobility who vanished from every record after a single, unexplained winter. "Whatever is down there," he says, "it was buried for a reason. Be careful."'),
      c('A gaunt figure in moth-eaten finery rises from a stone bier, skin drawn tight as old parchment.', 'Lord Aubrey, Risen', 'elite'),
      n('Aubrey does not speak so much as hiss fragments of a feast that never ended — guests who never left, a hunger that outlived the body that felt it. Behind his bier, a second door stands ajar, leading further down than any tomb should reach.'),
      c('Something pale and quick scrabbles up from the dark beyond the second door, more animal now than noble.', "Aubrey's Thrall", 'elite'),
      n("You seal both doors behind you with iron and salt, though you suspect it will not hold forever. Lord Ebonlocke orders the tomb struck from every map Darkshire keeps. Whatever woke the dead of Raven Hill, the Aubrey line was only ever a symptom — and the cause lies deeper in Duskwood's shadow than anyone has dared look."),
    ],
  },
  dw_shadow_of_tyrol: {
    id: 'dw_shadow_of_tyrol',
    name: 'The Shadow of Tyrol',
    description: 'Confront the ancient dread that has lingered beneath Duskwood for generations.',
    zoneId: 'duskwood',
    kind: 'story',
    requiredLevel: 38,
    requiresQuest: 'dw_aubreys_tomb',
    durationSec: 6600,
    baseXp: 6781,
    baseGold: 452,
    goldVariance: 0.2,
    steps: [
      n('Lord Ebonlocke finally tells you the story Darkshire does not speak aloud: long before the Aubreys, before even the founding of the town, a thing called Tyrol was bound beneath these woods by druids who paid for it with their lives. Every horror Duskwood has suffered since — the worgen, Fel, the restless dead — has been Tyrol\'s influence leaking through cracks in that old binding. "If the binding has truly failed," he says, "then Duskwood\'s nightmare is only beginning. End it, or watch the dark spread past these trees."'),
      n('The binding site lies beneath the deepest root-cellar in Raven Hill, druidic wardstones long since cracked and cold. The air here does not merely darken — it presses, like a held breath that has been held too long.'),
      c('Shadow given hateful shape, Tyrol rises from the cracked binding-circle, and the forest itself seems to lean away from it.', 'The Shadow of Tyrol', 'boss'),
      n('Tyrol unravels into smoke and old grief, and for the first time in living memory the canopy above Raven Hill stirs with something like ordinary wind. Lord Ebonlocke does not celebrate — Duskwood will be Duskwood, gloom and all — but he grips your hand like a man who has been carrying a weight for years and finally set it down. "Whatever waits at the edges of the map," he says, "you\'ve more than earned the right to face it." The road east, toward the blighted Plaguelands, lies open.'),
    ],
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
    steps: [
      n('Atop Blackrock Spire, Nefarian — son of Deathwing — works his chromatic horrors behind wards no mortal can simply walk through. A red dragonflight agent in human guise finds you: "The black brood seal their lair against all but their own kin-fire. We can forge you a Drakefire Amulet to fool the wards — but its heart must be a true drake\'s blood, and that you must take yourself."'),
      n('You climb the smoking spire to where the Spire\'s warlord keeps his draconic guard. The heat of the upper rookery is like standing in a forge.'),
      c('A whelp-tender of the black flight rounds on you, scales glowing with inner fire. "Thief! The master will wear your bones!"', 'Blackhand Dragon-Keeper', 'elite'),
      n('You take the vial of drake\'s blood still warm from the kill. But the rookery\'s alarm has roused its guardian — a true drake uncoils from the ash, wings cracking like banners.'),
      c('A black drake drops from its perch, jaws wreathed in shadow-flame.', 'Foreststrider Drake', 'boss'),
      n('The drake crashes lifeless among the cinders. The red agent takes the heart-blood and, in a rite of fire, forges the amulet — a sullen ember on a chain. "Wear it, and Blackwing Lair will open to you as though you were one of Nefarian\'s own. Gather your strongest. The Black Prince must fall."'),
    ],
  },

  // ── Eastern Plaguelands (40–60) — M12 frontier ──────────────────────────
  epl_argent_dawn: {
    id: 'epl_argent_dawn',
    name: 'The Argent Stand',
    description: 'Answer the Argent Dawn\'s call and hold the line against the Scourge in the blighted east.',
    zoneId: 'eastern_plaguelands',
    kind: 'story',
    requiredLevel: 40,
    requiresQuest: 'dw_shadow_of_tyrol',
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
  // ── Raid attunement (Alliance, M12) — gate to Zul'Gurub ──────────────────
  al_paragons_of_power: {
    id: 'al_paragons_of_power',
    name: 'Paragons of Power',
    description: 'Earn the Zandalar tribe\'s trust and breach the blood-soaked gates of Zul\'Gurub.',
    zoneId: 'eastern_plaguelands',
    kind: 'story',
    requiredLevel: 50,
    requiresQuest: 'epl_scarlet_crusade',
    durationSec: 10800,
    baseXp: 12728,
    baseGold: 849,
    goldVariance: 0.2,
    steps: [
      n('A Zandalari emissary finds you among the Argent ranks — the Zandalar tribe, troll loremasters who oppose the blood god, seek allies. "Our cousins, the Gurubashi, have called Hakkar the Soulflayer back into the world," he says, voice tight. "His high priests bleed thousands to feed him. Help us, and Zul\'Gurub\'s gates will open to you." He presses a coil of enchanted vines into your hand — a key, if you can prove worthy of it.'),
      n('You sail to the overgrown coast where the ruined city festers in the jungle heat. The Zandalari ask first that you cull the corrupted beasts the priests have twisted into guardians.'),
      c('A panther the size of a horse stalks from the canopy, its eyes burning with Hakkar\'s sanguine light.', 'Soulflayer Panther', 'standard'),
      n('You drag the beast\'s carcass back to the Zandalari camp. The emissary nods grimly — but warns the true threat is the priesthood itself. One of Venoxis\' acolytes patrols the outer terraces, and his death will rattle the cult.'),
      c('A serpent-priest rises hissing from a blood-pool, twin censers swinging gouts of plague-mist.', 'Acolyte of Venoxis', 'elite'),
      n('The acolyte dissolves into the pool he served. The Zandalari weave the enchanted vines into a living key and bind it to your arm. "The gates know you now, champion. Gather your warband — Hakkar will not fall to one blade alone." Zul\'Gurub is open to you.'),
    ],
  },

  // ── Raid attunement (Alliance, M12) — gate to Temple of Ahn'Qiraj ────────
  al_scepter_of_the_sands: {
    id: 'al_scepter_of_the_sands',
    name: 'The Scepter of the Shifting Sands',
    description: 'Reforge the ancient scepter that seals Ahn\'Qiraj and sound the call to war against the Old God.',
    zoneId: 'eastern_plaguelands',
    kind: 'story',
    requiredLevel: 58,
    requiresQuest: 'epl_scourge_necropolis',
    durationSec: 10800,
    baseXp: 13708,
    baseGold: 914,
    goldVariance: 0.2,
    steps: [
      n('A bronze dragon in mortal guise seeks you out — the flight that guards time itself. "The Qiraji wake," she says, and the air around her shivers with the weight of ages. "Behind the wall of Ahn\'Qiraj, an Old God named C\'Thun dreams of unmaking all that is. The Scepter of the Shifting Sands once sealed it away. It lies shattered. Help me reforge it, and the wall will open at your command."'),
      n('She sends you to recover the first fragment, guarded for a thousand years by a Qiraji vanguard that has crept north along the leylines.'),
      c('A towering silithid warrior bursts from a tunnel of churned earth, scythe-arms shrieking.', 'Qiraji Vanguard', 'elite'),
      n('You wrench the shard of bronze from the dead creature\'s grip. The dragon hums with relief, but the final fragment lies deepest — in the keeping of an emissary of C\'Thun itself, a thing of eyes and madness sent to stop you.'),
      c('A floating horror of clustered eyes and tentacles drifts up from a fissure, whispering in a tongue that withers the grass. "You are already inside the dream, little thing."', 'Emissary of the Old God', 'boss'),
      n('The emissary collapses into writhing ichor and is still. The dragon takes the fragments, and in a forge older than the sun she reforges the Scepter — and lays it in your hands. "Strike the gong at Ahn\'Qiraj, champion. The war begins with you." The Temple of Ahn\'Qiraj is open.'),
    ],
  },

  // ── Dungeon attunement (Alliance, M12) — gate to Stratholme ──────────────
  al_culling_stratholme: {
    id: 'al_culling_stratholme',
    name: 'The Gates of Stratholme',
    description: 'Win passage into the plagued city of Stratholme and stand against Baron Rivendare\'s undead host.',
    zoneId: 'eastern_plaguelands',
    kind: 'story',
    requiredLevel: 58,
    requiresQuest: 'epl_scourge_necropolis',
    durationSec: 10800,
    baseXp: 13708,
    baseGold: 914,
    goldVariance: 0.2,
    steps: [
      n('Stratholme was once the jewel of Lordaeron. Now its gates are walled with bone, half the city held by the fanatic Scarlet Crusade, the other half a charnel-house ruled by the Scourge. The Argent Dawn cannot breach it alone. "If you would enter," the quartermaster tells you, "you must first clear the approach — the Scourge throw their dead at the walls in waves."'),
      c('A reanimated mass of corpses lurches up the causeway, stitched limbs flailing.', 'Patchwork Abomination', 'elite'),
      n('You hack the abomination apart and burn the pieces. At the gatehouse a Scarlet sentry challenges you — the Crusade trusts no one, least of all an outsider walking freely among the dead.'),
      c('A Scarlet gate-captain bars the way, blade drawn. "No one enters the city. The Light has abandoned this place — leave, before it abandons you too."', 'Scarlet Gate-Captain', 'elite'),
      n('The captain falls, and the Argent Dawn slips agents through the breach behind you. They mark a sigil of safe passage upon your tabard. "The inner city is the Baron\'s now," they warn. "Dreadlord-served, ringed in plague. Bring your strongest — Stratholme will not fall to one blade." The way is open.'),
    ],
  },

  // ── Dungeon attunement (Alliance, M12) — gate to Zul'Farrak ──────────────
  al_zf_attunement: {
    id: 'al_zf_attunement',
    name: 'The Mallet of Zul\'Farrak',
    description: 'Recover the sacred mallet that rings the gong of Zul\'Farrak and earns the Sandfury\'s reckoning.',
    zoneId: 'eastern_plaguelands',
    kind: 'story',
    requiredLevel: 42,
    durationSec: 7200,
    baseXp: 7777,
    baseGold: 518,
    goldVariance: 0.2,
    steps: [
      n('A wandering troll hermit, exiled from his tribe, tells you of Zul\'Farrak — a Sandfury city baking in the Tanaris dunes, where priests bleed captives to call a serpent god from the sacred pool. "You cannot simply walk in," he rasps. "The gong at the pyramid steps must be struck with the Mallet of Zul\'Farrak — and the mallet lies broken, its head guarded by the dune stalkers, its haft hoarded by the Sandfury themselves."'),
      c('A great sand-scarab bursts from the dune, mandibles wide, the mallet-head glinting in its gullet.', 'Dune Stalker', 'standard'),
      n('You cut the rusted mallet-head free of the scarab\'s belly. The haft, the hermit says, was taken by a Sandfury raiding party camped at the city\'s edge.'),
      c('A Sandfury axe-thrower guards the camp, the carved haft thrust through his belt. "Outlander! The pool will drink your blood!"', 'Sandfury Reaver', 'elite'),
      n('You bind head to haft and heft the reforged mallet — it hums with old troll magic. Strike the gong at the pyramid steps, the hermit says, and Zul\'Farrak will answer. The city is open to you.'),
    ],
  },

  // ── Dungeon attunement (Alliance, M12) — gate to Maraudon ────────────────
  al_mar_attunement: {
    id: 'al_mar_attunement',
    name: 'The Scepter of Celebras',
    description: 'Aid the redeemed keeper Celebras and forge the scepter that opens the inner grove of Maraudon.',
    zoneId: 'eastern_plaguelands',
    kind: 'story',
    requiredLevel: 46,
    durationSec: 7200,
    baseXp: 8139,
    baseGold: 543,
    goldVariance: 0.2,
    steps: [
      n('The Cenarion Circle speaks of Maraudon — a crystalline cavern where the demigod Zaetar lay with an earth elemental, and from that union came Princess Theradras, who now poisons the deeps. One of Zaetar\'s sons, Celebras, was corrupted there and has since clawed his way back to sanity. He begs your aid: only the Scepter of Celebras can open the warded passage to the inner grove where Theradras festers.'),
      n('Celebras directs you to the cavern\'s threshold, where corrupted nature runs riot and the very stone seethes with elemental hate.'),
      c('A hulking earth-spawn heaves itself from the cavern wall, crystals jutting from its fists.', 'Maraudine Earthbinder', 'elite'),
      n('You shatter the earth-spawn and gather the living crystal Celebras needs. He sings over it the old keeper-songs, and the shards fuse into a scepter of pale green light.'),
      c('A corrupted treant lurches to bar the inner passage, branches lashing like whips.', 'Grovewarden Gnarl', 'elite'),
      n('The treant falls and the warded passage shimmers open at the scepter\'s touch. "The way to my mother\'s daughter is clear," Celebras says, grieving. "End her torment — and mine." Maraudon is open to you.'),
    ],
  },

  // ── Dungeon attunement (Alliance, M12) — gate to Blackrock Depths ────────
  al_brd_attunement: {
    id: 'al_brd_attunement',
    name: 'The Shadowforge Key',
    description: 'Forge the Shadowforge Key and descend into the Dark Iron city of Blackrock Depths.',
    zoneId: 'eastern_plaguelands',
    kind: 'story',
    requiredLevel: 52,
    durationSec: 9000,
    baseXp: 10817,
    baseGold: 721,
    goldVariance: 0.2,
    steps: [
      n('Deep beneath Blackrock Mountain sprawls the greatest city of the Dark Iron dwarves — forge, arena, prison, and the throne of Emperor Dagran Thaurissan, who has bound a fire elemental lord to his will. The gates of the Depths are sealed with Shadowforge locks that answer only to one key. A dwarven exile of the Thorium Brotherhood offers to forge you one — if you bring the Dark Iron ore and a guardian\'s seal to temper it.'),
      n('You descend the mountain\'s outer tunnels to the molten quarries where the Dark Iron work their ore under lash and flame.'),
      c('A Dark Iron taskmaster turns from the forge-line, hammer glowing white. "Surface-scum! The Emperor will have your hide for a bellows!"', 'Dark Iron Taskmaster', 'elite'),
      n('You wrench the guardian\'s seal from the taskmaster\'s belt and gather raw Dark Iron from the quarry. The exile labours over his anvil, quenching the key in elemental fire.'),
      c('A bound flamewaker erupts from the quench-trough, furious at the theft of its forge-fire.', 'Quenchling Flamewaker', 'elite'),
      n('The flamewaker gutters out in a hiss of steam, and the exile lifts the finished Shadowforge Key, still smoking. "The Depths will open to ye now, friend — but the Emperor does not suffer trespass. Take a warband, or take a grave." Blackrock Depths is open to you.'),
    ],
  },

  // ══ Dungeon attunement questlines (Alliance, M12) — 2-questové řetězce ══════
  // ── The Deadmines (gate @ lvl 15) ──
  al_dm_attune_1: {
    id: 'al_dm_attune_1',
    name: 'The Defias Threat',
    description: 'Investigate the Defias raids bleeding the Westfall farmsteads dry.',
    zoneId: 'westfall',
    kind: 'story',
    requiredLevel: 13,
    durationSec: 1800,
    baseXp: 1082,
    baseGold: 72,
    goldVariance: 0.25,
    steps: [
      n('The farms of Westfall lie fallow, their folk fled or pressed into the Defias Brotherhood — a guild of masons turned bandits, nursing a grudge against the crown. A Stormwind marshal hands you a torn dispatch. "They\'re moving something big out of the coast caves. Find out what, and who\'s giving the orders."'),
      c('A masked Defias pillager breaks from a burning barn, blades flashing. "Wrong field to wander, friend."', 'Defias Pillager', 'standard'),
      n('On the body you find a smuggler\'s ledger: crates of weapons funneled into a sealed mine on the cliffs — the Deadmines. The Brotherhood is arming for something far worse than banditry.'),
    ],
  },
  al_dm_attune_2: {
    id: 'al_dm_attune_2',
    name: "The Foreman's Key",
    description: 'Win the key that opens the Deadmines and confront the Defias war effort within.',
    zoneId: 'westfall',
    kind: 'story',
    requiredLevel: 15,
    requiresQuest: 'al_dm_attune_1',
    durationSec: 2700,
    baseXp: 1743,
    baseGold: 116,
    goldVariance: 0.25,
    steps: [
      n('The mine entrance is sealed from within, the tunnel mouth watched day and night. The marshal is plain: "No key, no entry. The shift foreman wears one. Take it off him."'),
      c('A Defias watchman bars the tunnel, lantern in one hand, hooked blade in the other. "Nobody gets past me into the works."', 'Defias Watchman', 'elite'),
      n('You pry the iron key from the watchman\'s belt. The smuggler\'s tunnel grinds open onto a vast cavern — a goblin shipyard, a half-built juggernaut looming in the dark. The Deadmines lie open before you.'),
    ],
  },
  // ── Wailing Caverns (gate @ lvl 17) ──
  al_wc_attune_1: {
    id: 'al_wc_attune_1',
    name: "The Sleeper's Nightmare",
    description: 'Trace the corruption seeping from the dreaming druid Naralex beneath the Barrens.',
    zoneId: 'westfall',
    kind: 'story',
    requiredLevel: 15,
    durationSec: 1800,
    baseXp: 1162,
    baseGold: 77,
    goldVariance: 0.25,
    steps: [
      n('A Cenarion emissary brings dire word: far to the south, the druid Naralex sought to heal the parched Barrens by entering the Emerald Dream — but his dream has soured to nightmare, and it bleeds into the waking world through the Wailing Caverns. His own disciples, the Druids of the Fang, are twisted by it.'),
      c('A serpent warped by the nightmare rears from the reeds, scales running with green ichor.', 'Deviate Adder', 'standard'),
      n('The adder\'s venom is unnatural, dream-stuff made flesh. To walk the Caverns without succumbing, the emissary says, you must first craft a wakener\'s charm — and that needs the glands of the deviate beasts.'),
    ],
  },
  al_wc_attune_2: {
    id: 'al_wc_attune_2',
    name: "The Wakener's Charm",
    description: 'Forge the charm that wards the mind and open the way into the Wailing Caverns.',
    zoneId: 'westfall',
    kind: 'story',
    requiredLevel: 17,
    requiresQuest: 'al_wc_attune_1',
    durationSec: 2700,
    baseXp: 1855,
    baseGold: 124,
    goldVariance: 0.25,
    steps: [
      n('The largest deviate beasts lurk at the cavern\'s flooded mouth, their glands swollen with nightmare-venom. The emissary needs one to seal the charm.'),
      c('A deviate crocolisk surges from the black water, jaws agape, eyes filmed with dream.', 'Deviate Crocolisk', 'elite'),
      n('The emissary binds the gland into a charm of woven heart-leaf; it hums cool against your skin, holding the nightmare at bay. The Wailing Caverns will no longer turn your mind against you. The way is open.'),
    ],
  },
  // ── Shadowfang Keep (gate @ lvl 20) ──
  al_sfk_attune_1: {
    id: 'al_sfk_attune_1',
    name: 'Shadows over Silverpine',
    description: 'Hunt the worgen that spill from Arugal\'s cursed keep into the haunted woods.',
    zoneId: 'westfall',
    kind: 'story',
    requiredLevel: 18,
    durationSec: 1800,
    baseXp: 1273,
    baseGold: 85,
    goldVariance: 0.25,
    steps: [
      n('Refugees speak of a fortress on a fog-wrapped crag — Shadowfang Keep, where the mad Archmage Arugal summoned worgen from beyond and lost himself to their howling. The beasts now range the woods, and whole hamlets have gone silent. A huntsman asks your aid before the next moon.'),
      c('A rabid worgen lunges from the treeline, slaver flying, eyes gleaming feral.', 'Rabid Worgen', 'standard'),
      n('You put the maddened beast down. A trembling survivor tells you the keep\'s great door is sealed by Arugal\'s sorcery — only a moonrune, cut under the full moon, can break the ward.'),
    ],
  },
  al_sfk_attune_2: {
    id: 'al_sfk_attune_2',
    name: 'The Moonrune Seal',
    description: "Break Arugal's ward and open the haunted halls of Shadowfang Keep.",
    zoneId: 'westfall',
    kind: 'story',
    requiredLevel: 20,
    requiresQuest: 'al_sfk_attune_1',
    durationSec: 2700,
    baseXp: 2013,
    baseGold: 134,
    goldVariance: 0.25,
    steps: [
      n('The moonrune must be carved on the keep\'s own threshold-stone, but a tormented spirit — one of Arugal\'s betrayed wardens — guards it, bound to the door in undeath.'),
      c('A spectral officer drifts from the gate, blade trailing cold fire. "None shall enter... none shall leave...".', 'Tormented Officer', 'elite'),
      n('You lay the spirit to rest and cut the moonrune into the threshold. The great door shudders and swings inward on darkness. Shadowfang Keep is open.'),
    ],
  },
  // ── Blackfathom Deeps (gate @ lvl 24) ──
  al_bfd_attune_1: {
    id: 'al_bfd_attune_1',
    name: "The Twilight's Hammer",
    description: 'Uncover the Twilight cult rousing an ancient horror in the sunken temple of Blackfathom.',
    zoneId: 'westfall',
    kind: 'story',
    requiredLevel: 22,
    durationSec: 1800,
    baseXp: 1407,
    baseGold: 94,
    goldVariance: 0.25,
    steps: [
      n('Off the Ashenvale coast lies a temple of the moon goddess, swallowed by the sea in ages past. Now the Twilight\'s Hammer — a doomsday cult — and their naga allies dive its flooded halls to wake Aku\'mai, a beast of the deep. A night elf sentinel begs you to end it before the thing fully wakes.'),
      c('A robed cultist chants knee-deep in the tide, turning on you with a curved sacrificial knife.', 'Twilight Acolyte', 'standard'),
      n('The cultist\'s notes describe rituals held in the temple\'s drowned heart, where no torch will burn. To pass the lightless flood, the sentinel says, you need a sacred lantern — and oil blessed by the moon.'),
    ],
  },
  al_bfd_attune_2: {
    id: 'al_bfd_attune_2',
    name: 'Light in the Deep',
    description: 'Kindle the sacred lantern and descend into the drowned dark of Blackfathom Deeps.',
    zoneId: 'westfall',
    kind: 'story',
    requiredLevel: 24,
    requiresQuest: 'al_bfd_attune_1',
    durationSec: 2700,
    baseXp: 2205,
    baseGold: 147,
    goldVariance: 0.25,
    steps: [
      n('The blessed oil was carried by a priestess of the old temple — long dead, her remains and her phial now claimed by a naga reefwalker that haunts the shallows.'),
      c('A naga reefwalker rises from the surf, trident leveled, the priestess\'s phial strung at its throat.', 'Naga Reefwalker', 'elite'),
      n('You take the phial and the sentinel kindles the sacred lantern; its silver light does not gutter even underwater. The drowned temple can be walked now. Blackfathom Deeps lies open.'),
    ],
  },
  // ── Scarlet Monastery (gate @ lvl 30) ──
  al_sm_attune_1: {
    id: 'al_sm_attune_1',
    name: 'Crimson Fervor',
    description: 'Probe the Scarlet Crusade\'s grip on the cloisters before their zeal turns on the living.',
    zoneId: 'duskwood',
    kind: 'story',
    requiredLevel: 28,
    durationSec: 2700,
    baseXp: 2381,
    baseGold: 159,
    goldVariance: 0.2,
    steps: [
      n('The Scarlet Crusade hold an abbey-fortress on the edge of the dead lands — zealots who began by fighting the Scourge and now burn anyone they brand "infected". An Argent agent works to expose them from within. "Their cloisters are sealed to outsiders," she warns. "Move quietly, and learn how the gates are kept."'),
      c('A Scarlet sentry challenges you at the outer wall, halberd lowered. "Halt! The unclean do not pass!"', 'Scarlet Sentry', 'standard'),
      n('From the sentry\'s orders you learn the truth: each cloister gate answers only to a Crusade signet, carried by the inquisition\'s scribes. Without one, the Monastery stays shut.'),
    ],
  },
  al_sm_attune_2: {
    id: 'al_sm_attune_2',
    name: 'The Cloister Keys',
    description: 'Seize a Crusade signet and throw open the wings of the Scarlet Monastery.',
    zoneId: 'duskwood',
    kind: 'story',
    requiredLevel: 30,
    requiresQuest: 'al_sm_attune_1',
    durationSec: 3600,
    baseXp: 3286,
    baseGold: 219,
    goldVariance: 0.2,
    steps: [
      n('The signets are kept by the inquisition\'s interrogators — cold men who wring confessions from the frightened. The Argent agent marks one who patrols the library cloister alone.'),
      c('A Scarlet interrogator turns from his grim work, signet glinting on his glove. "Another heretic delivered to my hands. How convenient."', 'Scarlet Interrogator', 'elite'),
      n('You take the signet from his still hand. The cloister gates unlock to its sigil one by one — library, armory, cathedral. The Scarlet Monastery is open to you.'),
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
    steps: [
      n('The Crossroads has bled caravans for a week straight. The garrison quartermaster slams a fist on his ledger. "Bristleback quilboar, thick as ticks south of the road. Thin their numbers before the supply lines to Camp Taurajo dry up entirely."'),
      c('A Bristleback raider charges out of the tall grass, tusks lowered.', 'Bristleback Raider', 'minion'),
      n('Past the raiding parties you find a battle-totem driven into the earth, hung with bones in a pattern too deliberate for animal instinct. The quilboar are not just raiding — they are rallying.'),
      c('A Bristleback slasher guards the totem, twin blades strapped to its forelegs.', 'Bristleback Slasher', 'standard'),
      n('You topple the totem and carry its bone-markings back to the Crossroads. The quartermaster turns them over with a frown. "Someone\'s been feeding the quilboar more than scraps. Keep your eyes open out there."'),
    ],
  },
  ba_windward_watch: {
    id: 'ba_windward_watch',
    name: 'Watch the Wind',
    description: 'Check the silent watch-post south of the Crossroads.',
    zoneId: 'barrens',
    kind: 'story',
    requiredLevel: 12,
    requiresQuest: 'ba_quilboar_war',
    durationSec: 1500,
    baseXp: 866,
    baseGold: 58,
    goldVariance: 0.25,
    steps: [
      n('The Crossroads\' southern watch-post has gone quiet for two days. The quartermaster wants to know if it\'s quilboar, deserters, or something worse before he commits any more runners.'),
      c('A quilboar skirmisher bursts from cover at the post\'s edge, spear already swinging.', 'Quilboar Skirmisher', 'minion'),
      n('Behind the wrecked post you find the missing outrunner, battered but alive. He says the quilboar are massing in numbers he\'s never seen, all answering to something they call the "Razorback chieftain" — and that they have help from somewhere south.'),
    ],
  },
  ba_caravan_raid: {
    id: 'ba_caravan_raid',
    name: 'The Caravan Raid',
    description: 'Recover the supplies stolen from an ambushed Horde caravan.',
    zoneId: 'barrens',
    kind: 'story',
    requiredLevel: 14,
    requiresQuest: 'ba_windward_watch',
    durationSec: 1800,
    baseXp: 1122,
    baseGold: 75,
    goldVariance: 0.25,
    steps: [
      n('A grain caravan bound for Camp Taurajo never arrived. Its drivers, what\'s left of them, stumble into the Crossroads babbling about quilboar pouring out of the grass like a flood.'),
      c('A Bristleback brigand picks through the wreckage of an overturned wagon, tusks slick with grain dust.', 'Bristleback Brigand', 'minion'),
      n('You drive off the looters and find the wagon\'s strongbox forced open — not for the gold inside, which lies scattered in the dirt, but for a set of maps the caravan was never meant to be carrying. Maps of the southern Barrens, in centaur script.'),
      c('A Bristleback enforcer rounds on you from behind the wagon, club studded with old iron.', 'Bristleback Enforcer', 'standard'),
      n('You bring the captured maps back to the Crossroads. The quartermaster\'s frown deepens. "Quilboar can\'t read centaur runes. Someone\'s trading favors between the two — and that\'s never been good news for anyone wearing Horde colors."'),
    ],
  },
  ba_centaur_menace: {
    id: 'ba_centaur_menace',
    name: 'The Centaur Menace',
    description: 'Push back the centaur clans roaming the southern Barrens.',
    zoneId: 'barrens',
    kind: 'story',
    requiredLevel: 16,
    requiresQuest: 'ba_caravan_raid',
    durationSec: 3600,
    baseXp: 2400,
    baseGold: 160,
    goldVariance: 0.25,
    steps: [
      n('The centaur maps proved no idle curiosity — the Kolkar clan has been raiding livestock and outriders from Camp Taurajo with growing boldness. The camp\'s elder asks you to push them back before the herds are stripped bare.'),
      c('A Kolkar raider wheels its mount hard, javelin already loosed.', 'Kolkar Raider', 'standard'),
      n('Among the raiders\' camp you find a war-totem unlike any single clan\'s markings — Kolkar, Galak, and a third symbol you don\'t recognize, bound together with sinew. The centaur clans are not raiding for sport. They are uniting.'),
      c('A Kolkar warbringer rallies the camp against you, twin axes whirling.', 'Kolkar Warbringer', 'elite'),
      n('The warbringer falls, and with him the raiding camp scatters. The unfamiliar third symbol on the totem nags at the elder. "That mark," she says slowly, tracing it in the dust. "I\'ve seen it on tauren who call no clan their own. Grimtotem."'),
    ],
  },
  ba_taurajo_stand: {
    id: 'ba_taurajo_stand',
    name: 'Stand at Camp Taurajo',
    description: 'Defend Camp Taurajo from a renewed centaur assault.',
    zoneId: 'barrens',
    kind: 'story',
    requiredLevel: 19,
    requiresQuest: 'ba_centaur_menace',
    durationSec: 2700,
    baseXp: 1962,
    baseGold: 131,
    goldVariance: 0.25,
    steps: [
      n('The Kolkar have not retreated — they\'ve regrouped. Camp Taurajo\'s elder sounds the war-horn as a fresh wave of centaur thunders up from the south, bolder and better armed than before.'),
      n('You hold the camp\'s outer fence through three charges, the elder fighting at your side despite her years. Between waves she shouts that the centaur are fighting like they have something — or someone — backing them now.'),
      c('A Kolkar war-captain leads the final charge personally, banner snapping behind her mount.', 'Kolkar War-Captain', 'standard'),
      n('The war-captain falls at the fence line, and the centaur break for the plains. On her banner-pole, half-hidden under Kolkar dye, is a Grimtotem standard. The elder spits in the dust. "Grimtotem gold buying centaur spears. That\'s an old, ugly trick — and it means they\'re planning something bigger than raids."'),
    ],
  },
  ba_kolkars_secret: {
    id: 'ba_kolkars_secret',
    name: "The Kolkar's Secret",
    description: 'Uncover what the Grimtotem are paying the Kolkar clan to do.',
    zoneId: 'barrens',
    kind: 'story',
    requiredLevel: 22,
    requiresQuest: 'ba_taurajo_stand',
    durationSec: 3000,
    baseXp: 2345,
    baseGold: 156,
    goldVariance: 0.25,
    steps: [
      n('Camp Taurajo\'s elder wants the truth behind the Grimtotem banner. "Find their go-between among the Kolkar. I need to know what we\'re truly facing before it reaches our gates."'),
      n('You track a Kolkar war-shaman to a ritual circle deep in centaur territory, where Grimtotem coin is being traded openly for spears and silence.'),
      c('The Kolkar war-shaman turns from the ritual circle, totem crackling with borrowed Grimtotem magic.', 'Kolkar War-Shaman', 'standard'),
      n('From the shaman\'s effects you recover a Grimtotem requisition order — not for raids on the Crossroads, but for safe passage south, into the high mesas of Thousand Needles. Whatever the Grimtotem are protecting down there, they are paying dearly to keep eyes away from it.'),
      c('A Kolkar outrunner tries to flee with a second copy of the order, desperate to warn his patrons.', 'Kolkar Outrunner', 'elite'),
      n('You run the outrunner down before he can sound any warning. Camp Taurajo\'s elder studies the requisition order grimly. "The mesas. Of course. Take this to the warchief\'s agents — the Grimtotem have been a thorn in the Horde\'s side for too long."'),
    ],
  },
  ba_grimtotem_gambit: {
    id: 'ba_grimtotem_gambit',
    name: "Grimtotem's Gambit",
    description: 'Confront the Grimtotem agent buying loyalty across the southern Barrens.',
    zoneId: 'barrens',
    kind: 'story',
    requiredLevel: 24,
    requiresQuest: 'ba_kolkars_secret',
    durationSec: 3300,
    baseXp: 2694,
    baseGold: 180,
    goldVariance: 0.25,
    steps: [
      n('The requisition order leads to a fortified trading post on the road south, manned by tauren who answer to no chief Camp Taurajo recognizes. The elder rides with you this far, no further. "Grimtotem soil now. Whatever you find, the warchief needs to know before it crosses the Needles."'),
      c('A Grimtotem agent meets you at the gate with a knowing smile and a hand on her axe. "Far from home, outlander. High Chieftain Zaela doesn\'t take kindly to Horde noses where they don\'t belong."', 'Grimtotem Agent', 'elite'),
      n('The agent falls before she can raise the alarm, but her dying words are warning enough: "Zaela already has what she came for. The mesas remember what was buried there — and she means to wake it." Whatever the Grimtotem are truly after lies south, deep in Thousand Needles.'),
    ],
  },
  // ── Thousand Needles (25–40) ─────────────────────────────────────────────
  tn_grimtotem: {
    id: 'tn_grimtotem',
    name: 'The Grimtotem Threat',
    description: 'Drive the treacherous Grimtotem tauren from the high mesas.',
    zoneId: 'thousand_needles',
    kind: 'story',
    requiredLevel: 25,
    requiresQuest: 'ba_grimtotem_gambit',
    durationSec: 5400,
    baseXp: 4500,
    baseGold: 300,
    goldVariance: 0.2,
    steps: [
      n('The mesas of Thousand Needles rise red and jagged ahead, terraced with Grimtotem banners. A Horde scout posted at the canyon\'s edge briefs you fast and low. "High Chieftain Zaela holds the high ground here, and she\'s been digging into something. Push her warriors back far enough for us to see what."'),
      c('A Grimtotem raider drops down from a mesa ledge, axe already swinging.', 'Grimtotem Raider', 'standard'),
      n('Past the outer terraces you find excavation pits cut deep into the mesa rock, braced with timber far sturdier than any mining camp needs. Whatever Zaela is digging for, she expects it to fight back.'),
      c('A Grimtotem warrior bars the deepest excavation tunnel, war-paint fresh, eyes hard.', 'Grimtotem Warrior', 'elite'),
      n('The warrior falls at the tunnel mouth. Scrawled on the excavation timbers in old Galak script is a single repeated word: "ogre-kin." The Grimtotem are not working alone down here — they have struck some bargain with the Galak ogres of Roguefeather Den.'),
    ],
  },
  tn_vanished_outpost: {
    id: 'tn_vanished_outpost',
    name: 'The Vanished Outpost',
    description: 'Find out what happened to the Horde scouts watching Roguefeather Den.',
    zoneId: 'thousand_needles',
    kind: 'story',
    requiredLevel: 28,
    requiresQuest: 'tn_grimtotem',
    durationSec: 4500,
    baseXp: 3969,
    baseGold: 265,
    goldVariance: 0.2,
    steps: [
      n('The Horde watch-post overlooking Roguefeather Den stopped reporting three days ago. Given what you found in the Grimtotem dig, the canyon command wants answers before they send anyone else out there blind.'),
      n('You find the watch-post collapsed in on itself, support beams snapped clean through — not by tools, by sheer brute strength. Drag marks lead away from the wreckage and down toward the ogre den.'),
      c('A Galak brute prowls the wreckage looking for stragglers, club dragging a furrow in the dirt.', 'Galak Brute', 'standard'),
      n('You fight the brute off and find the missing scouts\' gear discarded outside the den\'s mouth — empty, no bodies. Whatever the ogres want with living captives, it is not a quick kill.'),
      c('A second brute lumbers out at the commotion, tusks yellowed and chipped from years of cave-fighting.', 'Galak Brute', 'elite'),
      n('You drive the second brute back into the dark and retreat to report. The canyon command\'s face goes grim. "Captives, Grimtotem gold, and ogres digging where they\'ve no business digging. Time someone went in there and ended it."'),
    ],
  },
  tn_galak_ogres: {
    id: 'tn_galak_ogres',
    name: 'Ogres of the Needles',
    description: 'Crush the Galak ogres fortified in Roguefeather Den.',
    zoneId: 'thousand_needles',
    kind: 'story',
    requiredLevel: 32,
    requiresQuest: 'tn_vanished_outpost',
    durationSec: 7200,
    baseXp: 6788,
    baseGold: 453,
    goldVariance: 0.2,
    steps: [
      n('Roguefeather Den is a warren cut into the mesa\'s root, reinforced with Grimtotem timber and lit by stolen Horde lanterns. Whatever bargain bound ogre and tauren together, it has made the den into a proper fortress. The canyon command sends you in with one order: end it, and bring back the captives if any live.'),
      c('A Galak war-ogre blocks the warren\'s throat, twin clubs scarred with old battles.', 'Galak War-Ogre', 'standard'),
      n('Past the war-ogre, the den opens into a vast chamber lit by Grimtotem braziers, the missing scouts chained but alive against the far wall — and at the chamber\'s heart, the ogre chieftain himself, a Grimtotem advisor whispering at his side.'),
      c('The Galak chieftain Mok\'rash rises from his bone throne, the chamber shaking with each step. "Tauren say outlander come dig for us. Outlander dig for Mok\'rash now — with bones!"', "Mok'rash, Galak Chieftain", 'boss'),
      n('Mok\'rash crashes down, and the Grimtotem advisor flees into a side tunnel rather than face you. You free the chained scouts and lead them out into the light. The canyon command is relieved, but uneasy. "Ogres take orders from no one, normally. The Grimtotem are paying for something much bigger than muscle."'),
    ],
  },
  tn_mirage_flats: {
    id: 'tn_mirage_flats',
    name: 'Whispers in the Mirage Flats',
    description: 'Investigate the Grimtotem ritual binding ancestral spirits across the Mirage Flats.',
    zoneId: 'thousand_needles',
    kind: 'story',
    requiredLevel: 34,
    requiresQuest: 'tn_galak_ogres',
    durationSec: 5400,
    baseXp: 5248,
    baseGold: 350,
    goldVariance: 0.2,
    steps: [
      n('Tauren elders riding with the Horde column report something worse than ogres: out on the heat-shimmering Mirage Flats, the spirits of fallen tauren ancestors are being called up and bound against their will, forced to march at Grimtotem command. "This is desecration," one elder says, voice shaking with anger. "Zaela would enslave the dead to win a war among the living."'),
      c('A bound ancestor-spirit drifts across the flats, eyes hollow, moving only because it is no longer permitted to rest.', 'Bound Ancestor-Spirit', 'standard'),
      n('You break the binding charm pinning the spirit to the waking world and watch it finally dissolve into the heat-haze, free. Nearby, a Grimtotem ritualist works feverishly to bind a second, larger spirit before you can interfere.'),
      c('A Grimtotem ritualist turns from her half-finished binding circle, fury and fear mixed on her face. "You\'ve no idea what we\'re trying to stop down here!"', 'Grimtotem Ritualist', 'elite'),
      n('The ritualist falls, but her final words echo strangely — not defiance, but warning. Her notes describe something ancient stirring beneath the mesas, something the binding rituals were meant to feed and pacify, not merely to raise an army. The elders name it with old dread: a stone titan the first tauren called Korrak, the Mesa-Breaker.'),
    ],
  },
  tn_shimmering_deep: {
    id: 'tn_shimmering_deep',
    name: 'The Shimmering Deep',
    description: 'Descend into the flooded ogre ruins beneath the mesas and learn what the Grimtotem are truly protecting.',
    zoneId: 'thousand_needles',
    kind: 'story',
    requiredLevel: 36,
    requiresQuest: 'tn_mirage_flats',
    durationSec: 6000,
    baseXp: 6000,
    baseGold: 400,
    goldVariance: 0.2,
    steps: [
      n('The ritualist\'s notes lead to a flooded cavern beneath the mesas, the Shimmering Deep — ancient ogre ruins half-submerged in mineral-bright water, far older than Roguefeather Den above it. The tauren elders will not set foot inside. "That place remembers Korrak\'s sleep," one says. "Tread carefully, or wake more than you bargained for."'),
      c('An ogre-mage long abandoned to the ruins lurches up from the shimmering water, magic guttering weakly from cracked tattoos.', 'Forgotten Ogre-Mage', 'elite'),
      n('Beyond the ogre-mage\'s flooded sanctum, the cavern opens onto a vast carved chamber: a titan-sized figure of fused stone and earth, dormant, half-grown back into the rock around it. Grimtotem ritual scaffolding cages every limb, feeding it a slow trickle of bound ancestor-spirits like fuel into a furnace.'),
      c('A second ogre-mage, alerted by the noise, hurls bolts of raw earth-magic to defend the chamber.', 'Ruin-Warden Ogre-Mage', 'elite'),
      n('You collapse the feeding scaffolding rather than risk waking the titan outright, buying time but not victory. Whatever Korrak is, the Grimtotem mean to finish the ritual at the mesa\'s highest point — the Highperch Aerie — where High Chieftain Zaela herself now waits.'),
    ],
  },
  tn_highperch_aerie: {
    id: 'tn_highperch_aerie',
    name: 'The Highperch Aerie',
    description: "Stop High Chieftain Zaela's ritual before Korrak the Mesa-Breaker fully wakes.",
    zoneId: 'thousand_needles',
    kind: 'story',
    requiredLevel: 38,
    requiresQuest: 'tn_shimmering_deep',
    durationSec: 6600,
    baseXp: 6781,
    baseGold: 452,
    goldVariance: 0.2,
    steps: [
      n('The Highperch Aerie crowns the tallest mesa in the Needles, wind-scoured and ringed with Grimtotem banners. The tauren elders ride with you as far as the final switchback trail. "End this," the eldest says. "Korrak was bound for a reason older than any of our clans. Zaela would unmake that to win a war she has already lost the right to wage."'),
      c('High Chieftain Zaela bars the aerie\'s summit alone, eyes blazing, the binding ritual already half-complete behind her. "The Mesa-Breaker will make Grimtotem strength undeniable — even to your precious Horde!"', 'High Chieftain Zaela', 'elite'),
      n('Zaela falls, but the ritual she started does not stop with her — far below, the fused stone titan finally tears free of its scaffolding, the last bound spirits screaming into nothing as it rises.'),
      c('Korrak, the Mesa-Breaker, claws its way up the cliff face, each footstep splitting rock for a mile around.', 'Korrak, the Mesa-Breaker', 'boss'),
      n('Korrak crumbles back into ordinary stone and silence, the long-bound titan finally allowed to simply be earth again. The tauren elders weep with something between grief and relief. "Generations of Grimtotem ambition, ended on this mesa," the eldest says. "The Horde will remember what you\'ve done here — and there is word now of trouble far greater, north past the dead lands, that will need warriors like you."'),
    ],
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
    steps: [
      n('Atop Blackrock Spire, Nefarian — son of Deathwing — works his chromatic horrors behind wards no mortal can simply walk through. A red dragonflight agent in mortal guise seeks the Horde\'s aid: "The black brood seal their lair against all but their own kin-fire. We can forge you a Drakefire Amulet to fool the wards — but its heart must be a true drake\'s blood, and that you must take yourself."'),
      n('You climb the smoking spire to where the warlord keeps his draconic guard. The heat of the upper rookery is like standing in a forge.'),
      c('A whelp-tender of the black flight rounds on you, scales glowing with inner fire. "Thief! The master will wear your bones!"', 'Blackhand Dragon-Keeper', 'elite'),
      n('You take the vial of drake\'s blood still warm from the kill. But the rookery\'s alarm has roused its guardian — a true drake uncoils from the ash, wings cracking like banners.'),
      c('A black drake drops from its perch, jaws wreathed in shadow-flame.', 'Foreststrider Drake', 'boss'),
      n('The drake crashes lifeless among the cinders. The red agent takes the heart-blood and, in a rite of fire, forges the amulet — a sullen ember on a chain. "Wear it, and Blackwing Lair will open to you as though you were one of Nefarian\'s own. Gather your strongest. The Black Prince must fall."'),
    ],
  },

  // ── Felwood (40–60) — M12 frontier ──────────────────────────────────────
  fw_cenarion_aid: {
    id: 'fw_cenarion_aid',
    name: 'Roots of Corruption',
    description: 'Lend your axe to the Cenarion Circle and beat back the fel taint rotting the ancient wood.',
    zoneId: 'felwood',
    kind: 'story',
    requiredLevel: 40,
    requiresQuest: 'tn_highperch_aerie',
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

  // ── Raid attunement (Horde, M12) — gate to Zul'Gurub ─────────────────────
  ho_paragons_of_power: {
    id: 'ho_paragons_of_power',
    name: 'Paragons of Power',
    description: 'Earn the Zandalar tribe\'s trust and breach the blood-soaked gates of Zul\'Gurub.',
    zoneId: 'felwood',
    kind: 'story',
    requiredLevel: 50,
    requiresQuest: 'fw_shadow_council',
    durationSec: 10800,
    baseXp: 12728,
    baseGold: 849,
    goldVariance: 0.2,
    steps: [
      n('A Zandalari emissary seeks you out — the Zandalar tribe, troll loremasters who oppose the blood god, look even to the Horde for aid. "Our cousins, the Gurubashi, have called Hakkar the Soulflayer back into the world," he says. "His high priests bleed thousands to feed him. Help us, and Zul\'Gurub\'s gates will open to you." He presses a coil of enchanted vines into your hand — a key, if you can prove worthy of it.'),
      n('You travel to the overgrown coast where the ruined city festers in the jungle heat. The Zandalari ask first that you cull the corrupted beasts the priests have twisted into guardians.'),
      c('A panther the size of a kodo stalks from the canopy, its eyes burning with Hakkar\'s sanguine light.', 'Soulflayer Panther', 'standard'),
      n('You drag the beast\'s carcass back to the Zandalari camp. The emissary nods grimly — but warns the true threat is the priesthood itself. One of Venoxis\' acolytes patrols the outer terraces, and his death will rattle the cult.'),
      c('A serpent-priest rises hissing from a blood-pool, twin censers swinging gouts of plague-mist.', 'Acolyte of Venoxis', 'elite'),
      n('The acolyte dissolves into the pool he served. The Zandalari weave the enchanted vines into a living key and bind it to your arm. "The gates know you now, champion. Gather your warband — Hakkar will not fall to one blade alone." Zul\'Gurub is open to you.'),
    ],
  },

  // ── Raid attunement (Horde, M12) — gate to Temple of Ahn'Qiraj ───────────
  ho_scepter_of_the_sands: {
    id: 'ho_scepter_of_the_sands',
    name: 'The Scepter of the Shifting Sands',
    description: 'Reforge the ancient scepter that seals Ahn\'Qiraj and sound the call to war against the Old God.',
    zoneId: 'felwood',
    kind: 'story',
    requiredLevel: 58,
    requiresQuest: 'fw_deadwind_ritual',
    durationSec: 10800,
    baseXp: 13708,
    baseGold: 914,
    goldVariance: 0.2,
    steps: [
      n('A bronze dragon in mortal guise seeks you out — the flight that guards time itself. "The Qiraji wake," she says, and the air around her shivers with the weight of ages. "Behind the wall of Ahn\'Qiraj, an Old God named C\'Thun dreams of unmaking all that is. The Scepter of the Shifting Sands once sealed it away. It lies shattered. Help me reforge it, and the wall will open at your command."'),
      n('She sends you to recover the first fragment, guarded for a thousand years by a Qiraji vanguard that has crept north along the leylines.'),
      c('A towering silithid warrior bursts from a tunnel of churned earth, scythe-arms shrieking.', 'Qiraji Vanguard', 'elite'),
      n('You wrench the shard of bronze from the dead creature\'s grip. The dragon hums with relief, but the final fragment lies deepest — in the keeping of an emissary of C\'Thun itself, a thing of eyes and madness sent to stop you.'),
      c('A floating horror of clustered eyes and tentacles drifts up from a fissure, whispering in a tongue that withers the grass. "You are already inside the dream, little thing."', 'Emissary of the Old God', 'boss'),
      n('The emissary collapses into writhing ichor and is still. The dragon takes the fragments, and in a forge older than the sun she reforges the Scepter — and lays it in your hands. "Strike the gong at Ahn\'Qiraj, champion. The war begins with you." The Temple of Ahn\'Qiraj is open.'),
    ],
  },

  // ── Dungeon attunement (Horde, M12) — gate to Stratholme ─────────────────
  ho_culling_stratholme: {
    id: 'ho_culling_stratholme',
    name: 'The Gates of Stratholme',
    description: 'Win passage into the plagued city of Stratholme and stand against Baron Rivendare\'s undead host.',
    zoneId: 'felwood',
    kind: 'story',
    requiredLevel: 58,
    requiresQuest: 'fw_deadwind_ritual',
    durationSec: 10800,
    baseXp: 13708,
    baseGold: 914,
    goldVariance: 0.2,
    steps: [
      n('Word reaches the Horde of Stratholme — once a human city, now a wound in the world. Half is held by the fanatic Scarlet Crusade, who would burn you on sight; the other half is a charnel-house of the Scourge. The Forsaken, who know undeath better than any, ask your aid: "The Scourge there serve a dreadlord. We would see it ended. But none walk into Stratholme uninvited — clear the approach first, and the gate will open."'),
      c('A reanimated mass of corpses lurches up the causeway, stitched limbs flailing.', 'Patchwork Abomination', 'elite'),
      n('You hack the abomination apart and burn the pieces. At the gatehouse a Scarlet sentry challenges you — the Crusade trusts no living thing, and trusts the Horde least of all.'),
      c('A Scarlet gate-captain bars the way, blade drawn. "Foul creature of the Horde! The Light will scour you from these walls!"', 'Scarlet Gate-Captain', 'elite'),
      n('The captain falls, and Forsaken agents slip through the breach behind you. They press a phial of blight into your hand as a mark of passage. "The inner city is the Baron\'s now," they rasp. "Dreadlord-served, ringed in plague. Bring your strongest — Stratholme will not fall to one blade." The way is open.'),
    ],
  },

  // ── Dungeon attunement (Horde, M12) — gate to Zul'Farrak ─────────────────
  ho_zf_attunement: {
    id: 'ho_zf_attunement',
    name: 'The Mallet of Zul\'Farrak',
    description: 'Recover the sacred mallet that rings the gong of Zul\'Farrak and earns the Sandfury\'s reckoning.',
    zoneId: 'felwood',
    kind: 'story',
    requiredLevel: 42,
    durationSec: 7200,
    baseXp: 7777,
    baseGold: 518,
    goldVariance: 0.2,
    steps: [
      n('A wandering troll hermit, exiled from his tribe, tells you of Zul\'Farrak — a Sandfury city baking in the Tanaris dunes, where priests bleed captives to call a serpent god from the sacred pool. "You cannot simply walk in," he rasps. "The gong at the pyramid steps must be struck with the Mallet of Zul\'Farrak — and the mallet lies broken, its head guarded by the dune stalkers, its haft hoarded by the Sandfury themselves."'),
      c('A great sand-scarab bursts from the dune, mandibles wide, the mallet-head glinting in its gullet.', 'Dune Stalker', 'standard'),
      n('You cut the rusted mallet-head free of the scarab\'s belly. The haft, the hermit says, was taken by a Sandfury raiding party camped at the city\'s edge.'),
      c('A Sandfury axe-thrower guards the camp, the carved haft thrust through his belt. "Outlander! The pool will drink your blood!"', 'Sandfury Reaver', 'elite'),
      n('You bind head to haft and heft the reforged mallet — it hums with old troll magic. Strike the gong at the pyramid steps, the hermit says, and Zul\'Farrak will answer. The city is open to you.'),
    ],
  },

  // ── Dungeon attunement (Horde, M12) — gate to Maraudon ───────────────────
  ho_mar_attunement: {
    id: 'ho_mar_attunement',
    name: 'The Scepter of Celebras',
    description: 'Aid the redeemed keeper Celebras and forge the scepter that opens the inner grove of Maraudon.',
    zoneId: 'felwood',
    kind: 'story',
    requiredLevel: 46,
    durationSec: 7200,
    baseXp: 8139,
    baseGold: 543,
    goldVariance: 0.2,
    steps: [
      n('The Cenarion Circle speaks of Maraudon — a crystalline cavern where the demigod Zaetar lay with an earth elemental, and from that union came Princess Theradras, who now poisons the deeps. One of Zaetar\'s sons, Celebras, was corrupted there and has since clawed his way back to sanity. He begs your aid: only the Scepter of Celebras can open the warded passage to the inner grove where Theradras festers.'),
      n('Celebras directs you to the cavern\'s threshold, where corrupted nature runs riot and the very stone seethes with elemental hate.'),
      c('A hulking earth-spawn heaves itself from the cavern wall, crystals jutting from its fists.', 'Maraudine Earthbinder', 'elite'),
      n('You shatter the earth-spawn and gather the living crystal Celebras needs. He sings over it the old keeper-songs, and the shards fuse into a scepter of pale green light.'),
      c('A corrupted treant lurches to bar the inner passage, branches lashing like whips.', 'Grovewarden Gnarl', 'elite'),
      n('The treant falls and the warded passage shimmers open at the scepter\'s touch. "The way to my mother\'s daughter is clear," Celebras says, grieving. "End her torment — and mine." Maraudon is open to you.'),
    ],
  },

  // ── Dungeon attunement (Horde, M12) — gate to Blackrock Depths ───────────
  ho_brd_attunement: {
    id: 'ho_brd_attunement',
    name: 'The Shadowforge Key',
    description: 'Forge the Shadowforge Key and descend into the Dark Iron city of Blackrock Depths.',
    zoneId: 'felwood',
    kind: 'story',
    requiredLevel: 52,
    durationSec: 9000,
    baseXp: 10817,
    baseGold: 721,
    goldVariance: 0.2,
    steps: [
      n('Deep beneath Blackrock Mountain sprawls the greatest city of the Dark Iron dwarves — forge, arena, prison, and the throne of Emperor Dagran Thaurissan, who has bound a fire elemental lord to his will. The gates of the Depths are sealed with Shadowforge locks that answer only to one key. A dwarven exile of the Thorium Brotherhood offers to forge you one — if you bring the Dark Iron ore and a guardian\'s seal to temper it.'),
      n('You descend the mountain\'s outer tunnels to the molten quarries where the Dark Iron work their ore under lash and flame.'),
      c('A Dark Iron taskmaster turns from the forge-line, hammer glowing white. "Surface-scum! The Emperor will have your hide for a bellows!"', 'Dark Iron Taskmaster', 'elite'),
      n('You wrench the guardian\'s seal from the taskmaster\'s belt and gather raw Dark Iron from the quarry. The exile labours over his anvil, quenching the key in elemental fire.'),
      c('A bound flamewaker erupts from the quench-trough, furious at the theft of its forge-fire.', 'Quenchling Flamewaker', 'elite'),
      n('The flamewaker gutters out in a hiss of steam, and the exile lifts the finished Shadowforge Key, still smoking. "The Depths will open to ye now, friend — but the Emperor does not suffer trespass. Take a warband, or take a grave." Blackrock Depths is open to you.'),
    ],
  },

  // ══ Dungeon attunement questlines (Horde, M12) — 2-questové řetězce ═════════
  // ── The Deadmines (gate @ lvl 15) ──
  ho_dm_attune_1: {
    id: 'ho_dm_attune_1',
    name: 'The Defias Threat',
    description: 'Track the Defias smugglers whose stolen weapons arm raiders along the Barrens coast.',
    zoneId: 'barrens',
    kind: 'story',
    requiredLevel: 13,
    durationSec: 1800,
    baseXp: 1082,
    baseGold: 72,
    goldVariance: 0.25,
    steps: [
      n('Weapons of fine Stormwind make have begun turning up in the hands of coastal raiders harrying the Barrens roads — smuggled, a Horde quartermaster suspects, by the human Defias Brotherhood. "Find their landing," he growls, "and find out what they\'re shipping. The Horde will not be cut down with stolen steel."'),
      c('A masked Defias pillager breaks cover on the shore, blades flashing. "Off our cargo, beast."', 'Defias Pillager', 'standard'),
      n('On the body you find a smuggler\'s ledger: crates funneled into a sealed mine on the far cliffs — the Deadmines. The Brotherhood is arming for something far worse than banditry.'),
    ],
  },
  ho_dm_attune_2: {
    id: 'ho_dm_attune_2',
    name: "The Foreman's Key",
    description: 'Win the key that opens the Deadmines and confront the Defias war effort within.',
    zoneId: 'barrens',
    kind: 'story',
    requiredLevel: 15,
    requiresQuest: 'ho_dm_attune_1',
    durationSec: 2700,
    baseXp: 1743,
    baseGold: 116,
    goldVariance: 0.25,
    steps: [
      n('The mine entrance is sealed from within, the tunnel mouth watched day and night. The quartermaster is plain: "No key, no entry. The shift foreman wears one. Take it off him."'),
      c('A Defias watchman bars the tunnel, lantern in one hand, hooked blade in the other. "Nobody gets past me into the works."', 'Defias Watchman', 'elite'),
      n('You pry the iron key from the watchman\'s belt. The smuggler\'s tunnel grinds open onto a vast cavern — a goblin shipyard, a half-built juggernaut looming in the dark. The Deadmines lie open before you.'),
    ],
  },
  // ── Wailing Caverns (gate @ lvl 17) ──
  ho_wc_attune_1: {
    id: 'ho_wc_attune_1',
    name: "The Sleeper's Nightmare",
    description: 'Trace the corruption seeping from the dreaming druid Naralex beneath the Barrens.',
    zoneId: 'barrens',
    kind: 'story',
    requiredLevel: 15,
    durationSec: 1800,
    baseXp: 1162,
    baseGold: 77,
    goldVariance: 0.25,
    steps: [
      n('The tauren of the Barrens bring dire word: the druid Naralex sought to heal the parched land by entering the Emerald Dream — but his dream has soured to nightmare, and it bleeds into the waking world through the Wailing Caverns nearby. His own disciples, the Druids of the Fang, are twisted by it.'),
      c('A serpent warped by the nightmare rears from the dry grass, scales running with green ichor.', 'Deviate Adder', 'standard'),
      n('The adder\'s venom is unnatural, dream-stuff made flesh. To walk the Caverns without succumbing, the tauren say, you must first craft a wakener\'s charm — and that needs the glands of the deviate beasts.'),
    ],
  },
  ho_wc_attune_2: {
    id: 'ho_wc_attune_2',
    name: "The Wakener's Charm",
    description: 'Forge the charm that wards the mind and open the way into the Wailing Caverns.',
    zoneId: 'barrens',
    kind: 'story',
    requiredLevel: 17,
    requiresQuest: 'ho_wc_attune_1',
    durationSec: 2700,
    baseXp: 1855,
    baseGold: 124,
    goldVariance: 0.25,
    steps: [
      n('The largest deviate beasts lurk at the cavern\'s flooded mouth, their glands swollen with nightmare-venom. The tauren wakener needs one to seal the charm.'),
      c('A deviate crocolisk surges from the black water, jaws agape, eyes filmed with dream.', 'Deviate Crocolisk', 'elite'),
      n('The wakener binds the gland into a charm of woven heart-leaf; it hums cool against your skin, holding the nightmare at bay. The Wailing Caverns will no longer turn your mind against you. The way is open.'),
    ],
  },
  // ── Shadowfang Keep (gate @ lvl 20) ──
  ho_sfk_attune_1: {
    id: 'ho_sfk_attune_1',
    name: 'Shadows over Silverpine',
    description: 'Hunt the worgen that spill from Arugal\'s cursed keep into the haunted woods.',
    zoneId: 'barrens',
    kind: 'story',
    requiredLevel: 18,
    durationSec: 1800,
    baseXp: 1273,
    baseGold: 85,
    goldVariance: 0.25,
    steps: [
      n('Forsaken scouts bring word of a fortress on a fog-wrapped crag — Shadowfang Keep, where the mad Archmage Arugal summoned worgen from beyond and lost himself to their howling. The beasts now range the woods, threatening even the Horde\'s outposts. A dark ranger asks your aid before the next moon.'),
      c('A rabid worgen lunges from the treeline, slaver flying, eyes gleaming feral.', 'Rabid Worgen', 'standard'),
      n('You put the maddened beast down. A captured villager tells you the keep\'s great door is sealed by Arugal\'s sorcery — only a moonrune, cut under the full moon, can break the ward.'),
    ],
  },
  ho_sfk_attune_2: {
    id: 'ho_sfk_attune_2',
    name: 'The Moonrune Seal',
    description: "Break Arugal's ward and open the haunted halls of Shadowfang Keep.",
    zoneId: 'barrens',
    kind: 'story',
    requiredLevel: 20,
    requiresQuest: 'ho_sfk_attune_1',
    durationSec: 2700,
    baseXp: 2013,
    baseGold: 134,
    goldVariance: 0.25,
    steps: [
      n('The moonrune must be carved on the keep\'s own threshold-stone, but a tormented spirit — one of Arugal\'s betrayed wardens — guards it, bound to the door in undeath.'),
      c('A spectral officer drifts from the gate, blade trailing cold fire. "None shall enter... none shall leave...".', 'Tormented Officer', 'elite'),
      n('You lay the spirit to rest and cut the moonrune into the threshold. The great door shudders and swings inward on darkness. Shadowfang Keep is open.'),
    ],
  },
  // ── Blackfathom Deeps (gate @ lvl 24) ──
  ho_bfd_attune_1: {
    id: 'ho_bfd_attune_1',
    name: "The Twilight's Hammer",
    description: 'Uncover the Twilight cult rousing an ancient horror in the sunken temple of Blackfathom.',
    zoneId: 'barrens',
    kind: 'story',
    requiredLevel: 22,
    durationSec: 1800,
    baseXp: 1407,
    baseGold: 94,
    goldVariance: 0.25,
    steps: [
      n('Off the Ashenvale coast lies a temple of the moon goddess, swallowed by the sea in ages past. Now the Twilight\'s Hammer — a doomsday cult — and their naga allies dive its flooded halls to wake Aku\'mai, a beast of the deep. A Horde shaman, fearing what the cult would unleash on all the world, begs you to end it.'),
      c('A robed cultist chants knee-deep in the tide, turning on you with a curved sacrificial knife.', 'Twilight Acolyte', 'standard'),
      n('The cultist\'s notes describe rituals held in the temple\'s drowned heart, where no torch will burn. To pass the lightless flood, the shaman says, you need a sacred lantern — and oil blessed by the moon.'),
    ],
  },
  ho_bfd_attune_2: {
    id: 'ho_bfd_attune_2',
    name: 'Light in the Deep',
    description: 'Kindle the sacred lantern and descend into the drowned dark of Blackfathom Deeps.',
    zoneId: 'barrens',
    kind: 'story',
    requiredLevel: 24,
    requiresQuest: 'ho_bfd_attune_1',
    durationSec: 2700,
    baseXp: 2205,
    baseGold: 147,
    goldVariance: 0.25,
    steps: [
      n('The blessed oil was carried by a priestess of the old temple — long dead, her remains and her phial now claimed by a naga reefwalker that haunts the shallows.'),
      c('A naga reefwalker rises from the surf, trident leveled, the priestess\'s phial strung at its throat.', 'Naga Reefwalker', 'elite'),
      n('You take the phial and the shaman kindles the sacred lantern; its silver light does not gutter even underwater. The drowned temple can be walked now. Blackfathom Deeps lies open.'),
    ],
  },
  // ── Scarlet Monastery (gate @ lvl 30) ──
  ho_sm_attune_1: {
    id: 'ho_sm_attune_1',
    name: 'Crimson Fervor',
    description: 'Probe the Scarlet Crusade\'s grip on the cloisters before their zeal turns on the living.',
    zoneId: 'thousand_needles',
    kind: 'story',
    requiredLevel: 28,
    durationSec: 2700,
    baseXp: 2381,
    baseGold: 159,
    goldVariance: 0.2,
    steps: [
      n('The Scarlet Crusade hold an abbey-fortress on the edge of the dead lands — zealots who began by fighting the Scourge and now burn anyone they brand "infected", the Forsaken above all. A Forsaken agent works to expose them from within. "Their cloisters are sealed to outsiders," she rasps. "Move quietly, and learn how the gates are kept."'),
      c('A Scarlet sentry challenges you at the outer wall, halberd lowered. "Halt! The unclean do not pass!"', 'Scarlet Sentry', 'standard'),
      n('From the sentry\'s orders you learn the truth: each cloister gate answers only to a Crusade signet, carried by the inquisition\'s scribes. Without one, the Monastery stays shut.'),
    ],
  },
  ho_sm_attune_2: {
    id: 'ho_sm_attune_2',
    name: 'The Cloister Keys',
    description: 'Seize a Crusade signet and throw open the wings of the Scarlet Monastery.',
    zoneId: 'thousand_needles',
    kind: 'story',
    requiredLevel: 30,
    requiresQuest: 'ho_sm_attune_1',
    durationSec: 3600,
    baseXp: 3286,
    baseGold: 219,
    goldVariance: 0.2,
    steps: [
      n('The signets are kept by the inquisition\'s interrogators — cold men who wring confessions from the frightened. The Forsaken agent marks one who patrols the library cloister alone.'),
      c('A Scarlet interrogator turns from his grim work, signet glinting on his glove. "Another heretic delivered to my hands. How convenient."', 'Scarlet Interrogator', 'elite'),
      n('You take the signet from his still hand. The cloister gates unlock to its sigil one by one — library, armory, cathedral. The Scarlet Monastery is open to you.'),
    ],
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
