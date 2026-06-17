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
  buildAttackMessage,
  buildEnemyActor,
  computeHit,
  applyAbsorb,
  SIGNATURE_ABILITIES,
  type CombatActor,
  type CombatEvent,
  type SignatureAbility,
} from './combat';

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
  /** Zbývající tahy aktivního mitigation okna (0 = neaktivní). */
  mitigationTurns: number;
  /** Podíl redukce příchozího poškození během mitigation okna (0..1). */
  mitigationPct: number;
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
  return [GAUNTLET_BASIC_ATTACK, ...effectivePlayerActor(base, picks).signatureAbilities];
}

// ── Generování nepřátel ──────────────────────────────────────────────────────

const NORMAL_ENEMY_NAMES = [
  'Ravenous Ghoul', 'Cursed Footman', 'Venomfang Spider', 'Bloodscalp Raider',
  'Defias Bandit', 'Rabid Worg', 'Cinder Imp', 'Frostbite Elemental',
  'Plagued Zombie', 'Shadowsworn Cultist',
];
const ELITE_ENEMY_NAMES = [
  'Gladiator Champion', 'Infernal Brute', 'Dread Reaver', 'Crypt Lord',
  'Stormcaller Magus', 'Bloodfang Alpha',
];

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

  // Kompoundovaný (exponenciální) růst → obtížnost stoupá stále strměji.
  const maxHealth = Math.round((36 + level * 16) * GAUNTLET_HP_GROWTH ** waveStep * eliteHp);
  const attackPower = Math.round((3 + level * 0.8) * GAUNTLET_AP_GROWTH ** waveStep * eliteAp);
  const armor = Math.round(level * 2 + wave * 4);

  const pool = isElite ? ELITE_ENEMY_NAMES : NORMAL_ENEMY_NAMES;
  const name = pool[rng.int(0, pool.length - 1)]!;

  return { name, isElite, maxHealth, currentHealth: maxHealth, attackPower, armor, dots: [] };
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
      mitigationTurns: 0,
      mitigationPct: 0,
    },
    enemy: null,
    picks: [],
    draft: null,
    log: [],
    wavesCleared: 0,
    healsUsed: 0,
  };
  spawnWave(state, level);
  return state;
}

/** Nastaví nepřítele aktuální vlny + resetuje per-vlnu stav hráče (cd/štít/mitigace). */
function spawnWave(state: GauntletRunState, level: number): void {
  const rng = new SeededRng(seedFromString(`${state.seed}:enemy:${state.wave}`));
  state.enemy = buildGauntletEnemy(level, state.wave, rng);
  state.player.cooldowns = {};
  state.player.absorb = 0;
  state.player.mitigationTurns = 0;
  state.player.mitigationPct = 0;
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
): { state: GauntletRunState; events: CombatEvent[] } {
  if (state.status !== 'in_combat' || !state.enemy) return { state, events: [] };

  const player = effectivePlayerActor(base, state.picks);
  const ability =
    abilityId === GAUNTLET_BASIC_ATTACK.id
      ? GAUNTLET_BASIC_ATTACK
      : player.signatureAbilities.find((a) => a.id === abilityId);
  if (!ability) return { state, events: [] };
  if (!isGauntletAbilityReady(state, abilityId)) return { state, events: [] };

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
    const mult = abilityDamageMult(ability, targetHpPct);
    const hit = computeHit(player, enemyAsActor, rng, mult, false);
    enemy.currentHealth -= hit.amount;

    let healed = Math.round(hit.amount * player.lifesteal);
    if (ability.kind === 'drain') healed += Math.round(hit.amount * (ability.drainHealFraction ?? 0));
    if (healed > 0) {
      state.player.currentHealth = Math.min(state.player.maxHealth, state.player.currentHealth + healed);
    }

    if (ability.kind === 'dot' && ability.dotTicks && ability.dotTickMult) {
      enemy.dots.push({
        remainingTicks: ability.dotTicks,
        tickDamage: Math.max(1, Math.round(player.attackPower * ability.dotTickMult)),
        sourceName: player.name,
        abilityName: ability.name,
      });
    }

    const remaining = Math.max(0, Math.round(enemy.currentHealth));
    pushEvent({
      t,
      type: ability.id === GAUNTLET_BASIC_ATTACK.id ? 'attack' : 'ability',
      message: buildAttackMessage({
        attacker: player,
        targetName: enemy.name,
        amount: hit.amount,
        crit: hit.crit,
        healed,
        abilityName: ability.id === GAUNTLET_BASIC_ATTACK.id ? undefined : ability.name,
        suffix: `. Target: ${remaining} HP`,
      }),
      source: player.name,
      target: enemy.name,
      amount: hit.amount,
      crit: hit.crit,
      ability: ability.id === GAUNTLET_BASIC_ATTACK.id ? undefined : ability.name,
      targetHealthRemaining: remaining,
    });
  }

  // Cooldown zvolené ability.
  const cd = cooldownTurns(ability);
  if (cd > 0) state.player.cooldowns[abilityId] = cd;

  if (enemy.currentHealth <= 0) return { state: onEnemyDefeated(state, t, events), events };

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
    message: `${enemy.name} hits ${player.name} for ${absorbResult.netDamage}${enemyHit.crit ? ' (crit!)' : ''}${absorbSuffix}. You: ${Math.max(0, Math.round(state.player.currentHealth))} HP`,
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
  spawnWave(state, level);
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
