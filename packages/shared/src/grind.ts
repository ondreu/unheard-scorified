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
import { ZONES, allZones, type ZoneId } from './data/zones';
import { questFoeStats, simulateQuestEncounter, type QuestRunResult } from './quest-run';
import type { QuestEnemyTier } from './data/quests';
import { BESTIARY, enemyTemplatesNearCr } from './data/enemies';
import { crForContentLevel } from './data/damage';
import { SeededRng } from './rng';

/** Pauza mezi kroky v timeline logu (s) — drobné odsazení jako u questů. */
const STEP_GAP_SEC = 2;

/**
 * Auto-odvození zóny pro questing z levelu postavy (hráč zónu nevolí — level
 * flexuje s ním). Vybere zónu, do jejíhož rozsahu level spadá; jinak nejvyšší
 * odemčenou (level ≥ minLevel). Zóny jsou neutrální a brackety se překrývají
 * (dvě zóny na bracket) → deterministicky se bere první v pořadí `allZones`
 * (seřazeno dle minLevel, pak dle ZONE_IDS). Zóna určuje loot bracket + flavor
 * nepřátele; level pro odměny zůstává surový (`params.level`).
 */
export function questingZoneForLevel(level: number): ZoneId {
  const zones = allZones();
  let pick = zones[0]!;
  for (const z of zones) {
    if (level >= z.minLevel) pick = z; // nejvyšší odemčená
    if (level >= z.minLevel && level <= z.maxLevel) return z.id; // přesný rozsah
  }
  return pick.id;
}

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
  // Nepřátelé se táhnou z **celého katalogu** dle CR zakotveného levelu (žádný
  // per-zone seznam) → grind potkává reálné katalogové nestvůry s identitou,
  // typovými obranami a ability; magnitudu dál řídí `questFoeStats` z levelu/tieru.
  const pool = enemyTemplatesNearCr(crForContentLevel(params.level), { limit: 8 });
  const steps: QuestRunResult['steps'] = [
    {
      kind: 'narrative',
      text: `${player.name} sets out into ${zone.name}, hunting and clearing whatever the wilds throw up — no particular quarry, just the long grind.`,
    },
  ];

  let t = 0;
  const count = encounterCount(durationSec);
  for (let i = 0; i < count; i++) {
    const templateId = pool[Math.floor(rng.next() * pool.length)] ?? pool[0]!;
    const name = BESTIARY[templateId]!.name;
    const tier = foeTier(rng);
    const enc = simulateQuestEncounter(
      player,
      questFoeStats({ name, tier, template: templateId }, params.level),
      rng,
      t,
    );
    t = enc.endT + STEP_GAP_SEC;
    steps.push({
      kind: 'combat',
      text: `You cross paths with ${name}.`,
      enemyName: name,
      templateId,
      events: enc.events,
      playerHpPct: enc.playerHpPct,
    });
  }

  steps.push({
    kind: 'narrative',
    text: `With the light fading over ${zone.name}, ${player.name} gathers up the spoils and heads back.`,
  });
  // Gone Questing nemá skill checky → neutrální odměna (1.0).
  return { steps, success: true, rewardMultiplier: 1 };
}
