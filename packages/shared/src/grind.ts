/**
 * Generický grind ("Gone grinding") — idle aktivita, kde hráč zvolí ZÓNU a
 * DÉLKU běhu místo výběru z konkrétních repeatable questů (rozhodnutí PM).
 *
 * Nahrazuje dřívější per-zone repeatable questy: funkčně ekvivalentní (stejná
 * XP/h kotva, loot z bracketu zóny — viz `computeGrindReward` v `activity.ts`),
 * ale s volnou délkou → fixuje „na nízkých levelech jen krátké questy" (level-1
 * hráč zařadí klidně 3h lov přes noc) a redukuje potřebu psát hromady questů.
 *
 * Tento modul drží: zakotvení levelu na rozsah zóny (snapshot při startu) a
 * generátor FLAVOR LOGU (recykluje quest combat engine, žádná duplikace).
 * Odměny řeší `activity.ts → computeGrindReward` (jediný zdroj pravdy balancu).
 */
import type { CombatActor } from './combat';
import { ZONES, zonesForFaction, type ZoneId } from './data/zones';
import type { Faction } from './data/races';
import { questFoeStats, simulateQuestEncounter, type QuestRunResult } from './quest-run';
import type { QuestEnemyTier } from './data/quests';
import { SeededRng } from './rng';

/** Pauza mezi kroky v timeline logu (s) — drobné odsazení jako u questů. */
const STEP_GAP_SEC = 2;

/**
 * Auto-odvození zóny pro questing z levelu postavy a frakce (hráč zónu nevolí —
 * level flexuje s ním). Vybere zónu dané frakce, do jejíhož rozsahu level spadá;
 * jinak nejvyšší odemčenou (level ≥ minLevel). Zóna určuje loot bracket + flavor
 * nepřátele; level pro odměny zůstává surový (`params.level`).
 */
export function questingZoneForLevel(faction: Faction, level: number): ZoneId {
  const zones = zonesForFaction(faction).sort((a, b) => a.minLevel - b.minLevel);
  let pick = zones[0]!;
  for (const z of zones) {
    if (level >= z.minLevel) pick = z; // nejvyšší odemčená
    if (level >= z.minLevel && level <= z.maxLevel) return z.id; // přesný rozsah
  }
  return pick.id;
}

/**
 * Generické pooly nepřátel per zóna (flavor pro grind log). Žádný balanc —
 * konkrétní HP/AP odvodí `questFoeStats` z levelu a tieru. Drženo u grind logiky
 * (content), ať `zones.ts` zůstane čistá definice zón.
 */
export const GRIND_FOES: Record<ZoneId, string[]> = {
  // Alliance
  northshire: ['Kobold Tunneler', 'Defias Thug', 'Timber Wolf', 'Riverpaw Gnoll'],
  westfall: ['Defias Bandit', 'Harvest Golem', 'Coastal Murloc', 'Riverpaw Brute'],
  duskwood: ['Nightbane Worgen', 'Skeletal Raider', 'Black Widow', 'Restless Dead'],
  eastern_plaguelands: ['Plagued Ghoul', 'Scarlet Zealot', 'Carrion Vulture', 'Diseased Bear'],
  // Horde
  durotar: ['Valley Scorpid', 'Burning Blade Cultist', 'Razormane Boar', 'Mottled Raptor'],
  barrens: ['Bristleback Quilboar', 'Savannah Lion', 'Kolkar Centaur', 'Plainstrider'],
  thousand_needles: ['Grimtotem Brave', 'Galak Ogre', 'Screeching Harpy', 'Salt Flat Lizard'],
  felwood: ['Tainted Furbolg', 'Shadow Council Satyr', 'Felpine Wolf', 'Corrupt Sprite'],
};

/** Počet soubojů ve flavor logu dle délky — víc času = víc střetů (clamp 2..6). */
function encounterCount(durationSec: number): number {
  return Math.max(2, Math.min(6, Math.round(durationSec / 1200)));
}

/** Tier nepřítele pro daný střet (většinou minion/standard, občas elite). */
function foeTier(rng: SeededRng): QuestEnemyTier {
  const r = rng.next();
  if (r < 0.55) return 'minion';
  if (r < 0.9) return 'standard';
  return 'elite';
}

/**
 * Vygeneruje flavor log grindu: úvodní beat + sekvence auto-resolved soubojů s
 * generickými nepřáteli zóny (NELZE prohrát, stejně jako quest combat) + závěr.
 * Recykluje `simulateQuestEncounter` — žádná duplikace per-hit vzorců. Seed je
 * stejný jako pro odměny → log je reprodukovatelný a serverem validovatelný.
 */
export function simulateGrindRun(
  params: { zoneId: ZoneId; level: number },
  player: CombatActor,
  durationSec: number,
  seed: number,
): QuestRunResult {
  const rng = new SeededRng(seed);
  const zone = ZONES[params.zoneId];
  const foes = GRIND_FOES[params.zoneId];
  const steps: QuestRunResult['steps'] = [
    {
      kind: 'narrative',
      text: `${player.name} sets out into ${zone.name}, hunting and clearing whatever the wilds throw up — no particular quarry, just the long grind.`,
    },
  ];

  let t = 0;
  const count = encounterCount(durationSec);
  for (let i = 0; i < count; i++) {
    const name = foes[Math.floor(rng.next() * foes.length)] ?? 'a roaming foe';
    const tier = foeTier(rng);
    const enc = simulateQuestEncounter(player, questFoeStats({ name, tier }, params.level), rng, t);
    t = enc.endT + STEP_GAP_SEC;
    steps.push({
      kind: 'combat',
      text: `You cross paths with ${name}.`,
      enemyName: name,
      events: enc.events,
      playerHpPct: enc.playerHpPct,
    });
  }

  steps.push({
    kind: 'narrative',
    text: `With the light fading over ${zone.name}, ${player.name} gathers up the spoils and heads back.`,
  });
  return { steps };
}
