/**
 * The Gauntlet (M13) — aktivní „time-killer" minihra: tahový survival aréna run.
 *
 * Na rozdíl od idle auto-resolve obsahu (dungeony/raidy) je tohle **stateful,
 * interaktivní** boj: hráč vstoupí se svou reálnou postavou (snapshot bojového
 * profilu z `deriveCombatProfile`) a kolo po kole volí, jakou ability použít
 * proti vlně nepřátel. Po vyčištění vlny si vybere jednu ze tří **draft odměn**
 * (buff / kus gearu / nový spell), které platí **jen pro tenhle run** (roguelite,
 * žádný power-creep, čistý anti-cheat). Run končí smrtí nebo dosažením stropu vln.
 *
 * Tenhle modul je **čistý deterministický engine** (žádný I/O, žádný NestJS):
 *  - veškerá náhoda jen přes `SeededRng` (seed per tah → server-authoritative,
 *    klient posílá jen volbu, server dopočítá vše → reprodukovatelné/anti-cheat);
 *  - recykluje sdílené bojové vzorce (`computeHit`, `abilityDamageMult`,
 *    `applyAbsorb`, `buildAttackMessage`) → žádná duplikace combat logiky;
 *  - veškeré herní stringy anglicky (EN = jazyk hry), komentáře česky.
 *
 * Gear draft (potřebuje katalog itemů + equip postavy) skládá API service a
 * předává hotové `GauntletDraftOption` do `rollGauntletDraft` — engine zůstává
 * bez závislosti na konkrétních itemech.
 */
import { SeededRng, seedFromString } from './rng';
import {
  abilityDamageMult,
  abilityDamageSpec,
  applyRage,
  bonusDiceSpec,
  buildAttackMessage,
  buildEnemyActor,
  computeHit,
  crEnemyMagnitude,
  dotTickRaw,
  EXTRA_ATTACK_ABILITY,
  extraActionCount,
  isBonusAction,
  applyAbsorb,
  SIGNATURE_ABILITIES,
  type CombatActor,
  type CombatEvent,
  type SignatureAbility,
} from './combat';
import { applySpellSave, missMessage } from './dnd-combat';
import { applyDamageInteraction, crForContentLevel, damageInteraction } from './data/damage';
import { BESTIARY } from './data/enemies';
import { abilityPrefersUpcast, hasSlotForTier, spendSlotForTier, type SpellSlots } from './data/spell-slots';

// ── Laditelné konstanty (balanc doladí M9-ish pass) ─────────────────────────

/** Délka jednoho „tahu" v sekundách — převádí cooldown abilit (s) na počet tahů. */
export const GAUNTLET_TURN_SEC = 3;
/** Každá N-tá vlna je „elite" (víc HP a dmg). */
export const GAUNTLET_ELITE_EVERY = 5;
/** Strop počtu vln — po jeho dosažení se run automaticky uzavře jako dokončený. */
export const GAUNTLET_MAX_WAVE = 50;
/**
 * Růst statů nepřítele za vlnu — **kompoundovaný** (exponenciální), aby obtížnost
 * stoupala stále strměji a přerostla hráčův snowball z draftů. Mírný start
 * (vlna 1 = base), prudký konec (každý run má tak přirozenou hranici = skóre).
 * HP roste pomaleji než dmg → fighty se prodlužují a zároveň víc bolí.
 */
const GAUNTLET_HP_GROWTH = 1.18;
const GAUNTLET_AP_GROWTH = 1.15;
/**
 * Klesající účinnost léčení — každé použité léčení v runu zlevní další
 * (`HEAL_FALLOFF ** healsUsed`). 1. heal plný, pak ~65 %, ~42 %, … → spamovat
 * heal se nevyplatí, musíš ho šetřit na kritické momenty.
 */
const HEAL_FALLOFF = 0.65;

/** Násobič účinnosti léčení podle počtu už použitých healů v runu (0..1]. */
export function healFalloff(healsUsed: number): number {
  return HEAL_FALLOFF ** Math.max(0, healsUsed);
}
/** Heal-kind ability: násobek převádějící „healing %" na vyléčené HP z attack power. */
const HEAL_POWER_FACTOR = 0.6;
/** Strop crit šance (sdíleno s combat enginem). */
const MAX_CRIT_CHANCE = 0.6;

/** Pseudo-ability „základní úder" — vždy dostupná, bez cooldownu. */
export const GAUNTLET_BASIC_ATTACK: SignatureAbility = {
  id: 'basic_attack',
  name: 'Attack',
  description: 'A basic weapon swing. Always available.',
  kind: 'strike',
  cooldownSec: 0,
  damageMult: 1,
};

// ── Typy stavu runu (plně serializovatelné → uloží se do DB jako JSON) ───────

export type GauntletStatus = 'in_combat' | 'drafting' | 'dead' | 'retired';

/** DoT „nalepený" na nepříteli (krvácení/hoření z hráčovy ability). */
export interface GauntletDot {
  remainingTicks: number;
  tickDamage: number;
  /** Jméno zdroje (hráč) — pro log. */
  sourceName: string;
  /** Jméno ability, která DoT způsobila — pro log. */
  abilityName: string;
}

/** Stav nepřítele aktuální vlny. */
export interface GauntletEnemyState {
  name: string;
  isElite: boolean;
  maxHealth: number;
  currentHealth: number;
  attackPower: number;
  armor: number;
  /** Efektivní úroveň pro D&D AC/attackBonus (MR-5) — roste s vlnou. */
  level?: number;
  dots: GauntletDot[];
}

/** Mutabilní bojový stav hráče (mimo neměnný snapshot profilu). */
export interface GauntletPlayerState {
  maxHealth: number;
  currentHealth: number;
  /** Absorpční štít z draftů/abilit (pohlcuje příchozí dmg). */
  absorb: number;
  /** abilityId → zbývající počet tahů do dostupnosti. */
  cooldowns: Record<string, number>;
  /**
   * Zbývající spell sloty (ADR 0034) — **rozpočet na celý run** (NEresetuje se po
   * vlně, roguelite hospodaření: šetři nejlepší kouzla na elite). Kouzlo (tier ≥ 1)
   * čerpá slot; cantripy/martial jdou zdarma. Odvozeno ze snapshotu (max) na startu.
   */
  spellSlots: SpellSlots;
  /** Zbývající Ki body (ADR 0034) — per-run rozpočet Monkových technik (`kiCost`). */
  kiPoints?: number;
  /** Zbývající rage charges (ADR 0034) — kolikrát se Barbarian ještě umí rozzuřit. */
  rageCharges?: number;
  /** Je hráč právě rozzuřený (aktuální vlna)? Auto-zapnuto na vlnu, dokud má charge. */
  raging?: boolean;
  /** Zbývající tahy aktivního mitigation okna (0 = neaktivní). */
  mitigationTurns: number;
  /** Podíl redukce příchozího poškození během mitigation okna (0..1). */
  mitigationPct: number;
  /**
   * Akční ekonomika (ADR 0042): ids „once per combat" abilit už použitých v
   * aktuální vlně (Gauntlet = 1 combat na vlnu → reset při spawnu vlny). Action
   * Surge/Assassinate z draftu. `undefined` u běhů z doby před slice = prázdné.
   */
  usedOncePerCombat?: string[];
}

/** Druh draft odměny. */
export type GauntletPickKind = 'buff' | 'gear' | 'ability';

/**
 * Aplikovatelná odměna z draftu — **kombinované bojové delty** (počítané v
 * okamžiku nabídky, takže engine nepotřebuje katalog itemů). Buffy používají
 * násobiče, gear ploché bonusy, ability přidá spell do kitu.
 */
export interface GauntletPick {
  kind: GauntletPickKind;
  id: string;
  label: string;
  /** Násobič attack power (buff). */
  attackMult?: number;
  /** Plochý attack power (gear). */
  bonusAttackPower?: number;
  /** Násobič max HP (buff). */
  maxHealthMult?: number;
  /** Plochý max HP (gear). */
  bonusMaxHealth?: number;
  bonusCritChance?: number;
  bonusArmor?: number;
  bonusLifesteal?: number;
  /** Nový spell přidaný do kitu pro tento run (ability draft). */
  ability?: SignatureAbility;
  /** Okamžité vyléčení na plno při výběru. */
  healFull?: boolean;
  /** Okamžité vyléčení o podíl max HP (0..1) při výběru — léčení už není automatické. */
  healPct?: number;
}

/** Jeden řádek porovnání staty (gear draft) — current vs nabízené. */
export interface GauntletStatComparison {
  label: string;
  current: number;
  offered: number;
}

/** Jedna nabídka v draftu mezi vlnami. */
export interface GauntletDraftOption {
  id: string;
  kind: GauntletPickKind;
  name: string;
  description: string;
  /** Porovnání statů (jen gear). */
  comparison?: GauntletStatComparison[];
  pick: GauntletPick;
}

/** Kompletní stav jednoho Gauntlet runu (persistovaný jako JSON). */
export interface GauntletRunState {
  seed: number;
  /** Aktuální vlna (1-based). */
  wave: number;
  /** Globální čítač tahů (pro seedování + řazení logu). */
  turn: number;
  status: GauntletStatus;
  player: GauntletPlayerState;
  enemy: GauntletEnemyState | null;
  /** Vybrané drafty (aplikované na profil). */
  picks: GauntletPick[];
  /** Aktivní nabídka draftu (jen ve `status==='drafting'`). */
  draft: GauntletDraftOption[] | null;
  /** Posledních pár událostí logu (oříznuto kvůli velikosti). */
  log: CombatEvent[];
  /** Počet plně vyčištěných vln (= dosažené skóre). */
  wavesCleared: number;
  /** Počet použitých léčivých draftů (řídí klesající účinnost healu). */
  healsUsed: number;
}

// ── Odvození efektivního bojového profilu (base + draft picks) ──────────────

/** Aplikuje vybrané drafty na snapshot profilu → efektivní `CombatActor`. */
export function effectivePlayerActor(base: CombatActor, picks: GauntletPick[]): CombatActor {
  let attackPower = base.attackPower;
  let maxHealth = base.maxHealth;
  let critChance = base.critChance;
  let armor = base.armor;
  let lifesteal = base.lifesteal;
  const abilities = [...base.signatureAbilities];
  const seen = new Set(abilities.map((a) => a.id));

  for (const p of picks) {
    attackPower = attackPower * (p.attackMult ?? 1) + (p.bonusAttackPower ?? 0);
    maxHealth = maxHealth * (p.maxHealthMult ?? 1) + (p.bonusMaxHealth ?? 0);
    critChance += p.bonusCritChance ?? 0;
    armor += p.bonusArmor ?? 0;
    lifesteal += p.bonusLifesteal ?? 0;
    if (p.ability && !seen.has(p.ability.id)) {
      abilities.push(p.ability);
      seen.add(p.ability.id);
    }
  }

  return {
    ...base,
    attackPower,
    maxHealth: Math.round(maxHealth),
    critChance: Math.min(MAX_CRIT_CHANCE, critChance),
    armor,
    lifesteal,
    signatureAbilities: abilities,
  };
}

/** Kompletní ability kit dostupný v runu (základní úder + signatures + drafty). */
export function gauntletAbilities(base: CombatActor, picks: GauntletPick[]): SignatureAbility[] {
  // Koncentrační buffy (Hunter's Mark/Hex, ADR 0036) jsou pasivní (rider na každý
  // zásah přes weaponRiderDice) — nejsou castable, nenabízíme je v UI.
  return [
    GAUNTLET_BASIC_ATTACK,
    ...effectivePlayerActor(base, picks).signatureAbilities.filter((a) => a.kind !== 'buff'),
  ];
}

// ── Generování nepřátel ──────────────────────────────────────────────────────

// Jména nepřátel se táhnou ze sdíleného katalogu nestvůr (`enemies.ts`, ADR 0043)
// — žádný paralelní seznam jmen. Bereme jen jméno (identita); typové obrany se do
// Gauntlet combatu zatím NEpropisují (magnitudy/typing beze změny — typed Gauntlet
// nepřátelé = follow-up „Enemy schopnosti"). Pool = curated podmnožina katalogu.
const NORMAL_ENEMY_NAMES = [
  'skeleton_warrior', 'rotting_zombie', 'goblin_cutter', 'dire_wolf',
  'cultist_pyromancer', 'hill_ogre', 'grave_wraith', 'frost_elemental',
].map((id) => BESTIARY[id]!.name);
const ELITE_ENEMY_NAMES = [
  'stone_golem', 'young_red_dragon', 'mind_devourer', 'ancient_treant',
  'pit_fiend_spawn', 'fire_elemental',
].map((id) => BESTIARY[id]!.name);

/**
 * Deterministicky postaví nepřítele pro danou vlnu. HP i dmg rostou s vlnou;
 * každá `GAUNTLET_ELITE_EVERY`-tá vlna je elite (výrazně silnější). Škáluje
 * i s levelem postavy, aby výzva odpovídala síle hráče.
 */
export function buildGauntletEnemy(level: number, wave: number, rng: SeededRng): GauntletEnemyState {
  const isElite = wave % GAUNTLET_ELITE_EVERY === 0;
  const eliteHp = isElite ? 2.4 : 1;
  const eliteAp = isElite ? 1.7 : 1;
  const waveStep = wave - 1;

  // Literal D&D magnituda (ADR 0032): base HP/dmg z Challenge Ratingu efektivní
  // úrovně (level + vlna), pak **kompoundovaný** (exponenciální) růst za vlnu →
  // start je D&D-kotvený, obtížnost pak stoupá stále strměji (přeroste hráčův
  // snowball z draftů → přirozená hranice runu = skóre).
  const base = crEnemyMagnitude(crForContentLevel(level + waveStep, false), false);
  const maxHealth = Math.round(base.maxHealth * GAUNTLET_HP_GROWTH ** waveStep * eliteHp);
  const attackPower = Math.round(base.attackPower * GAUNTLET_AP_GROWTH ** waveStep * eliteAp);
  const armor = Math.round(level * 2 + wave * 4);

  const pool = isElite ? ELITE_ENEMY_NAMES : NORMAL_ENEMY_NAMES;
  const name = pool[rng.int(0, pool.length - 1)]!;

  // Efektivní úroveň roste s vlnou → AC/attackBonus drží krok s hráčem (MR-5).
  const effLevel = level + waveStep;
  return { name, isElite, maxHealth, currentHealth: maxHealth, attackPower, armor, level: effLevel, dots: [] };
}

/** `CombatActor` nepřítele pro sdílený `computeHit` (zdroj pravdy combat vzorce). */
function enemyActor(enemy: GauntletEnemyState): CombatActor {
  return buildEnemyActor({
    name: enemy.name,
    maxHealth: enemy.maxHealth,
    attackPower: enemy.attackPower,
    swingInterval: GAUNTLET_TURN_SEC,
    armor: enemy.armor,
    isBoss: enemy.isElite,
    level: enemy.level,
  });
}

// ── Životní cyklus runu ──────────────────────────────────────────────────────

/** Spustí nový run: plné HP, vlna 1, status in_combat. */
export function startGauntletRun(base: CombatActor, level: number, seed: number): GauntletRunState {
  const eff = effectivePlayerActor(base, []);
  const state: GauntletRunState = {
    seed,
    wave: 1,
    turn: 0,
    status: 'in_combat',
    player: {
      maxHealth: eff.maxHealth,
      currentHealth: eff.maxHealth,
      absorb: 0,
      cooldowns: {},
      // Per-run rozpočty class resources (ADR 0034) = max ze snapshotu. Spell sloty
      // a Ki se NEresetují po vlně (refill = budoucí ventil); rage charges se čerpají
      // auto-zuřením po vlnu. Pact (Warlock) recharguje sloty per-vlnu (short rest).
      spellSlots: { ...(base.spellSlots ?? {}) },
      kiPoints: base.kiPoints ?? 0,
      rageCharges: base.rageCharges ?? 0,
      raging: false,
      mitigationTurns: 0,
      mitigationPct: 0,
      usedOncePerCombat: [],
    },
    enemy: null,
    picks: [],
    draft: null,
    log: [],
    wavesCleared: 0,
    healsUsed: 0,
  };
  spawnWave(base, state, level);
  return state;
}

/** Nastaví nepřítele aktuální vlny + resetuje per-vlnu stav hráče (cd/štít/mitigace). */
function spawnWave(base: CombatActor, state: GauntletRunState, level: number): void {
  const rng = new SeededRng(seedFromString(`${state.seed}:enemy:${state.wave}`));
  state.enemy = buildGauntletEnemy(level, state.wave, rng);
  state.player.cooldowns = {};
  state.player.absorb = 0;
  state.player.mitigationTurns = 0;
  state.player.mitigationPct = 0;
  state.player.usedOncePerCombat = []; // nová vlna = nový boj → reset „once per combat" (ADR 0042)
  // Pact Magic (Warlock, ADR 0034): „short rest" recharge — sloty se obnoví KAŽDOU
  // vlnu (ostatní casteři mají per-run rozpočet). Faithful D&D pact recovery v idle.
  if (base.casterType === 'pact') state.player.spellSlots = { ...(base.spellSlots ?? {}) };
  // Rage (ADR 0034): Barbarian se auto-rozzuří na vlnu, dokud má charge (per-run
  // rationing) → resistance na fyzické + bonus po celou vlnu (idle abstrakce).
  if ((state.player.rageCharges ?? 0) > 0) {
    state.player.rageCharges = (state.player.rageCharges ?? 0) - 1;
    state.player.raging = true;
  } else {
    state.player.raging = false;
  }
  state.status = 'in_combat';
}

/** Cooldown ability v tazích (0 pro základní úder). */
function cooldownTurns(ability: SignatureAbility): number {
  if (ability.cooldownSec <= 0) return 0;
  return Math.max(1, Math.round(ability.cooldownSec / GAUNTLET_TURN_SEC));
}

/** Je ability právě použitelná (v kitu a bez aktivního cooldownu)? */
export function isGauntletAbilityReady(state: GauntletRunState, abilityId: string): boolean {
  return (state.player.cooldowns[abilityId] ?? 0) <= 0;
}

/**
 * Má hráč na seslání ability dost zdrojů (ADR 0034)? Cantripy (tier 0) a martial
 * techniky bez nákladů jdou vždy → `true`. Kouzlo (tier ≥ 1) potřebuje spell slot
 * ≥ tieru; Monkova technika potřebuje dost **Ki**. Čistá kontrola (nemutuje) — pro
 * UI (zašednutí) i validaci tahu. `kiPoints`/`spellSlots` undefined (běhy z doby
 * před slice) = netrackováno → neblokuje.
 */
export function canCastGauntletAbility(state: GauntletRunState, ability: SignatureAbility): boolean {
  const kiLeft = state.player.kiPoints ?? Infinity;
  if ((ability.kiCost ?? 0) > kiLeft) return false;
  // Akční ekonomika (ADR 0042): „once per combat" ability už vyčerpaná v této vlně.
  if (ability.oncePerCombat && (state.player.usedOncePerCombat ?? []).includes(ability.id)) return false;
  return hasSlotForTier(state.player.spellSlots ?? {}, ability.spellTier ?? 0);
}

function trimLog(state: GauntletRunState): void {
  if (state.log.length > 80) state.log = state.log.slice(-80);
}

/**
 * Vyhodnotí jeden tah: (1) DoT tiky na nepříteli, (2) hráčova zvolená ability,
 * (3) protiúder nepřítele, (4) údržba cooldownů/mitigace. Vrací nový stav +
 * události tohoto tahu (přidané i do `state.log`). Deterministické — seed per tah.
 *
 * Předpokládá validní vstup (status in_combat, ability v kitu a ready) — to ověří
 * volající (service). Při nevalidním stavu vrací stav beze změny.
 */
export function resolveGauntletTurn(
  base: CombatActor,
  state: GauntletRunState,
  abilityId: string,
  /** Volitelná bonus-action ability (ADR 0042, Slice 3) — hráč ji **vědomě zvolí**
   * vedle hlavní akce (Healing Word). Léčení čerpá `healsUsed` (diminishing). Bez
   * tohoto id žádná bonus akce neproběhne. */
  bonusAbilityId?: string,
): { state: GauntletRunState; events: CombatEvent[] } {
  if (state.status !== 'in_combat' || !state.enemy) return { state, events: [] };

  // Rage (ADR 0034): rozzuřený Barbarian (auto na vlnu, viz spawnWave) → varianta
  // aktéra s resistance na fyzické + rage bonusem (projde computeHit jako útočník i cíl).
  const baseActor = effectivePlayerActor(base, state.picks);
  const player = state.player.raging ? applyRage(baseActor) : baseActor;
  const ability =
    abilityId === GAUNTLET_BASIC_ATTACK.id
      ? GAUNTLET_BASIC_ATTACK
      : player.signatureAbilities.find((a) => a.id === abilityId);
  if (!ability || ability.kind === 'buff') return { state, events: [] }; // buff = pasivní rider
  if (!isGauntletAbilityReady(state, abilityId)) return { state, events: [] };
  // Akční ekonomika (ADR 0042): „once per combat" ability se ve vlně použije jen 1×.
  if (ability.oncePerCombat && (state.player.usedOncePerCombat ?? []).includes(abilityId)) {
    return { state, events: [] };
  }

  // Class resources (ADR 0034): rozpočet na celý run. Lazy init pro běhy založené
  // před slice (JSON bez pole). Kontrola dostupnosti teď (bez zdroje = neplatný tah,
  // UI ho blokuje); samotná spotřeba až při commitu (po DoT — viz níže), aby DoT-kill
  // nepřítele neutratil zdroj za ability, která už nedopadne.
  if (state.player.spellSlots === undefined) {
    state.player.spellSlots = { ...(base.spellSlots ?? {}) };
  }
  if (state.player.kiPoints === undefined) {
    state.player.kiPoints = base.kiPoints ?? 0;
  }
  const abilityTier = ability.spellTier ?? 0;
  if (!hasSlotForTier(state.player.spellSlots, abilityTier)) return { state, events: [] };
  const kiCost = ability.kiCost ?? 0;
  if (kiCost > (state.player.kiPoints ?? 0)) return { state, events: [] };
  let usedSlotTier: number | null = null;

  const enemy = state.enemy;
  const rng = new SeededRng(seedFromString(`${state.seed}:turn:${state.wave}:${state.turn}`));
  const t = state.turn;
  const events: CombatEvent[] = [];
  const pushEvent = (e: CombatEvent): void => {
    events.push(e);
    state.log.push(e);
  };

  // (1) DoT tiky na nepříteli (krvácení/hoření z předchozích tahů).
  for (const dot of enemy.dots) {
    if (dot.remainingTicks <= 0) continue;
    enemy.currentHealth -= dot.tickDamage;
    dot.remainingTicks -= 1;
    pushEvent({
      t,
      type: 'dot',
      message: `🔥 ${enemy.name} suffers ${dot.tickDamage} from ${dot.abilityName}. Target: ${Math.max(0, Math.round(enemy.currentHealth))} HP`,
      source: dot.sourceName,
      target: enemy.name,
      amount: dot.tickDamage,
      ability: dot.abilityName,
      targetHealthRemaining: Math.max(0, Math.round(enemy.currentHealth)),
    });
  }
  enemy.dots = enemy.dots.filter((d) => d.remainingTicks > 0);
  if (enemy.currentHealth <= 0) return { state: onEnemyDefeated(state, t, events), events };

  // Class resources (ADR 0034): commit — utratí slot (kouzlo, upcast přes `usedSlotTier`)
  // resp. Ki (Monkova technika). Dostupnost ověřena výše; DoT nepřítele nezabil → ability dopadne.
  if (abilityTier >= 1)
    usedSlotTier = spendSlotForTier(state.player.spellSlots, abilityTier, abilityPrefersUpcast(ability));
  if (kiCost > 0) state.player.kiPoints = (state.player.kiPoints ?? 0) - kiCost;

  // (2) Hráčova ability.
  const enemyAsActor = enemyActor(enemy);
  if (ability.kind === 'heal') {
    // Fall-off platí i na heal spelly (ne jen draft karty) → sdílený čítač
    // `healsUsed`. Spamovat léčení se nevyplatí: každý další heal je slabší.
    const falloff = healFalloff(state.healsUsed);
    const heal = Math.round(player.attackPower * ability.damageMult * HEAL_POWER_FACTOR * falloff);
    state.player.currentHealth = Math.min(state.player.maxHealth, state.player.currentHealth + heal);
    state.healsUsed += 1;
    const dim = falloff < 1 ? ' (diminished)' : '';
    pushEvent({
      t,
      type: 'heal',
      message: `✨ ${player.name} casts ${ability.name}, healing for ${heal}${dim}. Self: ${state.player.currentHealth} HP`,
      source: player.name,
      target: player.name,
      amount: heal,
      ability: ability.name,
    });
  } else if (ability.kind === 'shield') {
    const shield = Math.round(player.attackPower * ability.damageMult);
    state.player.absorb += shield;
    pushEvent({
      t,
      type: 'absorb',
      message: `🛡️ ${player.name} casts ${ability.name}, absorbing the next ${shield} damage.`,
      source: player.name,
      target: player.name,
      amount: shield,
      ability: ability.name,
    });
  } else if (ability.kind === 'mitigation') {
    state.player.mitigationTurns = Math.max(1, Math.round((ability.mitigationDurationSec ?? GAUNTLET_TURN_SEC) / GAUNTLET_TURN_SEC));
    state.player.mitigationPct = ability.mitigationPct ?? 0;
    pushEvent({
      t,
      type: 'ability',
      message: `🛡️ ${player.name} uses ${ability.name}, reducing damage taken for a few turns.`,
      source: player.name,
      target: player.name,
      ability: ability.name,
    });
  } else {
    // strike / drain / dot / basic — přímý úder přes sdílený computeHit.
    const targetHpPct = enemy.currentHealth / enemy.maxHealth;
    // Literal D&D spell dice (ADR 0032): kouzla s `dice` jdou přímo (mult = 1);
    // jinak škálují přes attackPower (damageMult). Upcast dle slotu,
    // kterým bylo kouzlo sesláno (ADR 0034 → Gauntlet teď trackuje slot tier).
    const spec = abilityDamageSpec(ability, usedSlotTier, player.level);
    const mult = spec ? 1 : abilityDamageMult(ability, targetHpPct);
    // Bonus kostky na weapon hit (ADR 0036) + advantage — D&D martial maneuvery.
    const bonusDice = bonusDiceSpec(ability, usedSlotTier, player.level);
    // Per-ability typ poškození (MR-10d) — kouzlo přebíjí typ classy.
    const hit = computeHit(player, enemyAsActor, rng, mult, false, ability.damageType, spec, {
      advantage: ability.advantage ? 'advantage' : undefined,
      bonusDice,
    });
    // Per-spell saving throw (ADR 0032) → nepřítel hodí proti spell save DC hráče.
    if (hit.hit && ability.save) {
      const outcome = applySpellSave(ability, player, enemyAsActor, rng, hit.amount);
      hit.amount = outcome.amount;
      if (outcome.message) {
        pushEvent({ t, type: 'ability', message: outcome.message, source: enemy.name, target: player.name });
      }
    }
    enemy.currentHealth -= hit.amount;

    let healed = hit.hit ? Math.round(hit.amount * player.lifesteal) : 0;
    if (hit.hit && ability.kind === 'drain') healed += Math.round(hit.amount * (ability.drainHealFraction ?? 0));
    if (healed > 0) {
      state.player.currentHealth = Math.min(state.player.maxHealth, state.player.currentHealth + healed);
    }

    if (hit.hit && ability.kind === 'dot' && ability.dotTicks) {
      // DoT tik respektuje typ + obrany cíle (MR-10d), stejně jako přímý zásah.
      const dotType = ability.damageType ?? player.damageType ?? 'bludgeoning';
      const interaction = damageInteraction(dotType, enemyAsActor);
      const raw = dotTickRaw(ability, player);
      const tickDamage = interaction === 'immune' ? 0 : Math.max(1, applyDamageInteraction(Math.max(1, raw), interaction));
      enemy.dots.push({
        remainingTicks: ability.dotTicks,
        tickDamage,
        sourceName: player.name,
        abilityName: ability.name,
      });
    }

    const remaining = Math.max(0, Math.round(enemy.currentHealth));
    const named = ability.id === GAUNTLET_BASIC_ATTACK.id ? undefined : ability.name;
    pushEvent({
      t,
      type: named ? 'ability' : 'attack',
      message: hit.hit
        ? buildAttackMessage({
            attacker: player,
            targetName: enemy.name,
            amount: hit.amount,
            crit: hit.crit,
            healed,
            abilityName: named,
            suffix: `. Target: ${remaining} HP`,
          })
        : missMessage(player.name, enemy.name, hit),
      source: player.name,
      target: enemy.name,
      amount: hit.amount,
      crit: hit.crit,
      ability: named,
      targetHealthRemaining: remaining,
    });

    // Akční ekonomika (ADR 0042, Slice 2): Action Surge/Onslaught → extra úder(y)
    // zbraní v tomtéž tahu, než nepřítel protiútočí.
    const extras = extraActionCount(ability);
    for (let k = 0; k < extras && enemy.currentHealth > 0; k++) {
      const xr = computeHit(player, enemyAsActor, rng, 1, false);
      enemy.currentHealth -= xr.amount;
      const xh = xr.hit ? Math.round(xr.amount * player.lifesteal) : 0;
      if (xh > 0) state.player.currentHealth = Math.min(state.player.maxHealth, state.player.currentHealth + xh);
      const xrem = Math.max(0, Math.round(enemy.currentHealth));
      pushEvent({
        t,
        type: 'ability',
        message: xr.hit
          ? buildAttackMessage({
              attacker: player,
              targetName: enemy.name,
              amount: xr.amount,
              crit: xr.crit,
              healed: xh,
              abilityName: EXTRA_ATTACK_ABILITY.name,
              suffix: `. Target: ${xrem} HP`,
            })
          : missMessage(player.name, enemy.name, xr),
        source: player.name,
        target: enemy.name,
        amount: xr.amount,
        crit: xr.crit,
        ability: EXTRA_ATTACK_ABILITY.name,
        targetHealthRemaining: xrem,
      });
    }
  }

  // Cooldown zvolené ability.
  const cd = cooldownTurns(ability);
  if (cd > 0) state.player.cooldowns[abilityId] = cd;
  // Spotřebuj „once per combat" okno (ADR 0042) — no-op u abilit bez flagu.
  if (ability.oncePerCombat) (state.player.usedOncePerCombat ??= []).push(abilityId);

  if (enemy.currentHealth <= 0) return { state: onEnemyDefeated(state, t, events), events };

  // Bonus action (ADR 0042, Slice 3): hráč ji **vědomě zvolí** vedle hlavní akce
  // (Healing Word) — nic se neděje automaticky. Léčení čerpá run-wide `healsUsed`
  // → podléhá `healFalloff` (diminishing), takže nerozbije roguelite heal-scarcity
  // (balanc křivkou). Bez `bonusAbilityId` (nebo == hlavní akci) bonus neproběhne.
  if (bonusAbilityId && bonusAbilityId !== abilityId && state.player.currentHealth < state.player.maxHealth) {
    const b = player.signatureAbilities.find((a) => a.id === bonusAbilityId);
    const bTier = b?.spellTier ?? 0;
    const canBonus =
      b != null &&
      isBonusAction(b) &&
      b.kind === 'heal' &&
      (state.player.cooldowns[b.id] ?? 0) <= 0 &&
      (bTier < 1 || hasSlotForTier(state.player.spellSlots, bTier)) &&
      (b.kiCost ?? 0) <= (state.player.kiPoints ?? 0);
    if (canBonus) {
      if (bTier >= 1) spendSlotForTier(state.player.spellSlots, bTier, abilityPrefersUpcast(b));
      if ((b.kiCost ?? 0) > 0) state.player.kiPoints = (state.player.kiPoints ?? 0) - (b.kiCost ?? 0);
      const falloff = healFalloff(state.healsUsed);
      const heal = Math.round(player.attackPower * b.damageMult * HEAL_POWER_FACTOR * falloff);
      state.player.currentHealth = Math.min(state.player.maxHealth, state.player.currentHealth + heal);
      state.healsUsed += 1;
      state.player.cooldowns[b.id] = cooldownTurns(b);
      const dim = falloff < 1 ? ' (diminished)' : '';
      pushEvent({
        t,
        type: 'heal',
        message: `✨ ${player.name} casts ${b.name} as a bonus action, healing for ${heal}${dim}. Self: ${Math.round(state.player.currentHealth)} HP`,
        source: player.name,
        target: player.name,
        amount: heal,
        ability: b.name,
      });
    }
  }

  // (3) Protiúder nepřítele.
  const enemyHit = computeHit(enemyAsActor, player, rng, 1, false);
  let incoming = enemyHit.amount;
  if (state.player.mitigationTurns > 0 && state.player.mitigationPct > 0) {
    incoming = Math.max(1, Math.round(incoming * (1 - state.player.mitigationPct)));
  }
  const absorbResult = applyAbsorb(incoming, state.player.absorb);
  state.player.absorb = absorbResult.shieldRemaining;
  state.player.currentHealth -= absorbResult.netDamage;
  const absorbSuffix = absorbResult.absorbed > 0 ? ` (${absorbResult.absorbed} absorbed)` : '';
  pushEvent({
    t,
    type: 'attack',
    message: enemyHit.hit
      ? `${enemy.name} hits ${player.name} for ${absorbResult.netDamage}${enemyHit.crit ? ' (crit!)' : ''}${absorbSuffix}. You: ${Math.max(0, Math.round(state.player.currentHealth))} HP`
      : missMessage(enemy.name, player.name, enemyHit),
    source: enemy.name,
    target: player.name,
    amount: absorbResult.netDamage,
    crit: enemyHit.crit,
    targetHealthRemaining: Math.max(0, Math.round(state.player.currentHealth)),
  });

  if (state.player.currentHealth <= 0) {
    state.player.currentHealth = 0;
    state.status = 'dead';
    pushEvent({
      t,
      type: 'player_defeated',
      message: `💀 ${player.name} has fallen on wave ${state.wave}. Final score: ${state.wavesCleared} waves cleared.`,
      source: enemy.name,
      target: player.name,
    });
    trimLog(state);
    return { state, events };
  }

  // (4) Údržba: dekrement cooldownů + mitigace, posun tahu.
  for (const id of Object.keys(state.player.cooldowns)) {
    state.player.cooldowns[id] = Math.max(0, (state.player.cooldowns[id] ?? 0) - 1);
  }
  if (state.player.mitigationTurns > 0) {
    state.player.mitigationTurns -= 1;
    if (state.player.mitigationTurns === 0) state.player.mitigationPct = 0;
  }
  state.turn += 1;
  trimLog(state);
  return { state, events };
}

/** Společné zpracování porážky nepřítele: skóre +1, status drafting (bez nabídky). */
function onEnemyDefeated(state: GauntletRunState, t: number, events: CombatEvent[]): GauntletRunState {
  const enemy = state.enemy!;
  enemy.currentHealth = 0;
  state.wavesCleared = state.wave;
  state.status = 'drafting';
  state.draft = null;
  const e: CombatEvent = {
    t,
    type: 'enemy_defeated',
    message: `☠️ ${enemy.name} is defeated! Wave ${state.wave} cleared — choose your reward.`,
    target: enemy.name,
  };
  events.push(e);
  state.log.push(e);
  trimLog(state);
  return state;
}

// ── Draft odměn mezi vlnami ──────────────────────────────────────────────────

interface BuffSpec {
  id: string;
  name: string;
  description: string;
  pick: Omit<GauntletPick, 'kind' | 'id' | 'label'>;
}

/** Kurátorovaný pool buffů (run-scoped). */
const GAUNTLET_BUFFS: BuffSpec[] = [
  { id: 'might', name: "Berserker's Might", description: '+15% attack power for the rest of the run.', pick: { attackMult: 1.15 } },
  { id: 'fortitude', name: 'Fortitude', description: '+20% maximum health, and heal that amount.', pick: { maxHealthMult: 1.2 } },
  { id: 'precision', name: 'Deadly Precision', description: '+8% critical strike chance.', pick: { bonusCritChance: 0.08 } },
  { id: 'vampirism', name: 'Vampiric Aura', description: '+6% life leech on your attacks.', pick: { bonusLifesteal: 0.06 } },
  { id: 'ironhide', name: 'Iron Hide', description: '+120 armor, reducing incoming damage.', pick: { bonusArmor: 120 } },
];
// POZN.: Léčivé draft karty (healPct/healFull) zatím záměrně NEJSOU v poolu
// (rozhodnutí PM) — léčit jde jen heal *spelly*, a ty mají fall-off (sdílený
// čítač `healsUsed`), aby nešlo spamovat heal+DoT. Engine healPct/healFull
// podporuje, takže karty lze později přidat bez změny mechaniky.

/** Sestaví jednu buff nabídku (vyhne se už nabídnutým id v tomto draftu). */
function rollBuffOption(
  rng: SeededRng,
  used: Set<string>,
  healsUsed: number,
): GauntletDraftOption | null {
  const pool = GAUNTLET_BUFFS.filter((b) => !used.has(b.id));
  if (pool.length === 0) return null;
  const spec = pool[rng.int(0, pool.length - 1)]!;
  used.add(spec.id);

  // Léčivé karty ukážou *aktuální* efektivní % (po fall-offu z předchozích healů).
  let description = spec.description;
  const basePct = spec.pick.healFull ? 1 : (spec.pick.healPct ?? 0);
  if (basePct > 0) {
    const effPct = Math.round(basePct * healFalloff(healsUsed) * 100);
    const note = healsUsed > 0 ? ' (reduced — you have used heals already)' : '';
    const atk = spec.pick.attackMult
      ? ` and gain +${Math.round((spec.pick.attackMult - 1) * 100)}% attack power`
      : '';
    description = `Heal ${effPct}% of your maximum health${atk}.${note}`;
  }

  return {
    id: `buff:${spec.id}`,
    kind: 'buff',
    name: spec.name,
    description,
    pick: { kind: 'buff', id: spec.id, label: spec.name, ...spec.pick },
  };
}

/** Sestaví jednu ability nabídku ze spellů, které postava (zatím) nemá. */
function rollAbilityOption(
  rng: SeededRng,
  base: CombatActor,
  picks: GauntletPick[],
): GauntletDraftOption | null {
  const owned = new Set(effectivePlayerActor(base, picks).signatureAbilities.map((a) => a.id));
  const candidates = Object.keys(SIGNATURE_ABILITIES).filter(
    (id) => !owned.has(id) && SIGNATURE_ABILITIES[id]!.kind !== 'mitigation',
  );
  if (candidates.length === 0) return null;
  const id = candidates[rng.int(0, candidates.length - 1)]!;
  const spec = SIGNATURE_ABILITIES[id]!;
  const ability: SignatureAbility = { id, ...spec };
  return {
    id: `ability:${id}`,
    kind: 'ability',
    name: ability.name,
    description: ability.description ?? 'A new ability for this run.',
    pick: { kind: 'ability', id, label: ability.name, ability },
  };
}

/**
 * Složí nabídku draftu (3 možnosti). `gearOption` (volitelné, skládá API z
 * reálných itemů + porovnání) obsadí jeden slot; zbytek doplní buff + ability
 * (a případně další buffy). Deterministické — volající dodá seedovaný `rng`.
 */
export function rollGauntletDraft(
  base: CombatActor,
  state: GauntletRunState,
  rng: SeededRng,
  gearOption?: GauntletDraftOption | null,
): GauntletDraftOption[] {
  const options: GauntletDraftOption[] = [];
  const usedBuffs = new Set<string>();
  if (gearOption) options.push(gearOption);

  const buff = rollBuffOption(rng, usedBuffs, state.healsUsed);
  if (buff) options.push(buff);

  const ability = rollAbilityOption(rng, base, state.picks);
  if (ability) options.push(ability);

  while (options.length < 3) {
    const extra = rollBuffOption(rng, usedBuffs, state.healsUsed);
    if (!extra) break;
    options.push(extra);
  }
  return options.slice(0, 3);
}

/**
 * Aplikuje vybraný draft a posune run na další vlnu. Validuje, že je `optionId`
 * v aktuální nabídce; jinak vrací stav beze změny. Po dosažení `GAUNTLET_MAX_WAVE`
 * uzavře run jako `retired` (dokončený).
 */
export function applyGauntletDraft(
  base: CombatActor,
  state: GauntletRunState,
  optionId: string,
  level: number,
): GauntletRunState {
  if (state.status !== 'drafting' || !state.draft) return state;
  const option = state.draft.find((o) => o.id === optionId);
  if (!option) return state;

  state.picks.push(option.pick);
  state.draft = null;

  // Přepočti max HP (drafty mohou zvýšit) — navýšení max HP přidá i current.
  // POZN.: mezi vlnami se HP NEregeneruje automaticky; léčení dává jen draft
  // karta (`healPct`/`healFull`) → přežití je vědomá volba (ofenziva vs. heal).
  const eff = effectivePlayerActor(base, state.picks);
  const delta = eff.maxHealth - state.player.maxHealth;
  state.player.maxHealth = eff.maxHealth;
  if (delta > 0) state.player.currentHealth += delta;
  const basePct = option.pick.healFull ? 1 : (option.pick.healPct ?? 0);
  if (basePct > 0) {
    const effPct = basePct * healFalloff(state.healsUsed);
    const heal = Math.round(eff.maxHealth * effPct);
    state.player.currentHealth = Math.min(eff.maxHealth, state.player.currentHealth + heal);
    state.healsUsed += 1;
  }

  state.wave += 1;
  if (state.wave > GAUNTLET_MAX_WAVE) {
    state.status = 'retired';
    state.enemy = null;
    return state;
  }
  spawnWave(base, state, level);
  return state;
}

// ── Odměny + denní strop ─────────────────────────────────────────────────────

export interface GauntletReward {
  xp: number;
  gold: number;
  items: string[];
}

/** Materiálové pooly per tier (validní id z `MATERIALS`). */
const GAUNTLET_MATERIAL_POOL: Record<number, string[]> = {
  1: ['copper_ore', 'peacebloom', 'light_leather'],
  2: ['iron_ore', 'briarthorn', 'medium_leather'],
  3: ['mithril_ore', 'goldthorn', 'heavy_leather'],
};

function materialTierForLevel(level: number): number {
  if (level < 15) return 1;
  if (level < 35) return 2;
  return 3;
}

/**
 * Hrubá (před denním stropem) odměna za run podle počtu vyčištěných vln a levelu.
 * Materiály se losují deterministicky (`rng`) z tieru dle levelu. Drobné odměny
 * (idle jádro zůstává hlavní progrese) — viz `gauntletDaily*Cap`.
 */
export function gauntletRunReward(wavesCleared: number, level: number, rng: SeededRng): GauntletReward {
  if (wavesCleared <= 0) return { xp: 0, gold: 0, items: [] };
  const scale = Math.sqrt(Math.max(1, level));
  const xp = Math.round(wavesCleared * 45 * scale);
  const gold = Math.round(wavesCleared * 7 * scale);

  const items: string[] = [];
  const drops = Math.floor(wavesCleared / 4);
  if (drops > 0) {
    const pool = GAUNTLET_MATERIAL_POOL[materialTierForLevel(level)]!;
    for (let i = 0; i < drops; i++) items.push(pool[rng.int(0, pool.length - 1)]!);
  }
  return { xp, gold, items };
}

/** Denní strop XP z minihry (škáluje s levelem, drží to jako „drobnou" odměnu). */
export function gauntletDailyXpCap(level: number): number {
  return Math.round(900 * Math.sqrt(Math.max(1, level)));
}

/** Denní strop zlata z minihry. */
export function gauntletDailyGoldCap(level: number): number {
  return Math.round(140 * Math.sqrt(Math.max(1, level)));
}

/**
 * Ořízne odměnu denním stropem podle už získaného množství dnes. Vrací udělenou
 * (capped) odměnu. Materiály se nedávají, pokud je strop XP i zlata vyčerpán.
 */
export function capGauntletReward(
  reward: GauntletReward,
  level: number,
  earnedXpToday: number,
  earnedGoldToday: number,
): GauntletReward {
  const xpRemaining = Math.max(0, gauntletDailyXpCap(level) - earnedXpToday);
  const goldRemaining = Math.max(0, gauntletDailyGoldCap(level) - earnedGoldToday);
  const xp = Math.min(reward.xp, xpRemaining);
  const gold = Math.min(reward.gold, goldRemaining);
  const items = xpRemaining > 0 || goldRemaining > 0 ? reward.items : [];
  return { xp, gold, items };
}
