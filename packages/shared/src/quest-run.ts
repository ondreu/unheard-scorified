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
  abilityDamageSpec,
  abilityOnceAvailable,
  actorSpellSaveDc,
  applyAbsorb,
  applyRage,
  bonusDiceSpec,
  buildEnemyActor,
  canRage,
  dotTickRaw,
  markAbilityUsed,
  healDiceSpec,
  resolveAttack,
  round1,
  type CombatActor,
  type CombatEvent,
  type EnemyStats,
} from './combat';
import { rollDice } from './dice';
import { applySpellSave, buildDndAttackMessage, buildSaveMessage, rollInitiative, savingThrow } from './dnd-combat';
import { applyDamageInteraction, crForContentLevel, damageInteraction, type DamageType } from './data/damage';
import { abilityPrefersUpcast, spendSlotForTier, type SpellSlots } from './data/spell-slots';
import { shouldCastHeal } from './rotation';
import type { SignatureAbility } from './data/abilities';
import {
  type QuestDef,
  type QuestEnemyTier,
  type QuestFoe,
  type QuestStep,
} from './data/quests';
import { SeededRng } from './rng';

/** Ordinální tvar tieru slotu pro log (1→1st, 2→2nd, 3→3rd, jinak Nth). */
function ordinal(n: number): string {
  if (n === 1) return '1st';
  if (n === 2) return '2nd';
  if (n === 3) return '3rd';
  return `${n}th`;
}

/** Je daný tier „boss" (tvrdší dpr faktor + boss flag v logu)? */
const TIER_IS_BOSS: Record<QuestEnemyTier, boolean> = {
  minion: false,
  standard: false,
  elite: false,
  boss: true,
};

/** Cap délky jednoho encounteru (s) — flavor log nesmí být nekonečný. */
const QUEST_ENCOUNTER_MAX_SEC = 90;
/**
 * Bump efektivní úrovně nepřátel u combat-objective questů (ADR 0032) — tyhle
 * „proving fight" questy jsou záměrně smrtelné na holém requiredLevel; připravený
 * hráč (gear / vyšší level) je zvládne. Laditelné (čísla, ne model).
 */
const COMBAT_OBJECTIVE_LEVEL_BUMP = 6;
/** Pauza mezi kroky v timeline logu (s). */
const STEP_GAP_SEC = 2;

/**
 * Posun Challenge Ratingu questového nepřítele dle tieru (vůči CR úrovně questu).
 * Vyšší tier = vyšší CR → tvrdší zásah i vyšší šance zasáhnout postavu. AC /
 * útočný bonus / save DC se pak berou z `crStatGuide` (DMG). MR-10.
 */
const TIER_CR_OFFSET: Record<QuestEnemyTier, number> = {
  minion: -2,
  standard: 0,
  elite: 1,
  boss: 2,
};

/** Odvodí staty questového nepřítele z levelu questu a tieru (deterministicky, bez RNG). */
export function questFoeStats(foe: QuestFoe, questLevel: number): EnemyStats {
  const lvl = Math.max(1, questLevel);
  // Literal D&D magnitudy (ADR 0032): HP/AP i AC/attackBonus/save DC se odvodí z
  // Challenge Ratingu (CR úrovně questu + posun tieru, clampnuto). `buildEnemyActor`
  // dopočítá staty z `challengeRating`. Boj je flavor (nelze prohrát).
  const cr = Math.max(0, Math.min(30, crForContentLevel(lvl) + TIER_CR_OFFSET[foe.tier]));
  return {
    name: foe.name,
    swingInterval: foe.tier === 'boss' ? 2.8 : 2.4,
    isBoss: TIER_IS_BOSS[foe.tier],
    challengeRating: cr,
  };
}

/** Výsledek jednoho questového souboje. */
export interface QuestEncounterOutcome {
  events: CombatEvent[];
  /** Čas v timeline (s), kdy souboj skončil. */
  endT: number;
  /** Zbylé HP postavy v % (0..100) — flavor „jak čistý byl boj". */
  playerHpPct: number;
  /**
   * Jen `allowDefeat` (combat-objective questy): postava boj prohrála (padla,
   * nebo nestihla nepřítele dorazit v čase). U no-fail flavor combatu vždy `false`.
   */
  playerDefeated: boolean;
}

/** Útočné ability postavy použitelné v questovém combatu (heal/shield/mitigation se přeskakuje). */
function offensiveAbilities(player: CombatActor) {
  return player.signatureAbilities.filter(
    (a) => a.kind === 'strike' || a.kind === 'drain' || a.kind === 'dot',
  );
}

/** Léčivé ability postavy (heal-kind) — solo self-sustain healera v questovém combatu. */
function healAbilities(player: CombatActor) {
  return player.signatureAbilities.filter((a) => a.kind === 'heal');
}

/**
 * Healer self-sustain (solo quest combat): healer (cleric/druid/bard/paladin/ranger)
 * se v sólo questu „nemá koho léčit", proto ošetří sebe. **Kdy** se léčí řídí
 * rotace postavy (`shouldCastHeal`): „když pod N % HP použij X spell" — hráč nastaví
 * práh/spell/vypnutí; bez pravidla = default `self_hp_below` 0.5. Léčení čerpá spell
 * slot (tier ≥ 1) jako každé jiné kouzlo.
 */
/** Heal = `attackPower × damageMult × HEAL_POWER_FACTOR × falloff` (sdílí konvenci s Gauntletem). */
const HEAL_POWER_FACTOR = 0.6;
/** Spam-ochrana: každý další heal v souboji je slabší (jako Gauntlet `healFalloff`). */
function healFalloff(healsUsed: number): number {
  return Math.max(0.3, 1 - 0.15 * healsUsed);
}

/**
 * Auto-resolved souboj postava-vs-nepřítel (sólo). Recykluje `computeHit`/
 * `applyAbsorb` z combat enginu (žádná duplikace per-hit vzorců).
 *
 * - `allowDefeat = false` (default, flavor combat): postava nikdy neklesne pod
 *   1 HP (clamp) → quest se vždy dokončí, boj je čistě flavor.
 * - `allowDefeat = true` (combat-objective questy): boj se vyhodnotí doopravdy —
 *   slabá postava může **prohrát** (padne, nebo nestihne nepřítele dorazit v
 *   `QUEST_ENCOUNTER_MAX_SEC`) → `playerDefeated = true`. Reward gating řeší volající.
 */
export function simulateQuestEncounter(
  player: CombatActor,
  foeStats: EnemyStats,
  rng: SeededRng,
  startT: number,
  allowDefeat = false,
): QuestEncounterOutcome {
  const enemy = buildEnemyActor(foeStats);
  // Rage (ADR 0034): Barbarian se na začátku encounteru auto-rozzuří (charge-gated)
  // → resistance na fyzické poškození + rage damage bonus po celý souboj (idle
  // abstrakce D&D rage). Per-encounter rozpočet (jako spell sloty).
  if (canRage(player)) player = applyRage(player);
  const events: CombatEvent[] = [];
  let playerHp = player.maxHealth;
  let playerShield = player.shield;
  let enemyHp = enemy.maxHealth;

  const abilities = offensiveAbilities(player);
  const heals = healAbilities(player);
  let healsUsed = 0;
  const readyAt: Record<string, number> = {};
  for (const a of abilities) readyAt[a.id] = startT; // ready od startu
  for (const h of heals) readyAt[h.id] = startT;
  // Spell sloty (MR-4) jako rozpočet kouzel v rámci tohoto běhu — kouzla (tier ≥ 1)
  // ho čerpají; když dojdou, postava sáhne po zbrani/cantripu. Lokální kopie.
  const slotBudget: SpellSlots = { ...(player.spellSlots ?? {}) };
  // Ki body (ADR 0034) jako rozpočet Monkových technik (`kiCost`) v tomto souboji.
  let kiBudget = player.kiPoints ?? 0;
  // Akční ekonomika (ADR 0042): „once per combat" ability (Action Surge, opener
  // Assassinate) se v tomto souboji smí použít jen jednou — pak se „drží".
  const usedOnce = new Set<string>();

  // Initiative (d20 + DEX): rozhodne, kdo udeří jako první (D&D 5e).
  const playerInit = rollInitiative(player, rng);
  const enemyInit = rollInitiative(enemy, rng);
  const playerFirst = playerInit >= enemyInit;

  let t = startT;
  let pNext = playerFirst ? startT : startT + player.swingInterval;
  let eNext = playerFirst ? startT + enemy.swingInterval : startT;

  events.push({
    t: round1(startT),
    type: 'encounter_start',
    message: `⚔️ ${player.name} engages ${enemy.name}. Initiative — ${player.name}: ${playerInit}, ${enemy.name}: ${enemyInit}. ${playerFirst ? player.name : enemy.name} acts first.`,
    source: player.name,
    target: enemy.name,
    targetHealthRemaining: enemyHp,
  });

  const hardStop = startT + QUEST_ENCOUNTER_MAX_SEC;
  let playerDown = false;
  let enemyTurns = 0;
  // Aktivní DoTy na nepříteli (ADR 0036) — DoT reálně tiká v čase (Moonbeam, Spirit
  // Guardians…), ne jeden zásah. Tiky jsou deterministické (žádný RNG).
  interface QuestDot {
    next: number;
    interval: number;
    ticksLeft: number;
    damage: number;
    name: string;
  }
  const dots: QuestDot[] = [];
  while (enemyHp > 0 && t < hardStop) {
    // Nejbližší DoT tik — když nastane dřív než další úder, vyřeš ho.
    let dotIdx = -1;
    let dotAt = Infinity;
    for (let i = 0; i < dots.length; i++) {
      const d = dots[i]!;
      if (d.ticksLeft > 0 && d.next < dotAt) {
        dotAt = d.next;
        dotIdx = i;
      }
    }
    if (dotIdx >= 0 && dotAt <= pNext && dotAt <= eNext) {
      const d = dots[dotIdx]!;
      t = dotAt;
      enemyHp = Math.max(0, enemyHp - d.damage);
      d.ticksLeft -= 1;
      d.next += d.interval;
      events.push({
        t: round1(t),
        type: 'dot',
        source: player.name,
        target: enemy.name,
        amount: d.damage,
        ability: d.name,
        targetHealthRemaining: enemyHp,
        message: `🔥 ${enemy.name} suffers ${d.damage} from ${d.name}. ${enemy.name}: ${enemyHp} HP.`,
      });
      continue;
    }
    if (pNext <= eNext) {
      t = pNext;
      pNext = t + player.swingInterval;
      // Healer self-sustain (solo): když to dovolí rotace (default `self_hp_below`
      // 0.5; hráč přebije prahem/always/vypnutím) a postava není na plné HP, sešle
      // heal (spálí slot) místo útoku. Group obsah léčí spoluhráče (jiný engine).
      if (heals.length > 0 && playerHp < player.maxHealth) {
        const healCtx = {
          enemyHpPct: enemy.maxHealth > 0 ? enemyHp / enemy.maxHealth : 0,
          selfHpPct: player.maxHealth > 0 ? playerHp / player.maxHealth : 0,
        };
        let healChosen: SignatureAbility | undefined;
        let healSlotTier: number | null = null;
        for (const h of heals) {
          if ((readyAt[h.id] ?? startT) > t) continue;
          if (!shouldCastHeal(player.rotation, h.id, healCtx)) continue; // rotace rozhoduje
          const tier = h.spellTier ?? 0;
          if (tier >= 1) {
            // Upcast healu nejvyšším slotem (ADR 0036): Cure Wounds 1d8 → na vyšším
            // levelu 6d8+ (D&D upcasting) → literal heal drží krok s magnitudou HP/boss.
            const used = spendSlotForTier(slotBudget, tier, abilityPrefersUpcast(h) || h.dicePerSlotAbove != null);
            if (used == null) continue; // bez slotu → drží
            healSlotTier = used;
          }
          healChosen = h;
          readyAt[h.id] = t + h.cooldownSec;
          break;
        }
        if (healChosen) {
          // Literal D&D heal (ADR 0036): Cure Wounds 1d8 + spellMod (+ upcast), žádné
          // „% healing power". Limit = spell sloty (ne falloff). Legacy heal bez
          // literal kostek (raid sim knob) škáluje dál přes attackPower.
          const healSpec = healDiceSpec(healChosen, healSlotTier, player);
          const healed = healSpec
            ? Math.max(1, rollDice(rng, healSpec.count, healSpec.sides).total + healSpec.bonus)
            : Math.max(
                1,
                Math.round(player.attackPower * healChosen.damageMult * HEAL_POWER_FACTOR * healFalloff(healsUsed)),
              );
          playerHp = Math.min(player.maxHealth, playerHp + healed);
          healsUsed++;
          events.push({
            t: round1(t),
            type: 'heal',
            message: `✨ ${player.name} casts ${healChosen.name}, healing for ${healed}. ${player.name}: ${playerHp} HP.`,
            source: player.name,
            target: player.name,
            amount: healed,
            ability: healChosen.name,
          });
          continue;
        }
      }
      // Zvol první ready ability, kterou lze seslat (cantrip/martial zdarma, kouzlo
      // jen když je volný slot). Když nic → základní úder zbraní.
      let chosen: SignatureAbility | undefined;
      let slotTier: number | null = null;
      for (const a of abilities) {
        if ((readyAt[a.id] ?? startT) > t) continue;
        // Akční ekonomika (ADR 0042): „once per combat" ability už vyčerpaná → drž ji.
        if (!abilityOnceAvailable(usedOnce, a)) continue;
        // Ki (ADR 0034): Monkova technika potřebuje dost Ki; jinak se „drží" (→ basic).
        const kiCost = a.kiCost ?? 0;
        if (kiCost > kiBudget) continue;
        const tier = a.spellTier ?? 0;
        if (tier >= 1) {
          const used = spendSlotForTier(slotBudget, tier, abilityPrefersUpcast(a));
          if (used == null) continue; // žádný slot → kouzlo fizzles, zkus další
          slotTier = used;
        }
        if (kiCost > 0) kiBudget -= kiCost;
        markAbilityUsed(usedOnce, a); // spotřebuj „once per combat" okno (no-op bez flagu)
        chosen = a;
        readyAt[a.id] = t + a.cooldownSec;
        break;
      }
      // Literal D&D spell dice (ADR 0032): kouzla s `dice` (Fireball 8d6) jdou přímo
      // jako kostky (mult = 1); martial techniky/drainy škálují přes `attackPower`
      // (mult = damageMult + execute). Upcast dle slotu, kterým bylo kouzlo sesláno.
      const spec = chosen ? abilityDamageSpec(chosen, slotTier, player.level) : undefined;
      const mult = chosen && !spec ? abilityDamageMult(chosen, enemyHp / enemy.maxHealth) : 1;
      // Bonus kostky na weapon hit (ADR 0036) + advantage — D&D martial maneuvery
      // (Sneak Attack +Nd6, Divine Smite +2d8, Reckless Attack advantage).
      const bonus = chosen ? bonusDiceSpec(chosen, slotTier, player.level) : undefined;
      // Per-ability typ poškození (MR-10d) — kouzlo přebíjí typ classy (Magic
      // Missile = force…); undefined → zdědí typ zbraně/classy útočníka.
      const result = resolveAttack(player, enemy, rng, {
        abilityMult: mult,
        damageType: chosen?.damageType,
        damageSpec: spec,
        autoHit: chosen?.autoHit,
        advantage: chosen?.advantage ? 'advantage' : undefined,
        bonusDice: bonus,
      });

      // Per-spell saving throw (ADR 0032): kouzlo s `save` → nepřítel si hodí
      // záchranný hod proti spell save DC (úspěch = půlka / nula dle efektu).
      let saveMessage: string | undefined;
      if (result.hit && chosen?.save) {
        const outcome = applySpellSave(chosen, player, enemy, rng, result.amount);
        result.amount = outcome.amount;
        saveMessage = outcome.message;
      }

      if (result.hit) enemyHp = Math.max(0, enemyHp - result.amount);
      let healed = 0;
      if (result.hit) {
        if (player.lifesteal > 0) healed += Math.round(result.amount * player.lifesteal);
        if (chosen?.kind === 'drain' && chosen.drainHealFraction) {
          healed += Math.round(result.amount * chosen.drainHealFraction);
        }
        if (healed > 0) playerHp = Math.min(player.maxHealth, playerHp + healed);
      }

      // DoT (ADR 0036): kouzlo typu „dot" na zásah aplikuje poškození v čase —
      // tiky se zařadí do časové smyčky (Moonbeam 2d10/tik, Spirit Guardians 3d8/tik).
      // Tik respektuje typ + obrany cíle (jako přímý zásah). Refresh při dalším seslání.
      if (result.hit && chosen?.kind === 'dot' && chosen.dotTicks && chosen.dotDurationSec) {
        const dotType: DamageType = chosen.damageType ?? player.damageType ?? 'bludgeoning';
        const interaction = damageInteraction(dotType, enemy);
        const raw = dotTickRaw(chosen, player);
        const tick = interaction === 'immune' ? 0 : Math.max(1, applyDamageInteraction(Math.max(1, raw), interaction));
        const existing = dots.find((d) => d.name === chosen.name);
        const interval = chosen.dotDurationSec / chosen.dotTicks;
        if (existing) {
          existing.ticksLeft = chosen.dotTicks;
          existing.damage = tick;
          existing.interval = interval;
          existing.next = t + interval;
        } else {
          dots.push({ next: t + interval, interval, ticksLeft: chosen.dotTicks, damage: tick, name: chosen.name });
        }
      }

      const slotNote = slotTier != null ? ` (${ordinal(slotTier)}-level slot)` : undefined;
      events.push({
        t: round1(t),
        type: !result.hit ? 'attack' : healed > 0 ? 'drain' : chosen ? 'ability' : 'attack',
        message: buildDndAttackMessage({
          attackerName: player.name,
          targetName: enemy.name,
          result,
          abilityName: chosen?.name,
          slotNote,
          healed,
          suffix: result.hit ? ` ${enemy.name}: ${enemyHp} HP.` : '',
        }),
        source: player.name,
        target: enemy.name,
        amount: result.amount,
        crit: result.crit,
        ability: chosen?.name,
        targetHealthRemaining: enemyHp,
      });
      if (saveMessage) {
        events.push({ t: round1(t), type: 'ability', message: saveMessage, source: enemy.name });
      }
    } else {
      t = eNext;
      eNext = t + enemy.swingInterval;
      // Boss občas (každý 3. tah) sešle telegrafovaný „special" — silnější úder
      // (1.6×), proti kterému si postava hodí DEX save (úspěch = poloviční dmg).
      // Běžné údery jdou plnou silou → boss zůstává hrozbou (balanc = MR-10).
      const special = enemy.isBoss && ++enemyTurns % 3 === 0;
      const result = resolveAttack(enemy, player, rng, { abilityMult: special ? 1.6 : 1 });

      let dmg = result.amount;
      let saveMessage: string | undefined;
      if (result.hit && special) {
        const save = savingThrow(player, rng, 'dexterity', actorSpellSaveDc(enemy));
        if (save.success) dmg = Math.max(1, Math.floor(dmg / 2));
        saveMessage = buildSaveMessage(player.name, 'dexterity', save, true);
      }

      let absorbedNote = '';
      if (result.hit) {
        const absorb = applyAbsorb(dmg, playerShield);
        playerShield = absorb.shieldRemaining;
        if (absorb.absorbed > 0) absorbedNote = ` 🛡️ ${absorb.absorbed} absorbed.`;
        // No-fail clamp (flavor combat) vs. reálný výsledek (combat-objective questy).
        playerHp = allowDefeat
          ? playerHp - absorb.netDamage
          : Math.max(1, playerHp - absorb.netDamage);
      }

      events.push({
        t: round1(t),
        type: 'attack',
        message: buildDndAttackMessage({
          attackerName: enemy.name,
          targetName: player.name,
          result: { ...result, amount: dmg },
          abilityName: special ? 'a savage onslaught' : undefined,
          suffix: result.hit ? `${absorbedNote} ${player.name}: ${Math.max(0, playerHp)} HP.` : '',
        }),
        source: enemy.name,
        target: player.name,
        amount: dmg,
        crit: result.crit,
        targetHealthRemaining: Math.max(0, playerHp),
      });
      if (saveMessage) {
        events.push({ t: round1(t), type: 'ability', message: saveMessage, source: player.name });
      }
      if (allowDefeat && playerHp <= 0) {
        playerDown = true;
        break;
      }
    }
  }

  // Combat-objective prohra = postava padla, nebo nestihla nepřítele dorazit v čase.
  const defeated = allowDefeat && (playerDown || enemyHp > 0);
  if (defeated) {
    events.push({
      t: round1(t),
      type: 'player_defeated',
      message: playerDown
        ? `${enemy.name} cuts ${player.name} down. The objective slips away.`
        : `${player.name} cannot bring down ${enemy.name} in time and is forced to retreat.`,
      source: enemy.name,
      target: player.name,
      targetHealthRemaining: 0,
    });
  } else {
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
  }

  return {
    events,
    endT: t,
    playerHpPct: Math.max(0, Math.round((playerHp / Math.max(1, player.maxHealth)) * 100)),
    playerDefeated: defeated,
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
  /** Jen combat-objective questy: tenhle souboj postava prohrála. */
  defeated?: boolean;
}

export interface QuestRunResult {
  steps: QuestStepResult[];
  /**
   * Splnil hráč cíl questu? U flavor questů i grindu vždy `true` (nelze prohrát).
   * U combat-objective questů `false`, pokud prohrál některý souboj → volající
   * nepřipíše odměnu a quest nedokončí (lze opakovat). Viz `QuestDef.combatObjective`.
   */
  success: boolean;
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
  // Combat-objective questy (rozhodnutí PM): souboj se vyhodnotí doopravdy a lze
  // prohrát → odměna gatovaná vítězstvím. Default flavor combat (nelze prohrát).
  const allowDefeat = quest.combatObjective === true;
  // „Come prepared" obtížnost (ADR 0032): combat-objective quest je záměrně
  // smrtelný na holém requiredLevel (viz popisy questů) → nepřátelé dostanou bump
  // efektivní úrovně (vyšší CR HP/dmg). Připravený hráč (gear / vyšší level) vyhraje.
  const foeLevel = quest.requiredLevel + (allowDefeat ? COMBAT_OBJECTIVE_LEVEL_BUMP : 0);
  const steps: QuestStep[] = quest.steps
    ? quest.steps
    : quest.events
      ? generateRepeatableSteps(quest, rng)
      : [{ kind: 'narrative', text: quest.description }];

  const result: QuestStepResult[] = [];
  let t = 0;
  let success = true;
  for (const step of steps) {
    if (step.kind === 'narrative') {
      result.push({ kind: 'narrative', text: step.text });
      continue;
    }
    const enc = simulateQuestEncounter(
      player,
      questFoeStats(step.foe, foeLevel),
      rng,
      t,
      allowDefeat,
    );
    t = enc.endT + STEP_GAP_SEC;
    result.push({
      kind: 'combat',
      text: step.intro,
      enemyName: step.foe.name,
      events: enc.events,
      playerHpPct: enc.playerHpPct,
      defeated: enc.playerDefeated || undefined,
    });
    // Prohra ukončí příběh tady — co se nepovedlo, to hráč zopakuje.
    if (enc.playerDefeated) {
      success = false;
      break;
    }
  }
  return { steps: result, success };
}

/** Má quest vícekrokový příběh (story kroky nebo náhodné události)? */
export function questHasNarrative(quest: QuestDef): boolean {
  return (quest.steps?.length ?? 0) > 0 || (quest.events?.length ?? 0) > 0;
}
