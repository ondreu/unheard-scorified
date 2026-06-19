/**
 * **Group PVE run engine** (legacy název `raid` — raidy jako herní mód byly
 * vyříznuty, viz ADR 0033). Tento modul drží sdílenou simulaci skupinového boje
 * **party N aktérů s rolemi vs sekvence encounterů** — používá ji **dungeon**
 * (SP 1 dps i group 3/5) a sandbox trénovací terč (rotace). Recykluje
 * deterministický combat engine z M5 (`computeHit`, `CombatActor`, `CombatEvent`)
 * — žádná duplikace bojových vzorců (viz CLAUDE.md). Názvy `Raid*`/`RAID_*`
 * zůstávají jako interní legacy (minimální řez, ADR 0033).
 *
 * Role (rozhodnutí PM, MVP 5 hráčů = 1 tank / 1 heal / 3 dps):
 *  - `tank`   — víc HP, míň dmg, na něj boss útočí (a bere zmírněné poškození).
 *  - `healer` — léčí nejzraněnějšího spoluhráče místo útoku; minimální vlastní dmg.
 *  - `dps`    — plné poškození bossovi.
 *
 * Boss útočí na tanka (první živý tank, jinak nejodolnější živý člen jako off-tank),
 * po `RAID_ENRAGE_SEC` „enrage" (eskalace dmg → konečné rozhodnutí). Když padne celá
 * party = wipe (defeat). Mezi bossy se party částečně doléčí.
 *
 * Veškerá náhoda jen přes `SeededRng` (anti-cheat, reprodukovatelnost). Viz ADR 0011.
 */
import { SeededRng } from './rng';
import {
  abilityDamageMult,
  abilityDamageSpec,
  applyAbsorb,
  applyRage,
  bonusDiceSpec,
  buildAttackMessage,
  buildEnemyActor,
  canRage,
  computeHit,
  determinationFactor,
  dotTickRaw,
  round1,
  type CombatActor,
  type CombatEvent,
  type SignatureAbility,
} from './combat';
import { isAbilityEnabled, shouldCastAbility } from './rotation';
import { applySpellSave, missMessage, rollTag } from './dnd-combat';
import { applyDamageInteraction, damageInteraction } from './data/damage';
import { abilityPrefersUpcast, spendSlotForTier, type SpellSlots } from './data/spell-slots';

export type RaidRole = 'tank' | 'healer' | 'dps';

export const RAID_ROLES: RaidRole[] = ['tank', 'healer', 'dps'];

export function isRaidRole(value: string): value is RaidRole {
  return RAID_ROLES.includes(value as RaidRole);
}

/** Složení party (počet aktérů per role). Součet = velikost raidu. */
export interface RaidComposition {
  tank: number;
  healer: number;
  dps: number;
}

/** Podporované velikosti raidu (modern-WoW styl): 5 / 10 / 20 hráčů. */
export const RAID_SIZES = [5, 10, 20] as const;
export type RaidSize = (typeof RAID_SIZES)[number];

/** Základní (canonical) velikost pro škálování bossů. */
export const RAID_BASE_SIZE = 5;

export function isRaidSize(value: number): value is RaidSize {
  return (RAID_SIZES as readonly number[]).includes(value);
}

/** Default kompozice per velikost (klasický poměr ~1 healer na 4-5, 2 tanky výš). */
const DEFAULT_COMPOSITIONS: Record<number, RaidComposition> = {
  5: { tank: 1, healer: 1, dps: 3 },
  10: { tank: 2, healer: 2, dps: 6 },
  20: { tank: 2, healer: 5, dps: 13 },
};

/** Default kompozice pro danou velikost (fallback proporčně pro nestandardní). */
export function defaultRaidComposition(size: number): RaidComposition {
  const preset = DEFAULT_COMPOSITIONS[size];
  if (preset) return preset;
  const tank = Math.max(1, Math.round(size * 0.15));
  const healer = Math.max(1, Math.round(size * 0.22));
  return { tank, healer, dps: Math.max(0, size - tank - healer) };
}

export function compositionSize(comp: RaidComposition): number {
  return comp.tank + comp.healer + comp.dps;
}

/**
 * Validuje hráčem zvolenou kompozici: nezáporné celočíselné počty, součet = `size`
 * a alespoň jeden slot role hráče (tu hráč obsazuje). Jinak je comp libovolný —
 * špatný poměr (málo healerů / dps) je strategická volba hráče (může vést k wipu).
 */
export function isValidComposition(
  comp: RaidComposition,
  size: number,
  playerRole: RaidRole,
): boolean {
  for (const r of RAID_ROLES) {
    const n = comp[r];
    if (!Number.isInteger(n) || n < 0) return false;
  }
  if (compositionSize(comp) !== size) return false;
  return comp[playerRole] >= 1;
}

// Zpětně kompatibilní MVP default (velikost 5).
export const RAID_COMPOSITION: RaidComposition = DEFAULT_COMPOSITIONS[5]!;
export const RAID_PARTY_SIZE = compositionSize(RAID_COMPOSITION);

// ── Role tuning (laditelný balanc, vyladí se v M9) ──────────────────────────
/** Tank: víc HP, míň dmg, zmírněné příchozí poškození. */
const TANK_HP_MULT = 1.6;
const TANK_DAMAGE_MULT = 0.5;
const TANK_MITIGATION = 0.65;
/**
 * Podíl příchozího poškození, který tank skutečně schytá (po mitigaci). Sdíleno
 * s tahovým group enginem (`dungeon-run.ts`), aby tankování fungovalo stejně
 * v auto-resolve i tahovém režimu — jediný zdroj pravdy.
 */
export const TANK_INCOMING_DAMAGE_MULT = TANK_MITIGATION;
/** Healer: léčí (násobek attack power), jen symbolický dmg. */
const HEALER_HEAL_MULT = 1.6;
const HEALER_DAMAGE_MULT = 0.15;
/** Po této době boss „enrage" (computeHit ztrojnásobí dmg). */
const RAID_ENRAGE_SEC = 200;
/** Klid mezi bossy + podíl HP doléčený živým členům. */
const RAID_REST_SEC = 5;
const RAID_REST_HEAL_FRACTION = 0.5;
/** Minimální délka raidu (aby šel sledovat). */
const RAID_MIN_DURATION_SEC = 8;
/** Bezpečnostní strop iterací (determinismus). */
const RAID_MAX_ITERATIONS = 40000;

// ── Iterativní wipe/retry (M8.5-A) ──────────────────────────────────────────
/**
 * Max počet pokusů na jednoho bosse; po vyčerpání bez killu = hard fail. Sdílí
 * křivku obtížnosti s dungeonem (`determinationFactor`): 1 → 1 → 0.95 → … → 0.75.
 */
const BOSS_ATTEMPT_CAP = 7;
/** Prodleva (s), než se party po wipu sebere a pullne znovu. */
const RAID_REGROUP_AFTER_WIPE_SEC = 8;

/** Zlehčená kopie nepřítele (×factor na HP i attack power). */
function easeEnemy(enemy: CombatActor, factor: number): CombatActor {
  if (factor >= 1) return enemy;
  return {
    ...enemy,
    maxHealth: Math.max(1, Math.round(enemy.maxHealth * factor)),
    attackPower: enemy.attackPower * factor,
  };
}

/** Zlehčená kopie celého encounteru (každý nepřítel ×factor). */
function easeEncounter(enemies: CombatActor[], factor: number): CombatActor[] {
  if (factor >= 1) return enemies;
  return enemies.map((e) => easeEnemy(e, factor));
}

/**
 * Aktér v raidu = `CombatActor` + role + heal power. Plně serializovatelný
 * (snapshot do DB, stejně jako arena snapshot). `healPower` je 0 mimo healera.
 */
export interface RaidActor extends CombatActor {
  role: RaidRole;
  healPower: number;
}

/**
 * Převede základní bojový profil (z `deriveCombatProfile`) na `RaidActor` podle
 * role. Tanky zesílí HP a sníží dmg, healeři dostanou heal power a téměř žádný
 * dmg, dps zůstanou beze změny.
 */
export function deriveRaidActor(base: CombatActor, role: RaidRole): RaidActor {
  if (role === 'tank') {
    return {
      ...base,
      role,
      healPower: 0,
      maxHealth: Math.round(base.maxHealth * TANK_HP_MULT),
      attackPower: base.attackPower * TANK_DAMAGE_MULT,
    };
  }
  if (role === 'healer') {
    return {
      ...base,
      role,
      healPower: base.attackPower * HEALER_HEAL_MULT,
      attackPower: base.attackPower * HEALER_DAMAGE_MULT,
    };
  }
  return { ...base, role, healPower: 0 };
}

/**
 * Škáluje bosse podle velikosti raidu (HP i dmg ×`size/RAID_BASE_SIZE`). Větší
 * raid = víc dps (víc HP bosse) i víc healu (víc boss dmg) → balanc zůstává zhruba
 * invariantní napříč velikostmi a rozhoduje hlavně KOMPOZICE, ne počet hráčů.
 */
export function scaleBoss(boss: CombatActor, size: number): CombatActor {
  const factor = Math.max(1, size) / RAID_BASE_SIZE;
  if (factor === 1) return boss;
  return {
    ...boss,
    maxHealth: Math.round(boss.maxHealth * factor),
    attackPower: boss.attackPower * factor,
  };
}

/** Odměna jednoho účastníka za group run (XP/zlato/loot). */
export interface RaidReward {
  xp: number;
  gold: number;
  items: string[];
}

export interface RaidCombatResult {
  events: CombatEvent[];
  victory: boolean;
  /** Celková délka runu v sekundách (≥ RAID_MIN_DURATION_SEC). */
  durationSec: number;
  /** Index bosse, na kterém raid hard-failnul (jinak undefined). */
  defeatedAtBoss?: number;
  /** Celkový počet wipů napříč runem (M8.5-A) — řídí škálování odměn. */
  wipes: number;
}

/** Výsledek jednoho pokusu o bosse (jeden „pull"). */
interface BossAttemptResult {
  events: CombatEvent[];
  victory: boolean;
  /** Čas (s od startu runu) po skončení pokusu. */
  clock: number;
  /** HP party po skončení (per index; 0 u mrtvých / při wipu). */
  hp: number[];
}

interface RaidTimer {
  next: number;
  interval: number;
  kind: 'member' | 'member_ability' | 'enemy_basic' | 'enemy_ability' | 'dot_tick';
  memberIdx?: number;
  /** enemy_basic / enemy_ability / dot_tick: index nepřítele v encounteru. */
  enemyIdx?: number;
  ability?: SignatureAbility;
  /** dot_tick: fixní poškození nepřítele jedním tikem. */
  dotDamage?: number;
  /** dot_tick: jméno DoT efektu (pro log) a jeho zdroj. */
  dotName?: string;
  dotSource?: string;
  /** dot_tick: zbývající počet tiků. */
  ticksLeft?: number;
}

/**
 * Naplánuje DoT (krvácení/hoření) na bosse: jeden opakující se timer s `ticksLeft`
 * tiky. Po posledním tiku se timer „vypne" (`next = Infinity`). Tiky jsou fixní
 * (bez RNG) → nemění pořadí náhodných draws ostatních úderů (determinismus).
 */
function scheduleDot(
  timers: RaidTimer[],
  source: CombatActor,
  target: CombatActor,
  targetIdx: number,
  ability: SignatureAbility,
  clock: number,
): void {
  const ticks = ability.dotTicks ?? 0;
  const duration = ability.dotDurationSec ?? 0;
  if (ticks <= 0 || duration <= 0) return;
  const interval = duration / ticks;
  // DoT tik nese typ kouzla (MR-10d) → respektuje resistance/immunity cíle stejně
  // jako přímý zásah (jinak by fire DoT „protekl" fire-immune cílem). Cíl je
  // statický, tak interakci spočítáme jednou při scheduleru.
  const dotType = ability.damageType ?? source.damageType ?? 'bludgeoning';
  const raw = dotTickRaw(ability, source);
  const interaction = damageInteraction(dotType, target);
  const dmg = interaction === 'immune' ? 0 : Math.max(1, applyDamageInteraction(Math.max(1, raw), interaction));
  timers.push({
    next: clock + interval,
    interval,
    kind: 'dot_tick',
    enemyIdx: targetIdx,
    dotDamage: dmg,
    dotName: ability.name,
    dotSource: source.name,
    ticksLeft: ticks,
  });
}

/**
 * Pokusí se utratit spell slot za seslání kouzla (spellTier ≥ 1) z per-encounter
 * rozpočtu člena (ADR 0034). Cantripy/martial techniky (tier 0 / bez tieru) jdou
 * zdarma → `{ ok: true, tier: null }`. Když není slot tieru ≥ kouzla → `ok: false`
 * (kouzlo se nesešle, „drží se" — člen mlátí basic swingem / cantripy dál).
 */
function spendAbilitySlot(
  budget: SpellSlots,
  ability: SignatureAbility,
): { ok: boolean; tier: number | null } {
  const tier = ability.spellTier ?? 0;
  if (tier < 1) return { ok: true, tier: null };
  const used = spendSlotForTier(budget, tier, abilityPrefersUpcast(ability));
  return used == null ? { ok: false, tier: null } : { ok: true, tier: used };
}

/**
 * Vybere cíl týmového úderu mezi nepřáteli: **nejnižší živé HP** (fokus na
 * nejslabšího → trash padá první, klesá příchozí poškození). Vrací -1, pokud
 * nikdo nežije.
 */
function chooseEnemyTarget(enemyHp: number[]): number {
  let idx = -1;
  let lowest = Infinity;
  for (let i = 0; i < enemyHp.length; i++) {
    if (enemyHp[i]! <= 0) continue;
    if (enemyHp[i]! < lowest) {
      lowest = enemyHp[i]!;
      idx = i;
    }
  }
  return idx;
}

/** Vybere cíl nepřátelského úderu: první živý tank, jinak nejodolnější živý člen. */
function chooseBossTarget(party: RaidActor[], hp: number[]): number {
  let tankIdx = -1;
  let fallbackIdx = -1;
  let fallbackHealth = -1;
  for (let i = 0; i < party.length; i++) {
    if (hp[i]! <= 0) continue;
    if (party[i]!.role === 'tank' && tankIdx === -1) tankIdx = i;
    if (party[i]!.maxHealth > fallbackHealth) {
      fallbackHealth = party[i]!.maxHealth;
      fallbackIdx = i;
    }
  }
  return tankIdx !== -1 ? tankIdx : fallbackIdx;
}

/**
 * Odbojuje JEDEN pokus o encounter (party vs **skupina nepřátel**) od `startClock`
 * a `startHp`. Vrací události + výsledek + koncové HP party. Sdílí per-hit vzorce
 * s arenou i questem (`computeHit`). Tým fokusuje nejslabšího nepřítele
 * (`chooseEnemyTarget`), nepřátelé útočí na tanka/threat (`chooseBossTarget`).
 * AoE útoky/heal zasáhnou všechny živé cíle. Vítězství = všichni nepřátelé padli.
 */
function fightEncounter(
  party: RaidActor[],
  enemyActors: CombatActor[],
  rng: SeededRng,
  startClock: number,
  startHp: number[],
  attempt: number,
  /** Sandbox dummy testing (MIL): zastaví pokus v daném čase místo na smrti všech / party. */
  maxClockSec?: number,
): BossAttemptResult {
  const events: CombatEvent[] = [];
  // Rage (ADR 0034): Barbarian-členové se na pull auto-rozzuří (charge-gated) →
  // resistance na fyzické + rage damage bonus (varianta aktéra, projde computeHit).
  party = party.map((p) => (canRage(p) ? applyRage(p) : p));
  const hp = [...startHp];
  // Absorpční štíty členů (per pull). Nedoplňují se; pohlcují příchozí poškození.
  const shield = party.map((p) => p.shield ?? 0);
  // Spell sloty (ADR 0034) jako per-encounter rozpočet kouzel: každé seslané
  // kouzlo (spellTier ≥ 1) čerpá slot; když dojdou, kouzlo se „drží" a člen mlátí
  // basic swingem / cantripy. Fresh kopie per pull (stejně jako quest-run encounter).
  const slotBudget = party.map((p) => ({ ...(p.spellSlots ?? {}) }) as SpellSlots);
  // Ki body (ADR 0034) per člen — rozpočet Monkových technik (`kiCost`) na pull.
  const kiBudget = party.map((p) => p.kiPoints ?? 0);
  // Aktivní mitigation okno (tank cooldowny): do kdy platí + jaké % redukce.
  const mitigationUntil = party.map(() => -1);
  const mitigationPct = party.map(() => 0);
  let clock = startClock;
  // Stav nepřátel skupiny: HP + flag „už hlášen pád" (enemy_defeated jen jednou).
  const enemies = enemyActors;
  const enemyHp = enemies.map((e) => e.maxHealth);
  const enemyDead = enemies.map(() => false);
  const encStart = clock;
  const note = attempt > 0 ? ` (pull ${attempt + 1}, weakened)` : '';

  const livingCount = (): number => hp.reduce((n, h) => (h > 0 ? n + 1 : n), 0);
  const anyEnemyAlive = (): boolean => enemyHp.some((h) => h > 0);
  const livingEnemyIndices = (): number[] => {
    const out: number[] = [];
    for (let i = 0; i < enemyHp.length; i++) if (enemyHp[i]! > 0) out.push(i);
    return out;
  };
  /** Po zásahu zkontroluje pád nepřítele a vyšle jednorázový `enemy_defeated`. */
  const killCheck = (ei: number): void => {
    if (enemyHp[ei]! <= 0 && !enemyDead[ei]) {
      enemyDead[ei] = true;
      events.push({
        t: round1(clock),
        type: 'enemy_defeated',
        target: enemies[ei]!.name,
        message: `${enemies[ei]!.name} is defeated!`,
      });
    }
  };

  // Úvodní hláška: jeden nepřítel = jmenovitě (boss label), pack = souhrn.
  if (enemies.length === 1) {
    const e = enemies[0]!;
    events.push({
      t: round1(clock),
      type: 'encounter_start',
      message: `⚔️ ${e.name}${e.isBoss ? ' (Boss)' : ''} engages the party!${note}`,
      target: e.name,
      targetHealthRemaining: enemyHp[0],
    });
  } else {
    events.push({
      t: round1(clock),
      type: 'encounter_start',
      message: `⚔️ A pack of ${enemies.length} foes engages the party: ${enemies.map((e) => e.name).join(', ')}!${note}`,
      target: enemies[0]!.name,
      targetHealthRemaining: enemyHp[0],
    });
  }

  const timers: RaidTimer[] = [];
  for (let i = 0; i < party.length; i++) {
    timers.push({ next: clock + party[i]!.swingInterval, interval: party[i]!.swingInterval, kind: 'member', memberIdx: i });
    // Všechny role mají timery svých abilit (MIL). Branch `member_ability` routuje
    // dle druhu: heal-kind jen pro healery (léčí spojence), offensive na nepřátele
    // (i healer může DPSit jako filler). Healer navíc auto-léčí basic swingem.
    for (const ab of party[i]!.signatureAbilities) {
      timers.push({ next: clock + ab.cooldownSec, interval: ab.cooldownSec, kind: 'member_ability', memberIdx: i, ability: ab });
    }
  }
  // Per-nepřítel swing + ability timery (každý nepřítel útočí sám za sebe).
  for (let ei = 0; ei < enemies.length; ei++) {
    timers.push({ next: clock + enemies[ei]!.swingInterval, interval: enemies[ei]!.swingInterval, kind: 'enemy_basic', enemyIdx: ei });
    for (const ab of enemies[ei]!.signatureAbilities) {
      timers.push({ next: clock + ab.cooldownSec, interval: ab.cooldownSec, kind: 'enemy_ability', enemyIdx: ei, ability: ab });
    }
  }

  /** Aplikuje jeden útok člena na konkrétního nepřítele (sdíleno basic/ability). */
  const memberHitEnemy = (
    member: RaidActor,
    memberIdx: number,
    ei: number,
    ability: SignatureAbility | undefined,
    slotTier: number | null,
  ): void => {
    const enemy = enemies[ei]!;
    const targetHpPct = enemy.maxHealth > 0 ? enemyHp[ei]! / enemy.maxHealth : 0;
    // Literal D&D spell dice (ADR 0032): kouzla s `dice` jdou přímo (mult = 1);
    // jinak škálují přes attackPower (damageMult). Upcast dle použitého slotu.
    const spec = ability ? abilityDamageSpec(ability, slotTier, member.level) : undefined;
    const mult = ability ? (spec ? 1 : abilityDamageMult(ability, targetHpPct)) : 1;
    const bonusDice = ability ? bonusDiceSpec(ability, slotTier, member.level) : undefined;
    const hit = computeHit(member, enemy, rng, mult, false, ability?.damageType, spec, {
      advantage: ability?.advantage ? 'advantage' : undefined,
      bonusDice,
    });
    // Per-spell saving throw (ADR 0032) → nepřítel si hodí proti spell save DC člena.
    if (hit.hit && ability?.save) {
      const outcome = applySpellSave(ability, member, enemy, rng, hit.amount);
      hit.amount = outcome.amount;
      if (outcome.message) events.push({ t: round1(clock), type: 'ability', source: enemy.name, message: outcome.message });
    }
    enemyHp[ei] = Math.max(0, enemyHp[ei]! - hit.amount);
    const healFrac = member.lifesteal + (ability?.kind === 'drain' ? (ability.drainHealFraction ?? 0) : 0);
    const healed = hit.hit && healFrac > 0 ? Math.round(hit.amount * healFrac) : 0;
    if (healed > 0) hp[memberIdx] = Math.min(member.maxHealth, hp[memberIdx]! + healed);
    if (hit.hit && ability?.kind === 'dot') scheduleDot(timers, member, enemy, ei, ability, clock);
    const remaining = enemyHp[ei]!;
    const abilityName = ability?.name;
    events.push({
      t: round1(clock),
      type: healed > 0 ? 'drain' : ability ? 'ability' : 'attack',
      source: member.name,
      target: enemy.name,
      amount: hit.amount,
      crit: hit.crit,
      ability: abilityName,
      targetHealthRemaining: remaining,
      message: !hit.hit
        ? abilityName
          ? `${member.name} casts ${abilityName} at ${enemy.name} — MISS ${rollTag(hit)}`
          : missMessage(member.name, enemy.name, hit)
        : abilityName
          ? healed > 0
            ? `🩸 ${member.name} casts ${abilityName} on ${enemy.name} for ${hit.amount}${hit.crit ? ' (crit!)' : ''}, healed for ${healed}. ${enemy.name}: ${remaining} HP`
            : ability?.kind === 'dot'
              ? `🔥 ${member.name} casts ${abilityName} on ${enemy.name} for ${hit.amount}${hit.crit ? ' (crit!)' : ''}, leaving a burn. ${enemy.name}: ${remaining} HP`
              : `${member.name} casts ${abilityName} on ${enemy.name} for ${hit.amount}${hit.crit ? ' (crit!)' : ''}. ${enemy.name}: ${remaining} HP`
          : buildAttackMessage({
              attacker: member,
              targetName: enemy.name,
              amount: hit.amount,
              crit: hit.crit,
              healed,
              abilityName: undefined,
              suffix: `. ${enemy.name}: ${remaining} HP ${rollTag(hit)}`,
            }),
    });
    killCheck(ei);
  };

  let iterations = 0;
  while (anyEnemyAlive() && livingCount() > 0 && iterations++ < RAID_MAX_ITERATIONS) {
    let idx = 0;
    for (let j = 1; j < timers.length; j++) {
      if (timers[j]!.next < timers[idx]!.next) idx = j;
    }
    const timer = timers[idx]!;
    if (maxClockSec !== undefined && timer.next > maxClockSec) break;
    clock = timer.next;
    timer.next += timer.interval;
    const enraged = clock - encStart >= RAID_ENRAGE_SEC;

    if (timer.kind === 'member') {
      const i = timer.memberIdx!;
      if (hp[i]! <= 0) continue; // mrtvý člen mlčí
      const member = party[i]!;

      if (member.role === 'healer') {
        // Léčí nejzraněnějšího živého spoluhráče (vč. sebe).
        let tIdx = -1;
        let worstMissing = 0;
        for (let k = 0; k < party.length; k++) {
          if (hp[k]! <= 0) continue;
          const missing = party[k]!.maxHealth - hp[k]!;
          if (missing > worstMissing) {
            worstMissing = missing;
            tIdx = k;
          }
        }
        // Režim healera dle rotace (offensive vs defensive): pokud má vypnuté
        // VŠECHNY heal-spelly → neléčí (pure DPS); pokud vypnuté všechny útočné
        // → neútočí (pure HPS). Default (vše zapnuto) = hybrid. Heal-spelly i
        // útočné spelly samotné jedou přes vlastní timery (member_ability).
        const healAbilities = member.signatureAbilities.filter((a) => a.kind === 'heal');
        const offAbilities = member.signatureAbilities.filter(
          (a) => a.kind === 'strike' || a.kind === 'drain' || a.kind === 'dot',
        );
        const canHeal =
          healAbilities.length === 0 ||
          healAbilities.some((a) => isAbilityEnabled(member.rotation, a.id));
        const canDps = offAbilities.some((a) => isAbilityEnabled(member.rotation, a.id));

        if (canHeal && tIdx >= 0 && worstMissing > 0) {
          const amount = Math.max(1, Math.round(member.healPower * (0.9 + rng.next() * 0.2)));
          hp[tIdx] = Math.min(party[tIdx]!.maxHealth, hp[tIdx]! + amount);
          events.push({
            t: round1(clock),
            type: 'heal',
            source: member.name,
            target: party[tIdx]!.name,
            amount,
            targetHealthRemaining: hp[tIdx],
            message: `💚 ${member.name} heals ${party[tIdx]!.name} for ${amount}. ${party[tIdx]!.name}: ${hp[tIdx]} HP`,
          });
        } else if (canDps) {
          // Nikdo zraněný (nebo pure-DPS healer) → úder nejslabšímu nepříteli (slabý — healer).
          const ei = chooseEnemyTarget(enemyHp);
          if (ei >= 0) memberHitEnemy(member, i, ei, undefined, null);
        }
        // jinak (pure HPS a nikdo zraněný) → healer tento swing nic nedělá
      } else {
        const ei = chooseEnemyTarget(enemyHp);
        if (ei >= 0) memberHitEnemy(member, i, ei, undefined, null);
      }
    } else if (timer.kind === 'dot_tick') {
      const ei = timer.enemyIdx!;
      if (enemyHp[ei]! <= 0) {
        timer.next = Infinity;
        continue;
      }
      const dmg = timer.dotDamage!;
      enemyHp[ei] = Math.max(0, enemyHp[ei]! - dmg);
      events.push({
        t: round1(clock),
        type: 'dot',
        source: timer.dotSource,
        target: enemies[ei]!.name,
        amount: dmg,
        ability: timer.dotName,
        targetHealthRemaining: enemyHp[ei],
        message: `🔥 ${enemies[ei]!.name} suffers ${dmg} from ${timer.dotName} (${timer.dotSource}). ${enemies[ei]!.name}: ${enemyHp[ei]} HP`,
      });
      killCheck(ei);
      timer.ticksLeft = (timer.ticksLeft ?? 1) - 1;
      if (timer.ticksLeft <= 0) timer.next = Infinity;
    } else if (timer.kind === 'member_ability') {
      const i = timer.memberIdx!;
      if (hp[i]! <= 0) continue; // mrtvý člen nekouzlí
      const member = party[i]!;
      const ability = timer.ability!;
      // Reprezentativní cíl (nejslabší nepřítel) pro rotaci + jednocílové útoky.
      const primaryEi = chooseEnemyTarget(enemyHp);
      const primaryPct =
        primaryEi >= 0 && enemies[primaryEi]!.maxHealth > 0
          ? enemyHp[primaryEi]! / enemies[primaryEi]!.maxHealth
          : 0;
      // Deklarativní rotace (MIL): pravidlo rozhodne, zda se ability teď sešle.
      // Pokud ne, ability se „drží" (člen mezitím útočí basic swingem). Default
      // (bez rotace) = always → beze změny chování.
      if (
        !shouldCastAbility(member.rotation, ability.id, {
          enemyHpPct: primaryPct,
          selfHpPct: member.maxHealth > 0 ? hp[i]! / member.maxHealth : 0,
        })
      ) {
        continue;
      }
      // Mitigation cooldown (tank): aktivuje okno snížení příchozího poškození.
      if (ability.kind === 'mitigation') {
        // Spell sloty (ADR 0034): pokud je mitigace kouzlo (tier ≥ 1) a není slot, drž ji.
        if (!spendAbilitySlot(slotBudget[i]!, ability).ok) continue;
        mitigationUntil[i] = clock + (ability.mitigationDurationSec ?? 0);
        mitigationPct[i] = ability.mitigationPct ?? 0;
        events.push({
          t: round1(clock),
          type: 'ability',
          source: member.name,
          ability: ability.name,
          message: `🛡️ ${member.name} uses ${ability.name}, reducing damage taken by ${Math.round((ability.mitigationPct ?? 0) * 100)}%.`,
        });
        continue;
      }
      // Heal-kind ability: jen healer, jen když je koho léčit (jinak se „drží").
      if (ability.kind === 'heal') {
        if (member.role !== 'healer' || member.healPower <= 0) continue;
        // Zranění spojenci (živí, pod max HP). AoE heal (Mass Healing Word) ošetří
        // VŠECHNY (ADR 0036), jednocílový heal jen nejzraněnějšího.
        const hurt: number[] = [];
        let worstIdx = -1;
        let worstMissing = 0;
        for (let k = 0; k < party.length; k++) {
          if (hp[k]! <= 0) continue;
          const missing = party[k]!.maxHealth - hp[k]!;
          if (missing <= 0) continue;
          hurt.push(k);
          if (missing > worstMissing) {
            worstMissing = missing;
            worstIdx = k;
          }
        }
        if (worstIdx < 0) continue;
        // Spell sloty (ADR 0034): heal-kouzlo (tier ≥ 1) čerpá slot; když dojdou,
        // ability-heal se „drží" (healer pořád léčí slabší basic swingem zdarma).
        if (!spendAbilitySlot(slotBudget[i]!, ability).ok) continue;
        const targets = ability.aoe ? hurt : [worstIdx];
        for (const tIdx of targets) {
          const amount = Math.max(
            1,
            Math.round(member.healPower * ability.damageMult * (0.9 + rng.next() * 0.2)),
          );
          hp[tIdx] = Math.min(party[tIdx]!.maxHealth, hp[tIdx]! + amount);
          events.push({
            t: round1(clock),
            type: 'heal',
            source: member.name,
            target: party[tIdx]!.name,
            amount,
            ability: ability.name,
            targetHealthRemaining: hp[tIdx],
            message: `💚 ${member.name} casts ${ability.name} on ${party[tIdx]!.name} for ${amount}. ${party[tIdx]!.name}: ${hp[tIdx]} HP`,
          });
        }
        continue;
      }
      // Útočná ability (strike/drain/dot) → potřebuje živý cíl.
      if (primaryEi < 0) continue;
      // Ki (ADR 0034): Monkova technika (`kiCost`) potřebuje dost Ki; jinak se „drží".
      const kiCost = ability.kiCost ?? 0;
      if (kiCost > (kiBudget[i] ?? 0)) continue;
      // Spell sloty (ADR 0034): útočné kouzlo (tier ≥ 1) čerpá slot; když dojdou,
      // se „drží" (člen mlátí basic swingem / cantripy). Slot tier řídí upcast.
      const slot = spendAbilitySlot(slotBudget[i]!, ability);
      if (!slot.ok) continue;
      if (kiCost > 0) kiBudget[i]! -= kiCost;
      // AoE útok (ADR 0036, aktivováno dungeon overhaulem) → zasáhne VŠECHNY živé
      // nepřátele (jeden cast, víc cílů); jinak jen nejslabšího.
      const targets = ability.aoe ? livingEnemyIndices() : [primaryEi];
      for (const ei of targets) memberHitEnemy(member, i, ei, ability, slot.tier);
    } else {
      // Nepřítel útočí (enemy_basic / enemy_ability).
      const ei = timer.enemyIdx!;
      if (enemyHp[ei]! <= 0) continue; // mrtvý nepřítel neútočí
      const enemy = enemies[ei]!;
      const tIdx = chooseBossTarget(party, hp);
      if (tIdx < 0) break;
      const target = party[tIdx]!;
      const ability = timer.kind === 'enemy_ability' ? timer.ability : undefined;
      const hit = computeHit(enemy, target, rng, ability?.damageMult ?? 1, enraged);
      let dmg = hit.amount;
      if (target.role === 'tank') dmg = Math.max(1, Math.round(dmg * TANK_MITIGATION));
      // Aktivní mitigation cooldown (Shield Wall / Ardent Defender).
      if (clock < mitigationUntil[tIdx]! && mitigationPct[tIdx]! > 0) {
        dmg = Math.max(1, Math.round(dmg * (1 - mitigationPct[tIdx]!)));
      }
      // Absorpční štít pohltí část poškození, než dopadne na HP.
      if (shield[tIdx]! > 0) {
        const abs = applyAbsorb(dmg, shield[tIdx]!);
        if (abs.absorbed > 0) {
          shield[tIdx] = abs.shieldRemaining;
          dmg = abs.netDamage;
          events.push({
            t: round1(clock),
            type: 'absorb',
            source: enemy.name,
            target: target.name,
            amount: abs.absorbed,
            message: `🛡️ ${target.name}'s shield absorbs ${abs.absorbed}${shield[tIdx]! > 0 ? ` (${shield[tIdx]} left)` : ' (shield breaks)'}.`,
          });
        }
      }
      hp[tIdx] = Math.max(0, hp[tIdx]! - dmg);
      // Při plné absorpci stačí 'absorb' událost (žádný „for 0" řádek navíc).
      if (dmg > 0) {
        events.push({
          t: round1(clock),
          type: ability ? 'ability' : 'attack',
          source: enemy.name,
          target: target.name,
          amount: dmg,
          crit: hit.crit,
          ability: ability?.name,
          targetHealthRemaining: hp[tIdx],
          message: ability
            ? `${enemy.name} uses ${ability.name} on ${target.name} for ${dmg}${hit.crit ? ' (crit!)' : ''}${enraged ? ' [enraged]' : ''}. ${target.name}: ${hp[tIdx]} HP`
            : `${enemy.name} hits ${target.name} for ${dmg}${hit.crit ? ' (crit!)' : ''}${enraged ? ' [enraged]' : ''}. ${target.name}: ${hp[tIdx]} HP`,
        });
      } else if (!hit.hit) {
        events.push({
          t: round1(clock),
          type: 'attack',
          source: enemy.name,
          target: target.name,
          amount: 0,
          message: missMessage(enemy.name, target.name, hit),
        });
      }
      if (hp[tIdx] === 0) {
        events.push({
          t: round1(clock),
          type: 'player_defeated',
          source: enemy.name,
          target: target.name,
          message: `💀 ${target.name} has fallen!`,
        });
      }
    }
  }

  const victory = !anyEnemyAlive() && livingCount() > 0;
  return { events, victory, clock, hp };
}

/**
 * Deterministicky odbojuje raid s **iterativním wipe/retry** (M8.5-A): party
 * vs sekvence bossů. Po wipu (celá party mrtvá) se boss pullne znovu (party na
 * plné HP) a **zlehčí** (determination až k `BOSS_DETERMINATION_FLOOR`); poražení
 * bossové zůstávají. Vyčerpání pokusů bez killu = **hard fail**. Vrací počet wipů
 * (řídí škálování odměn) + kompletní timeline.
 */
export function simulateRaidRun(
  party: RaidActor[],
  encounters: (CombatActor | CombatActor[])[],
  seed: number,
): RaidCombatResult {
  const rng = new SeededRng(seed);
  const events: CombatEvent[] = [];
  // Normalizace: prvek může být jeden nepřítel (legacy = 1-enemy encounter) nebo
  // skupina (`CombatActor[]`, dungeon overhaul) → vždy `CombatActor[][]`.
  const groups: CombatActor[][] = encounters.map((e) => (Array.isArray(e) ? e : [e]));
  const fullHp = party.map((p) => p.maxHealth);
  // HP nesená mezi VYČIŠTĚNÝMI encountery (po wipu se resetuje na plnou).
  let carriedHp = [...fullHp];
  let clock = 0;
  let wipes = 0;
  let victory = true;
  let defeatedAtBoss: number | undefined;

  for (let bi = 0; bi < groups.length; bi++) {
    const baseGroup = groups[bi]!;
    let attempt = 0;
    let killed = false;
    let hpAfter = carriedHp;

    while (attempt < BOSS_ATTEMPT_CAP) {
      const group = easeEncounter(baseGroup, determinationFactor(attempt));
      const startHp = attempt === 0 ? carriedHp : fullHp;
      const enc = fightEncounter(party, group, rng, clock, startHp, attempt);
      for (const e of enc.events) events.push(e);
      clock = enc.clock;
      if (enc.victory) {
        killed = true;
        hpAfter = enc.hp;
        break;
      }
      wipes++;
      attempt++;
      if (attempt < BOSS_ATTEMPT_CAP) clock += RAID_REGROUP_AFTER_WIPE_SEC;
    }

    if (!killed) {
      victory = false;
      defeatedAtBoss = bi;
      break;
    }

    // Klid mezi vyčištěnými encountery (kromě po posledním): doléč živé.
    if (bi < groups.length - 1) {
      clock += RAID_REST_SEC;
      carriedHp = hpAfter.map((h, k) =>
        h > 0 ? Math.min(party[k]!.maxHealth, h + Math.round(party[k]!.maxHealth * RAID_REST_HEAL_FRACTION)) : 0,
      );
    }
  }

  events.push(
    victory
      ? { t: round1(clock), type: 'victory', message: '🏆 Raid cleared!' }
      : { t: round1(clock), type: 'defeat', message: '☠️ The raid wiped.' },
  );

  return {
    events,
    victory,
    durationSec: Math.max(RAID_MIN_DURATION_SEC, Math.ceil(clock)),
    defeatedAtBoss,
    wipes,
  };
}

// ── Trénovací terč / sandbox (MIL) ──────────────────────────────────────────
// „Testovací target/healing dummy" — ladění rotace bez nutnosti soupeře/party.
// Recykluje `fightEncounter` (role routing, mitigation, heal, DoT — žádná
// duplikace), jen s časovým stropem místo ukončení na smrti nepřátel/party.

/** HP terče — dost vysoko, aby v rozumné délce testu nikdy nepadl. */
const DUMMY_MAX_HEALTH = 50_000_000;
const DUMMY_SWING_INTERVAL = 3;
/** Terč „čapne" za úder podíl max HP testovaného aktéra — dost na to, aby šlo
 * reálně testovat mitigation/heal/self-sustain rotaci, ne aby ohrozilo přežití. */
const DUMMY_CHIP_DAMAGE_FRACTION = 0.04;

/** Stacionární trénovací terč; útočí slabě zpět, aby šla testovat i obranná/heal rotace. */
export function buildTrainingDummy(referenceMaxHealth: number): CombatActor {
  return buildEnemyActor({
    name: 'Training Dummy',
    maxHealth: DUMMY_MAX_HEALTH,
    attackPower: Math.max(1, Math.round(referenceMaxHealth * DUMMY_CHIP_DAMAGE_FRACTION)),
    swingInterval: DUMMY_SWING_INTERVAL,
  });
}

export interface DummyFightResult {
  events: CombatEvent[];
  durationSec: number;
}

/**
 * Sandbox sim (MIL): otestuje rotaci postavy proti trénovacímu terči přesně po
 * `durationSec`, bez party/soupeře. Stateless — žádná persistence, čistě
 * request/response; deterministické (seed), takže reprodukovatelné pro debug.
 */
export function simulateDummyFight(
  actor: CombatActor,
  role: RaidRole,
  durationSec: number,
  seed: number,
): DummyFightResult {
  const rng = new SeededRng(seed);
  const member = deriveRaidActor(actor, role);
  const dummy = buildTrainingDummy(member.maxHealth);
  const attempt = fightEncounter([member], [dummy], rng, 0, [member.maxHealth], 0, durationSec);
  const events = attempt.events.map((e) =>
    e.type === 'encounter_start' ? { ...e, message: `⚔️ ${actor.name} starts attacking the Training Dummy.` } : e,
  );
  return { events, durationSec: Math.max(0, Math.round(attempt.clock)) };
}
