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
