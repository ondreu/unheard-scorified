/**
 * Quest narrative + combat engine (M9 quest overhaul).
 *
 * Idle-first (rozhodnutí PM): quest zůstává JEDEN idle běh (timer). Při claimu se
 * z deterministického seedu vygeneruje celý PŘÍBĚHOVÝ LOG — narativní beaty
 * prokládané auto-resolved combaty. Hráč se „vrátí a přečte, co se stalo"; žádná
 * nová nutná interakce.
 *
 * Combat NELZE prohrát (rozhodnutí PM): silnější postava = rychlejší/čistší boj
 * (vyšší zbylé HP), slabší = víc utržených ran, ale quest se vždy dokončí →
 * idle progres nikdy nezamrzne. Log je čistě flavor vrstva nad odměnami
 * (`computeQuestReward` se NEmění → balanc zůstává netknutý).
 *
 * Repeatable questy: z `quest.events` se deterministicky vybere podmnožina →
 * pokaždé se quest „odehraje" trochu jinak.
 *
 * Veškerá náhoda jen přes `SeededRng` (anti-cheat, reprodukovatelnost, viz CLAUDE.md).
 */
import {
  abilityDamageMult,
  applyAbsorb,
  buildEnemyActor,
  computeHit,
  round1,
  type CombatActor,
  type CombatEvent,
  type EnemyStats,
} from './combat';
import {
  type QuestDef,
  type QuestEnemyTier,
  type QuestFoe,
  type QuestStep,
} from './data/quests';
import { SeededRng } from './rng';

/**
 * Násobiče HP/AP nepřítele dle tieru. Konkrétní staty se odvodí z levelu questu
 * × těchto faktorů → autor questu řeší jen jméno + tier. Čísla jsou schválně
 * skromná (boj je flavor, nelze prohrát) — i mírně podlevelovaná postava vyhraje,
 * jen s nižším zbylým HP.
 */
const TIER_SCALE: Record<QuestEnemyTier, { hp: number; ap: number; boss: boolean }> = {
  minion: { hp: 0.45, ap: 0.5, boss: false },
  standard: { hp: 1, ap: 0.85, boss: false },
  elite: { hp: 1.9, ap: 1.1, boss: false },
  boss: { hp: 3.2, ap: 1.35, boss: true },
};

/** Cap délky jednoho encounteru (s) — flavor log nesmí být nekonečný. */
const QUEST_ENCOUNTER_MAX_SEC = 90;
/** Pauza mezi kroky v timeline logu (s). */
const STEP_GAP_SEC = 2;

/** Odvodí staty questového nepřítele z levelu questu a tieru (deterministicky, bez RNG). */
export function questFoeStats(foe: QuestFoe, questLevel: number): EnemyStats {
  const s = TIER_SCALE[foe.tier];
  const lvl = Math.max(1, questLevel);
  return {
    name: foe.name,
    maxHealth: Math.round((40 + lvl * 24) * s.hp),
    attackPower: round1((3 + lvl * 1.5) * s.ap),
    swingInterval: foe.tier === 'boss' ? 2.8 : 2.4,
    isBoss: s.boss,
  };
}

/** Výsledek jednoho questového souboje. */
export interface QuestEncounterOutcome {
  events: CombatEvent[];
  /** Čas v timeline (s), kdy souboj skončil. */
  endT: number;
  /** Zbylé HP postavy v % (0..100) — flavor „jak čistý byl boj". */
  playerHpPct: number;
}

/** Útočné ability postavy použitelné v questovém combatu (heal/shield/mitigation se přeskakuje). */
function offensiveAbilities(player: CombatActor) {
  return player.signatureAbilities.filter(
    (a) => a.kind === 'strike' || a.kind === 'drain' || a.kind === 'dot',
  );
}

/**
 * Auto-resolved souboj postava-vs-nepřítel (sólo, NELZE prohrát). Recykluje
 * `computeHit`/`applyAbsorb` z combat enginu (žádná duplikace per-hit vzorců).
 * Postava nikdy neklesne pod 1 HP (clamp) → quest se vždy dokončí.
 */
export function simulateQuestEncounter(
  player: CombatActor,
  foeStats: EnemyStats,
  rng: SeededRng,
  startT: number,
): QuestEncounterOutcome {
  const enemy = buildEnemyActor(foeStats);
  const events: CombatEvent[] = [];
  let playerHp = player.maxHealth;
  let playerShield = player.shield;
  let enemyHp = enemy.maxHealth;

  const abilities = offensiveAbilities(player);
  const readyAt: Record<string, number> = {};
  for (const a of abilities) readyAt[a.id] = startT; // ready od startu

  let t = startT;
  let pNext = startT + player.swingInterval;
  let eNext = startT + enemy.swingInterval;

  events.push({
    t: round1(startT),
    type: 'encounter_start',
    message: `⚔️ ${player.name} engages ${enemy.name}.`,
    source: player.name,
    target: enemy.name,
    targetHealthRemaining: enemyHp,
  });

  const hardStop = startT + QUEST_ENCOUNTER_MAX_SEC;
  while (enemyHp > 0 && t < hardStop) {
    if (pNext <= eNext) {
      t = pNext;
      pNext = t + player.swingInterval;
      const ready = abilities.find((a) => (readyAt[a.id] ?? startT) <= t);
      let mult = 1;
      let abilityName: string | undefined;
      if (ready) {
        mult = abilityDamageMult(ready, enemyHp / enemy.maxHealth);
        abilityName = ready.name;
        readyAt[ready.id] = t + ready.cooldownSec;
      }
      const hit = computeHit(player, enemy, rng, mult, false);
      enemyHp = Math.max(0, enemyHp - hit.amount);
      if (player.lifesteal > 0 && enemyHp >= 0) {
        playerHp = Math.min(player.maxHealth, playerHp + Math.round(hit.amount * player.lifesteal));
      }
      events.push({
        t: round1(t),
        type: abilityName ? 'ability' : 'attack',
        message: abilityName
          ? `✨ ${player.name} hits ${enemy.name} with ${abilityName} for ${hit.amount}${hit.crit ? ' (crit!)' : ''}.`
          : `${player.name} strikes ${enemy.name} for ${hit.amount}${hit.crit ? ' (crit!)' : ''}.`,
        source: player.name,
        target: enemy.name,
        amount: hit.amount,
        crit: hit.crit,
        ability: abilityName,
        targetHealthRemaining: enemyHp,
      });
    } else {
      t = eNext;
      eNext = t + enemy.swingInterval;
      const hit = computeHit(enemy, player, rng, 1, false);
      const absorb = applyAbsorb(hit.amount, playerShield);
      playerShield = absorb.shieldRemaining;
      playerHp = Math.max(1, playerHp - absorb.netDamage); // no-fail clamp
      events.push({
        t: round1(t),
        type: 'attack',
        message:
          absorb.absorbed > 0
            ? `🛡️ ${enemy.name} hits ${player.name} for ${hit.amount} (${absorb.absorbed} absorbed).`
            : `${enemy.name} hits ${player.name} for ${hit.amount}.`,
        source: enemy.name,
        target: player.name,
        amount: hit.amount,
        targetHealthRemaining: playerHp,
      });
    }
  }

  events.push({
    t: round1(t),
    type: 'enemy_defeated',
    message:
      enemyHp > 0
        ? `After a grueling struggle, ${player.name} finally brings down ${enemy.name}.`
        : `${enemy.name} is defeated.`,
    source: player.name,
    target: enemy.name,
    targetHealthRemaining: 0,
  });

  return {
    events,
    endT: t,
    playerHpPct: Math.round((playerHp / Math.max(1, player.maxHealth)) * 100),
  };
}

/** Jeden krok vygenerovaného příběhového logu (narativní text nebo combat). */
export interface QuestStepResult {
  kind: 'narrative' | 'combat';
  /** Narativní próza, nebo úvodní věta combat kroku. */
  text: string;
  /** Jen combat: jméno nepřítele. */
  enemyName?: string;
  /** Jen combat: log souboje. */
  events?: CombatEvent[];
  /** Jen combat: zbylé HP postavy v % (flavor). */
  playerHpPct?: number;
}

export interface QuestRunResult {
  steps: QuestStepResult[];
}

/**
 * Deterministicky vybere podmnožinu událostí z poolu repeatable questu a poskládá
 * z nich kroky. Výběr je náhodný (seed = čas startu), ale pořadí drží autorské
 * pořadí poolu (čte se souvisle). Pokud pool chybí → jediný narativní beat.
 */
function generateRepeatableSteps(quest: QuestDef, rng: SeededRng): QuestStep[] {
  const pool = quest.events ?? [];
  if (pool.length === 0) return [{ kind: 'narrative', text: quest.description }];

  const count = Math.min(pool.length, quest.eventCount ?? 3);
  // Fisher–Yates shuffle indexů → vyber prvních `count` → seřaď zpět (souvislé pořadí).
  const idx = pool.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    const tmp = idx[i]!;
    idx[i] = idx[j]!;
    idx[j] = tmp;
  }
  const chosen = idx.slice(0, count).sort((a, b) => a - b);

  const steps: QuestStep[] = [{ kind: 'narrative', text: quest.description }];
  for (const i of chosen) {
    const e = pool[i]!;
    if (e.foe) steps.push({ kind: 'combat', intro: e.text, foe: e.foe });
    else steps.push({ kind: 'narrative', text: e.text });
  }
  return steps;
}

/**
 * Vygeneruje příběhový log questu. Jediný vstupní bod pro API (claim) i web.
 *
 * - `quest.steps`  → ručně napsaný story quest (kroky tak, jak jsou).
 * - `quest.events` → repeatable: deterministicky generovaná podmnožina.
 * - jinak          → fallback: jediný narativní beat z `description`.
 *
 * Combat kroky používají snapshot bojového profilu postavy (gear + talenty +
 * rotace) → silnější postava = čistší boj. Seed je stejný jako pro odměny
 * (`ActivityState.seed`) → log je reprodukovatelný a validovatelný serverem.
 */
export function simulateQuestRun(
  quest: QuestDef,
  player: CombatActor,
  seed: number,
): QuestRunResult {
  const rng = new SeededRng(seed);
  const steps: QuestStep[] = quest.steps
    ? quest.steps
    : quest.events
      ? generateRepeatableSteps(quest, rng)
      : [{ kind: 'narrative', text: quest.description }];

  const result: QuestStepResult[] = [];
  let t = 0;
  for (const step of steps) {
    if (step.kind === 'narrative') {
      result.push({ kind: 'narrative', text: step.text });
      continue;
    }
    const enc = simulateQuestEncounter(player, questFoeStats(step.foe, quest.requiredLevel), rng, t);
    t = enc.endT + STEP_GAP_SEC;
    result.push({
      kind: 'combat',
      text: step.intro,
      enemyName: step.foe.name,
      events: enc.events,
      playerHpPct: enc.playerHpPct,
    });
  }
  return { steps: result };
}

/** Má quest vícekrokový příběh (story kroky nebo náhodné události)? */
export function questHasNarrative(quest: QuestDef): boolean {
  return (quest.steps?.length ?? 0) > 0 || (quest.events?.length ?? 0) > 0;
}
