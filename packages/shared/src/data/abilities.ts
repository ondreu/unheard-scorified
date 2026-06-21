/**
 * Katalog combat abilit — D&D Remaster (MR-2). Jediný zdroj pravdy pro to, jakého
 * *druhu* je která ability (strike / drain / dot / heal / shield / mitigation) →
 * engine podle toho generuje bohatý combat log a aplikuje mechaniku (DoT tiky,
 * lifesteal „drain", absorpční štíty, mitigace).
 *
 * Catalog je čistá data (žádný import z `combat.ts`) → žádný cyklus.
 *
 * MR-2: abilit kit už neodemykají WoW talent capstony, ale **class + subclass +
 * level** (D&D progrese). Combat tagy (crit/haste/damage/lifesteal/shield) nově
 * pocházejí z **featů/ASI** (viz `levelup.ts`, `feats.ts`) — `SHIELD_TAGS` a
 * `COMBAT_TAG_EFFECTS` (v `combat.ts`) se recyklují. `SIGNATURE_ABILITIES` zůstává
 * jako draftovatelný pool kouzel pro Gauntlet (M13) a combat-lookup.
 */
import type { AbilityScore } from '../character';
import type { ConditionRider } from '../conditions';
import type { DiceSpec } from '../dice';
import type { ClassId, SubclassId } from './classes';
import type { CreatureType, DamageType } from './damage';

/**
 * Druh abilit — řídí log i mechaniku v enginu. `buff` (ADR 0036) = koncentrační
 * buff (Hunter's Mark, Hex): nedělá přímý damage, ale přidává `riderDice` ke každému
 * zásahu po dobu trvání (v idle modelu = celý encounter, aplikováno pasivně).
 */
export type AbilityKind = 'strike' | 'drain' | 'dot' | 'heal' | 'shield' | 'mitigation' | 'buff';

/**
 * Per-spell saving throw (MR-10 / ADR 0032). Cíl si hodí záchranný hod proti spell
 * save DC útočníka; `effect` určí, co úspěch znamená:
 *  - `'half'`   — úspěch = poloviční poškození (Fireball, Moonbeam, …).
 *  - `'negate'` — úspěch = žádné poškození (save-or-nothing).
 *  - `'none'`   — poškození se savem **nemění** (plný úder); save jen rozhoduje o
 *                 `condition` rideru (Stunning Strike / Trip Attack: dmg + save-or-stun).
 */
export interface SpellSave {
  ability: AbilityScore;
  effect: 'half' | 'negate' | 'none';
}

/**
 * Signature ability. Plně serializovatelná (součást snapshotu bojového profilu).
 * `kind` + parametry DoT/drain/execute/mitigation dovolí enginu generovat divácky
 * zajímavý log a hloubku pro min-max.
 */
export interface SignatureAbility {
  id: string;
  name: string;
  /** Hráči viditelný popis (anglicky, EN = jazyk hry). Volitelný u boss abilit. */
  description?: string;
  /** Druh — strike (přímý úder), drain (úder + self-heal), dot (úder + krvácení), … */
  kind: AbilityKind;
  cooldownSec: number;
  /** Násobek poškození (strike/drain/dot) resp. healu (heal) na úder. */
  damageMult: number;
  /** DoT: celková doba krvácení v sekundách. */
  dotDurationSec?: number;
  /** DoT: počet tiků rozložených přes `dotDurationSec`. */
  dotTicks?: number;
  /** DoT: násobek poškození jednoho tiku (z attack power útočníka). */
  dotTickMult?: number;
  /**
   * Literal D&D kostky **jednoho DoT tiku** (ADR 0036) — odlišné od `dice` (impact/
   * strike): Moonbeam 2d10/tik, Spirit Guardians 3d8/tik. Když je vyplněné, per-tik
   * poškození = `diceAverage(dotDice)` (deterministicky), `dotTickMult` se ignoruje.
   * Pure-aura DoT má `damageMult: 0` (žádný impact) → veškeré poškození jde z tiků.
   */
  dotDice?: DiceSpec;
  /** Drain: podíl uděleného poškození, který útočníka vyléčí (navíc k lifestealu). */
  drainHealFraction?: number;
  /** Mitigation: podíl sníženého příchozího poškození (0..1) po dobu trvání. */
  mitigationPct?: number;
  /** Mitigation: doba trvání obranného okna v sekundách. */
  mitigationDurationSec?: number;
  /**
   * D&D spell tier (MR-4): 0 = cantrip / at-will (zdarma, bez slotu), 1..9 =
   * kouzlo daného levelu (spotřebuje spell slot ≥ tier). U martial tříd
   * (Barbarian/Fighter/Monk/Rogue) jsou „abilities" bojové techniky, ne kouzla →
   * `spellTier` nedefinováno (nepatří do spellbooku, viz `casterTypeOf`).
   */
  spellTier?: number;
  /**
   * Typ poškození kouzla/techniky (MR-10d). Přebíjí `attackDamageType` classy pro
   * tento konkrétní útok → caster není „type-locked" (Magic Missile = force,
   * Fireball = fire, Sacred Flame = radiant…). `undefined` = zdědí typ zbraně/classy
   * (typicky martial techniky = fyzické dle zbraně). Aktivuje MR-7 resistance/
   * vulnerability/immunity per kouzlo.
   */
  damageType?: DamageType;
  /**
   * Literal D&D damage dice (ADR 0032). Když je vyplněné, engine hodí **přímo
   * tyto kostky** (Fireball 8d6, nezávisle na `attackPower`/`damageMult`) místo
   * `damageMult × attackPower`. `undefined` = stará cesta (martial techniky,
   * drainy, healy bez literal kostek) → škáluje přes `attackPower`.
   */
  dice?: DiceSpec;
  /**
   * Upcast (ADR 0032): počet kostek navíc za **každý tier nad** `spellTier`, kterým
   * je kouzlo sesláno (Fireball +1d6/slot). Aplikuje se jen když má ability `dice`.
   */
  dicePerSlotAbove?: number;
  /** Per-spell saving throw (ADR 0032) — cíl hází proti spell save DC útočníka. */
  save?: SpellSave;
  /**
   * Condition rider (Enemy schopnosti, Slice 2a) — na **neúspěšný `save`** uvalí
   * na cíl status efekt (stun/prone/restrained/frightened/slowed) na daný počet
   * tahů. Vyhodnocuje se ve sdíleném `applySpellSave` (jeden hod = poloviční
   * poškození *i* avšak-condition při úspěchu). Bez `save` se neuplatní.
   */
  condition?: ConditionRider;
  /** Automatický zásah (ignoruje hod na AC) — Magic Missile (ADR 0032). */
  autoHit?: boolean;
  /**
   * Bonus kostky přičtené k **weapon hitu** (ADR 0036, „Fix kouzla") — D&D maneuvery,
   * které nemají vlastní `dice`, ale přidávají kostky k základnímu úderu zbraní:
   * Divine Smite `+2d8`, Sneak Attack `+Nd6`, superiority die `+1d8`. Na rozdíl od
   * `dice` (které weapon damage *nahrazují*) se `bonusDice` **přičtou** k weapon dice.
   * Crit zdvojí i jejich počet (D&D). Upcast přes `dicePerSlotAbove` (Divine Smite +1d8/slot).
   */
  bonusDice?: DiceSpec;
  /**
   * Level-scaling počtu `bonusDice` kostek (ADR 0036): počet = `ceil(level / N)`
   * (Sneak Attack N=2 → 1d6 na lvl 1, 5d6 na lvl 9, 10d6 na lvl 19). `undefined`
   * = pevný `bonusDice.count`.
   */
  bonusDicePerLevels?: number;
  /**
   * Advantage na hod na zásah (ADR 0036) — Reckless Attack, Assassinate. Hodí 2× d20,
   * vezme vyšší. Nahrazuje WoW-style flat damage bonus reálnou D&D mechanikou.
   */
  advantage?: boolean;
  /**
   * Area of effect (ADR 0036) — kouzlo zasáhne **všechny** cíle, ne jeden: AoE damage
   * (Fireball) poškodí všechny nepřátele, AoE heal (Mass Healing Word) ošetří všechny
   * zraněné spojence. Engine to ctí tam, kde je víc cílů (raid party heal hned;
   * multi-enemy damage „se rozsvítí" s multi-enemy souboji — dungeon overhaul).
   */
  aoe?: boolean;
  /**
   * Koncentrační buff rider (ADR 0036) — `kind: 'buff'` (Hunter's Mark, Hex): tyto
   * kostky se přičtou ke **každému zásahu** útočníka po dobu trvání (+1d6). V idle
   * modelu aplikováno pasivně na celý encounter (`CombatActor.weaponRiderDice`) —
   * jeden rider naráz (koncentrace).
   */
  riderDice?: DiceSpec;
  /**
   * Ki body (ADR 0034, Slice 3) — kolik Ki stojí seslání této techniky (Monk).
   * `undefined`/0 = zdarma (např. Martial Arts základní úder). Když nemá hráč
   * dost Ki, technika se „drží" (jako kouzlo bez slotu) → základní úder.
   */
  kiCost?: number;
  /**
   * D&D akční ekonomika (ADR 0042, Slice 1) — ability použitelná **nejvýše jednou
   * za encounter**: Action Surge (short-rest recovery) a opener Assassinate
   * („na začátku"). Po vyčerpání okna se ability „drží" (actér mlátí basic /
   * jinou ability) až do dalšího encounteru (short rest / nová vlna / nový pull).
   * Sledováno per aktér ve všech simulátorech přes sdílené helpery
   * `abilityOnceAvailable`/`markAbilityUsed` (in-memory simy) resp. pole
   * `usedOncePerCombat` (persistované tahové simy). `undefined`/false = bez limitu.
   */
  oncePerCombat?: boolean;
  /**
   * D&D akční ekonomika (ADR 0042, Slice 2) — ability uděluje **akci navíc** ve
   * stejném kole: po jejím vyřešení aktér hned provede `extraActions` (default 1)
   * **extra útoků zbraní** (Action Surge = druhá Attack action, Onslaught = víc
   * útoků) proti platnému cíli, ještě než jedná soupeř. Sjednoceno přes simulátory
   * (sdílené `extraActionCount` + pseudo-ability `EXTRA_ATTACK_ABILITY`).
   */
  grantsExtraAction?: boolean;
  /** Počet extra útoků, které `grantsExtraAction` udělí (ADR 0042). Default 1. */
  extraActions?: number;
  /**
   * D&D akční slot (ADR 0042, Slice 3) — `'action'` (default) nebo `'bonus'`.
   * Bonus-action ability (Healing Word) jdou v **tahových** simulátorech mimo
   * hlavní akci: aktér v jednom kole provede svou akci **a navíc** jednu ready
   * bonus-action ability (D&D „1 akce + 1 bonus action / kolo"). Ve spojitých
   * (timeline) simech bez pojmu kola je pole kosmetické (ability běží na vlastním
   * cooldown timeru). `undefined` = `'action'`.
   */
  actionCost?: 'action' | 'bonus';
  /**
   * Creature type targeting (Creature type targeting) — kouzlo lze seslat **jen na
   * cíle daných D&D creature typů** (Hold Person → `['humanoid']`, Hold Monster =
   * bez omezení). `undefined`/prázdné = cokoli. Vyhodnocuje sdílený
   * `canTargetCreatureType` (engine i UI gating) proti `CombatActor.creatureType`
   * cíle; cíl bez známého typu (ad-hoc / narativní nepřítel) projde (graceful).
   */
  validTargetTypes?: readonly CreatureType[];
}

/** Šablona katalogu (id se doplní z klíče). */
type AbilitySpec = Omit<SignatureAbility, 'id'>;

/** Ability classy/subclassy odemčená levelem. */
export interface BaselineAbility extends SignatureAbility {
  /** Minimální level, od kterého je ability dostupná. */
  unlockLevel: number;
}

interface BaselineOpts {
  dot?: { dotDurationSec: number; dotTicks: number; dotTickMult: number; dotDice?: DiceSpec };
  drainHealFraction?: number;
  mitigation?: { mitigationPct: number; mitigationDurationSec: number };
  /** D&D spell tier (0 = cantrip, 1..9 = kouzlo). Jen pro caster classy. */
  spellTier?: number;
  /** Typ poškození (MR-10d) — přebíjí typ classy. `undefined` = zdědí (martial = zbraň). */
  damageType?: DamageType;
  /** Literal D&D damage dice (ADR 0032) — hodí se přímo místo `damageMult × attackPower`. */
  dice?: DiceSpec;
  /** Upcast: kostek navíc za tier nad `spellTier` (ADR 0032). */
  dicePerSlotAbove?: number;
  /** Per-spell saving throw (ADR 0032). */
  save?: SpellSave;
  /** Condition rider (Slice 2d) — na neúspěšný `save` uvalí status efekt na cíl. */
  condition?: ConditionRider;
  /** Automatický zásah (Magic Missile). */
  autoHit?: boolean;
  /** Ki cost (ADR 0034) — Monkovy techniky. */
  kiCost?: number;
  /** Nejvýše jednou za encounter (ADR 0042) — Action Surge / opener Assassinate. */
  oncePerCombat?: boolean;
  /** Uděluje akci navíc ve stejném kole (ADR 0042, Slice 2) — Action Surge / Onslaught. */
  grantsExtraAction?: boolean;
  /** Počet extra útoků, které `grantsExtraAction` udělí (ADR 0042). Default 1. */
  extraActions?: number;
  /** D&D akční slot (ADR 0042, Slice 3) — `'action'` (default) / `'bonus'` (Healing Word). */
  actionCost?: 'action' | 'bonus';
  /** Bonus kostky na weapon hit (ADR 0036) — Divine Smite/Sneak Attack/superiority. */
  bonusDice?: DiceSpec;
  /** Level-scaling počtu bonus kostek (ADR 0036) — Sneak Attack ceil(level/N). */
  bonusDicePerLevels?: number;
  /** Advantage na hod na zásah (ADR 0036) — Reckless Attack/Assassinate. */
  advantage?: boolean;
  /** AoE — zasáhne všechny nepřátele / ošetří všechny spojence (ADR 0036). */
  aoe?: boolean;
  /** Koncentrační buff rider (ADR 0036) — Hunter's Mark/Hex +1d6 na každý zásah. */
  riderDice?: DiceSpec;
  /** Creature type targeting — kouzlo jen na vybrané typy (Hold Person → humanoid). */
  validTargetTypes?: readonly CreatureType[];
}

function ba(
  id: string,
  name: string,
  description: string,
  kind: AbilityKind,
  cooldownSec: number,
  damageMult: number,
  unlockLevel: number,
  opts: BaselineOpts = {},
): BaselineAbility {
  return {
    id,
    name,
    description,
    kind,
    cooldownSec,
    damageMult,
    unlockLevel,
    ...opts.dot,
    ...(opts.drainHealFraction ? { drainHealFraction: opts.drainHealFraction } : {}),
    ...(opts.mitigation ?? {}),
    ...(opts.spellTier !== undefined ? { spellTier: opts.spellTier } : {}),
    ...(opts.damageType !== undefined ? { damageType: opts.damageType } : {}),
    ...(opts.dice !== undefined ? { dice: opts.dice } : {}),
    ...(opts.dicePerSlotAbove !== undefined ? { dicePerSlotAbove: opts.dicePerSlotAbove } : {}),
    ...(opts.save !== undefined ? { save: opts.save } : {}),
    ...(opts.condition !== undefined ? { condition: opts.condition } : {}),
    ...(opts.autoHit !== undefined ? { autoHit: opts.autoHit } : {}),
    ...(opts.kiCost !== undefined ? { kiCost: opts.kiCost } : {}),
    ...(opts.oncePerCombat !== undefined ? { oncePerCombat: opts.oncePerCombat } : {}),
    ...(opts.grantsExtraAction !== undefined ? { grantsExtraAction: opts.grantsExtraAction } : {}),
    ...(opts.extraActions !== undefined ? { extraActions: opts.extraActions } : {}),
    ...(opts.actionCost !== undefined ? { actionCost: opts.actionCost } : {}),
    ...(opts.bonusDice !== undefined ? { bonusDice: opts.bonusDice } : {}),
    ...(opts.bonusDicePerLevels !== undefined ? { bonusDicePerLevels: opts.bonusDicePerLevels } : {}),
    ...(opts.advantage !== undefined ? { advantage: opts.advantage } : {}),
    ...(opts.aoe !== undefined ? { aoe: opts.aoe } : {}),
    ...(opts.riderDice !== undefined ? { riderDice: opts.riderDice } : {}),
    ...(opts.validTargetTypes !== undefined ? { validTargetTypes: opts.validTargetTypes } : {}),
  };
}

// ── Class ability kit (D&D 5e flavor) — odemčeno levelem ─────────────────────
//
// Každá classa má základní sadu abilit/kouzel → rotace nikdy není prázdná.
// Subclass ability se přidává navrch (viz SUBCLASS_ABILITIES). Heal-kind využije
// jen healer role; offensive (strike/drain/dot) používá každý jako filler.

export const CLASS_BASELINE_ABILITIES: Record<ClassId, BaselineAbility[]> = {
  barbarian: [
    ba('barb_reckless_attack', 'Reckless Attack', 'Attacks with reckless abandon — rolls with advantage to hit.', 'strike', 4, 1.0, 1, { advantage: true }),
    ba('barb_frenzied_strikes', 'Frenzied Strikes', 'Extra Attack — a second weapon swing in the same turn.', 'strike', 6, 2.0, 5),
    ba('barb_brutal_strike', 'Brutal Strike', 'A reckless blow that adds 1d10 to the weapon hit.', 'strike', 8, 1.0, 11, { bonusDice: { count: 1, sides: 10, bonus: 0 } }),
  ],
  bard: [
    ba('bard_vicious_mockery', 'Vicious Mockery', 'Cutting insults for 1d4 psychic over 6s; a failed WIS save also leaves the target frightened.', 'dot', 5, 1.1, 1, { dot: { dotDurationSec: 6, dotTicks: 3, dotTickMult: 0.3 }, spellTier: 0, damageType: 'psychic', save: { ability: 'wisdom', effect: 'negate' }, condition: { type: 'frightened', durationTurns: 1 } }),
    ba('bard_healing_word', 'Healing Word', 'A word of power restores 1d4 + your spellcasting modifier to a wounded ally. +1d4 per slot above 1st.', 'heal', 5, 2.0, 1, { spellTier: 1, dice: { count: 1, sides: 4, bonus: 0 }, dicePerSlotAbove: 1, actionCost: 'bonus' }),
    ba('bard_dissonant_whispers', 'Dissonant Whispers', 'Maddening whispers deal 3d6 psychic damage; a failed WIS save also sends the target fleeing in fear. +1d6 per slot above 1st.', 'strike', 7, 1.75, 9, { spellTier: 1, damageType: 'psychic', dice: { count: 3, sides: 6, bonus: 0 }, dicePerSlotAbove: 1, save: { ability: 'wisdom', effect: 'half' }, condition: { type: 'frightened', durationTurns: 1 } }),
  ],
  cleric: [
    ba('cleric_sacred_flame', 'Sacred Flame', 'Radiant flame for 1d8 (DEX save negates).', 'strike', 5, 1.5, 1, { spellTier: 0, damageType: 'radiant', dice: { count: 1, sides: 8, bonus: 0 }, save: { ability: 'dexterity', effect: 'negate' } }),
    ba('cleric_cure_wounds', 'Cure Wounds', 'Channels divine power to heal an ally for 1d8 + your spellcasting modifier. +1d8 per slot above 1st.', 'heal', 6, 2.3, 1, { spellTier: 1, dice: { count: 1, sides: 8, bonus: 0 }, dicePerSlotAbove: 1 }),
    ba('cleric_guiding_bolt', 'Guiding Bolt', 'A bolt of light strikes for 4d6 radiant. +1d6 per slot above 1st.', 'strike', 7, 2.1, 8, { spellTier: 1, damageType: 'radiant', dice: { count: 4, sides: 6, bonus: 0 }, dicePerSlotAbove: 1 }),
    ba('cleric_spirit_guardians', 'Spirit Guardians', 'Spectral guardians sear the enemy for 3d8 radiant each turn over 9s and hamper its movement (WIS save halves, or be slowed).', 'dot', 8, 0, 14, { dot: { dotDurationSec: 9, dotTicks: 3, dotTickMult: 0, dotDice: { count: 3, sides: 8, bonus: 0 } }, spellTier: 3, damageType: 'radiant', save: { ability: 'wisdom', effect: 'half' }, condition: { type: 'slowed', durationTurns: 1 }, aoe: true }),
  ],
  druid: [
    ba('druid_produce_flame', 'Produce Flame', 'Hurls a mote of fire for 1d8.', 'strike', 5, 1.5, 1, { spellTier: 0, damageType: 'fire', dice: { count: 1, sides: 8, bonus: 0 } }),
    ba('druid_healing_word', 'Healing Word', 'Nature mends an ally for 1d4 + your spellcasting modifier. +1d4 per slot above 1st.', 'heal', 5, 2.2, 1, { spellTier: 1, dice: { count: 1, sides: 4, bonus: 0 }, dicePerSlotAbove: 1, actionCost: 'bonus' }),
    ba('druid_moonbeam', 'Moonbeam', 'A beam of moonlight sears for 2d10 radiant each turn over 9s (CON save halves).', 'dot', 8, 0, 8, { dot: { dotDurationSec: 9, dotTicks: 3, dotTickMult: 0, dotDice: { count: 2, sides: 10, bonus: 0 } }, spellTier: 2, damageType: 'radiant', save: { ability: 'constitution', effect: 'half' } }),
    ba('druid_call_lightning', 'Call Lightning', 'Summons a storm bolt for 3d10 lightning (DEX save halves). +1d10 per slot above 3rd.', 'strike', 7, 1.9, 14, { spellTier: 3, damageType: 'lightning', dice: { count: 3, sides: 10, bonus: 0 }, dicePerSlotAbove: 1, save: { ability: 'dexterity', effect: 'half' }, aoe: true }),
  ],
  fighter: [
    ba('fighter_weapon_strike', 'Weapon Strike', 'A disciplined weapon strike.', 'strike', 4, 1.0, 1),
    ba('fighter_action_surge', 'Action Surge', 'A burst of speed grants a second Attack action — once per fight (recovered on a short rest).', 'strike', 8, 1.0, 6, { oncePerCombat: true, grantsExtraAction: true }),
    ba('fighter_trip_attack', 'Trip Attack', 'A Battle Master maneuver: weapon hit plus a 1d8 superiority die, and a STR save or be knocked prone.', 'strike', 7, 1.0, 12, { bonusDice: { count: 1, sides: 8, bonus: 0 }, save: { ability: 'strength', effect: 'none' }, condition: { type: 'prone', durationTurns: 1 } }),
    ba('fighter_onslaught', 'Onslaught', 'Unleashes the fighter\'s extra attacks — two additional weapon strikes in a single devastating turn.', 'strike', 8, 1.0, 20, { grantsExtraAction: true, extraActions: 2 }),
  ],
  monk: [
    ba('monk_martial_arts', 'Martial Arts', 'A swift unarmed strike.', 'strike', 3, 1.0, 1),
    ba('monk_stunning_strike', 'Stunning Strike', 'A precise blow to a pressure point: full weapon damage, and a CON save or be stunned. Costs 1 Ki.', 'strike', 7, 1.0, 5, { kiCost: 1, save: { ability: 'constitution', effect: 'none' }, condition: { type: 'stunned', durationTurns: 1 } }),
    ba('monk_quivering_palm', 'Quivering Palm', 'Lethal vibrations for 10d10 necrotic; a failed CON save also leaves the target reeling and stunned. Costs 3 Ki.', 'strike', 9, 1.0, 11, { kiCost: 3, damageType: 'necrotic', dice: { count: 10, sides: 10, bonus: 0 }, save: { ability: 'constitution', effect: 'half' }, condition: { type: 'stunned', durationTurns: 1 } }),
  ],
  paladin: [
    ba('paladin_divine_smite', 'Divine Smite', 'A radiant strike for 180% weapon damage.', 'strike', 5, 1.8, 1, { spellTier: 1 }),
    ba('paladin_lay_on_hands', 'Lay on Hands', 'Draws on a sacred pool of healing for 4d8 — no spell slot (refreshes on a Long Rest).', 'heal', 26, 2.2, 1, { dice: { count: 4, sides: 8, bonus: 0 } }),
    ba('paladin_searing_smite', 'Searing Smite', 'A flaming blow for 1d6 fire that ignites the foe for 1d6 fire each turn over 8s.', 'dot', 8, 0, 12, { dot: { dotDurationSec: 8, dotTicks: 4, dotTickMult: 0, dotDice: { count: 1, sides: 6, bonus: 0 } }, spellTier: 1, damageType: 'fire', dice: { count: 1, sides: 6, bonus: 0 } }),
    ba('paladin_cure_wounds', 'Cure Wounds', 'A quick prayer restores 1d8 + your spellcasting modifier. +1d8 per slot above 1st.', 'heal', 6, 1.3, 20, { spellTier: 1, dice: { count: 1, sides: 8, bonus: 0 }, dicePerSlotAbove: 1 }),
  ],
  ranger: [
    ba('ranger_hunters_mark', "Hunter's Mark", 'Marks the prey (concentration): every weapon hit deals +1d6 damage for the fight.', 'buff', 5, 0, 1, { spellTier: 1, riderDice: { count: 1, sides: 6, bonus: 0 } }),
    ba('ranger_serpent_arrow', 'Serpent Arrow', 'A venomed arrow for 1d8 poison that poisons for 1d6 each turn over 10s.', 'dot', 9, 0, 6, { dot: { dotDurationSec: 10, dotTicks: 5, dotTickMult: 0, dotDice: { count: 1, sides: 6, bonus: 0 } }, spellTier: 1, damageType: 'poison', dice: { count: 1, sides: 8, bonus: 0 } }),
    ba('ranger_volley', 'Volley', 'A rain of arrows dealing 185% weapon damage.', 'strike', 8, 1.85, 14, { spellTier: 2 }),
    ba('ranger_cure_wounds', 'Cure Wounds', 'Restores 1d8 + your spellcasting modifier to a wounded ally. +1d8 per slot above 1st.', 'heal', 6, 1.7, 9, { spellTier: 1, dice: { count: 1, sides: 8, bonus: 0 }, dicePerSlotAbove: 1 }),
  ],
  rogue: [
    ba('rogue_sneak_attack', 'Sneak Attack', 'A vital strike adding 1d6 per two levels of damage (1d6 at 1, up to 10d6 at 19).', 'strike', 4, 1.0, 1, { bonusDice: { count: 1, sides: 6, bonus: 0 }, bonusDicePerLevels: 2 }),
    ba('rogue_poisoned_blade', 'Poisoned Blade', 'A coated blade for 1d4 piercing that poisons for 1d6 each turn over 8s.', 'dot', 9, 0, 8, { dot: { dotDurationSec: 8, dotTicks: 4, dotTickMult: 0, dotDice: { count: 1, sides: 6, bonus: 0 } }, damageType: 'poison', dice: { count: 1, sides: 4, bonus: 0 } }),
    ba('rogue_assassinate', 'Assassinate', 'A deadly opener struck with advantage, adding full Sneak Attack dice — once per fight.', 'strike', 8, 1.0, 14, { advantage: true, bonusDice: { count: 1, sides: 6, bonus: 0 }, bonusDicePerLevels: 2, oncePerCombat: true }),
  ],
  sorcerer: [
    ba('sorc_fire_bolt', 'Fire Bolt', 'A mote of fire for 1d10.', 'strike', 4, 1.1, 1, { spellTier: 0, damageType: 'fire', dice: { count: 1, sides: 10, bonus: 0 } }),
    ba('sorc_chromatic_orb', 'Chromatic Orb', 'An orb of elemental energy for 3d8. +1d8 per slot above 1st.', 'strike', 6, 1.65, 5, { spellTier: 1, damageType: 'lightning', dice: { count: 3, sides: 8, bonus: 0 }, dicePerSlotAbove: 1 }),
    ba('sorc_scorching_ray', 'Scorching Ray', 'Three searing rays for 6d6 fire (2d6 each), each a separate hit. +2d6 per slot above 2nd.', 'strike', 8, 1.6, 9, { spellTier: 2, damageType: 'fire', dice: { count: 6, sides: 6, bonus: 0 }, dicePerSlotAbove: 2 }),
    ba('sorc_fireball', 'Fireball', 'A roaring explosion for 8d6 fire (DEX save halves). +1d6 per slot above 3rd.', 'strike', 9, 2.2, 14, { spellTier: 3, damageType: 'fire', dice: { count: 8, sides: 6, bonus: 0 }, dicePerSlotAbove: 1, save: { ability: 'dexterity', effect: 'half' }, aoe: true }),
  ],
  warlock: [
    ba('warlock_eldritch_blast', 'Eldritch Blast', 'A beam of crackling force for 1d10.', 'strike', 4, 1.45, 1, { spellTier: 0, damageType: 'force', dice: { count: 1, sides: 10, bonus: 0 } }),
    ba('warlock_hex', 'Hex', 'Curses the target (concentration): every hit deals +1d6 necrotic for the fight.', 'buff', 9, 0, 6, { spellTier: 1, damageType: 'necrotic', riderDice: { count: 1, sides: 6, bonus: 0 } }),
    ba('warlock_vampiric_touch', 'Vampiric Touch', 'A withering touch for 3d6 necrotic, healing you for half the damage dealt. +1d6 per slot above 3rd.', 'drain', 6, 1.0, 10, { drainHealFraction: 0.5, spellTier: 3, damageType: 'necrotic', dice: { count: 3, sides: 6, bonus: 0 }, dicePerSlotAbove: 1 }),
    ba('warlock_hunger_of_hadar', 'Hunger of Hadar', 'A void zone where tendrils gnaw for 2d6 cold each turn over 8s.', 'dot', 9, 0, 20, { dot: { dotDurationSec: 8, dotTicks: 4, dotTickMult: 0, dotDice: { count: 2, sides: 6, bonus: 0 } }, spellTier: 3, damageType: 'cold', aoe: true }),
  ],
  wizard: [
    ba('wiz_fire_bolt', 'Fire Bolt', 'A mote of fire for 1d10.', 'strike', 4, 1.05, 1, { spellTier: 0, damageType: 'fire', dice: { count: 1, sides: 10, bonus: 0 } }),
    ba('wiz_magic_missile', 'Magic Missile', 'Three darts of force for 3d4+3 (auto-hit). +1d4+1 per slot above 1st.', 'strike', 4, 1.3, 1, { spellTier: 1, damageType: 'force', dice: { count: 3, sides: 4, bonus: 3 }, dicePerSlotAbove: 1, autoHit: true }),
    ba('wiz_scorching_ray', 'Scorching Ray', 'Three searing rays for 6d6 fire (2d6 each), each a separate hit. +2d6 per slot above 2nd.', 'strike', 8, 1.6, 8, { spellTier: 2, damageType: 'fire', dice: { count: 6, sides: 6, bonus: 0 }, dicePerSlotAbove: 2 }),
    ba('wiz_fireball', 'Fireball', 'A roaring explosion for 8d6 fire (DEX save halves). +1d6 per slot above 3rd.', 'strike', 9, 2.3, 14, { spellTier: 3, damageType: 'fire', dice: { count: 8, sides: 6, bonus: 0 }, dicePerSlotAbove: 1, save: { ability: 'dexterity', effect: 'half' }, aoe: true }),
  ],
};

/**
 * Rozšiřující pool kouzel (Kniha kouzel / ADR 0039). Navíc k baseline kitu —
 * dohromady tvoří **nabídku**, ze které si caster volí aktivní (prepared) kouzla.
 * Jen caster classy (`CASTER_TYPE !== 'none'`); martialové (Barbarian/Fighter/
 * Monk/Rogue) mají fixní bojové techniky → prázdný pool (nevolí kouzla).
 *
 * Záměrně „velký, ale ne kompletní" (rozhodnutí PM): dost variety, ať je z čeho
 * vybírat, ne celý PHB. Dice/typy/saves jsou D&D-věrné (stejný styl jako baseline);
 * upcast (`dicePerSlotAbove`) u kouzel, kterým v D&D pomáhá.
 */
export const EXTRA_SPELLS: Record<ClassId, BaselineAbility[]> = {
  barbarian: [],
  fighter: [],
  monk: [],
  rogue: [],
  bard: [
    ba('bard_mind_sliver', 'Mind Sliver', 'A spike of psychic energy for 1d6 (scales with level).', 'strike', 4, 1.0, 1, { spellTier: 0, damageType: 'psychic', dice: { count: 1, sides: 6, bonus: 0 } }),
    ba('bard_thunderwave', 'Thunderwave', 'A wave of force for 2d8 thunder (CON save halves). +1d8 per slot above 1st.', 'strike', 7, 1.6, 1, { spellTier: 1, damageType: 'thunder', dice: { count: 2, sides: 8, bonus: 0 }, dicePerSlotAbove: 1, save: { ability: 'constitution', effect: 'half' }, aoe: true }),
    ba('bard_cure_wounds', 'Cure Wounds', 'A touch restores 1d8 + your spellcasting modifier. +1d8 per slot above 1st.', 'heal', 6, 2.1, 1, { spellTier: 1, dice: { count: 1, sides: 8, bonus: 0 }, dicePerSlotAbove: 1 }),
    ba('bard_heat_metal', 'Heat Metal', 'Searing metal burns for 2d8 fire each turn over 8s.', 'dot', 8, 0, 5, { dot: { dotDurationSec: 8, dotTicks: 4, dotTickMult: 0, dotDice: { count: 2, sides: 8, bonus: 0 } }, spellTier: 2, damageType: 'fire' }),
    ba('bard_shatter', 'Shatter', 'A burst of sound for 3d8 thunder (CON save halves). +1d8 per slot above 2nd.', 'strike', 8, 1.8, 5, { spellTier: 2, damageType: 'thunder', dice: { count: 3, sides: 8, bonus: 0 }, dicePerSlotAbove: 1, save: { ability: 'constitution', effect: 'half' }, aoe: true }),
    ba('bard_mass_healing_word', 'Mass Healing Word', 'Words of hope heal all wounded allies for 1d4 + your spellcasting modifier. +1d4 per slot above 3rd.', 'heal', 9, 2.6, 14, { spellTier: 3, dice: { count: 1, sides: 4, bonus: 0 }, dicePerSlotAbove: 1, aoe: true, actionCost: 'bonus' }),
    ba('bard_phantasmal_killer', 'Phantasmal Killer', "A vision of the target's worst fear for 4d10 psychic (WIS save halves, or be frightened). +1d10 per slot above 4th.", 'strike', 9, 2.0, 16, { spellTier: 4, damageType: 'psychic', dice: { count: 4, sides: 10, bonus: 0 }, dicePerSlotAbove: 1, save: { ability: 'wisdom', effect: 'half' }, condition: { type: 'frightened', durationTurns: 1 } }),
    ba('bard_synaptic_static', 'Synaptic Static', 'An explosion of psychic energy for 8d6 (INT save halves). +1d6 per slot above 5th.', 'strike', 10, 2.2, 17, { spellTier: 5, damageType: 'psychic', dice: { count: 8, sides: 6, bonus: 0 }, dicePerSlotAbove: 1, save: { ability: 'intelligence', effect: 'half' }, aoe: true }),
    ba('bard_hold_person', 'Hold Person', 'Paralyzing magic seizes a humanoid — no damage, but a failed WIS save leaves it held helpless (stunned).', 'strike', 10, 0, 5, { spellTier: 2, save: { ability: 'wisdom', effect: 'negate' }, condition: { type: 'stunned', durationTurns: 1 } , validTargetTypes: ['humanoid'] }),
  ],
  cleric: [
    ba('cleric_toll_the_dead', 'Toll the Dead', 'A mournful bell tolls for 1d8 necrotic (WIS save negates; scales with level).', 'strike', 4, 1.0, 1, { spellTier: 0, damageType: 'necrotic', dice: { count: 1, sides: 8, bonus: 0 }, save: { ability: 'wisdom', effect: 'negate' } }),
    ba('cleric_healing_word', 'Healing Word', 'A word of power heals an ally for 1d4 + your spellcasting modifier. +1d4 per slot above 1st.', 'heal', 5, 1.9, 1, { spellTier: 1, dice: { count: 1, sides: 4, bonus: 0 }, dicePerSlotAbove: 1, actionCost: 'bonus' }),
    ba('cleric_inflict_wounds', 'Inflict Wounds', 'A necrotic touch for 3d10. +1d10 per slot above 1st.', 'strike', 7, 2.0, 1, { spellTier: 1, damageType: 'necrotic', dice: { count: 3, sides: 10, bonus: 0 }, dicePerSlotAbove: 1 }),
    ba('cleric_spiritual_weapon', 'Spiritual Weapon', 'A floating blade strikes for 1d8 + your spellcasting modifier force.', 'strike', 6, 1.85, 5, { spellTier: 2, damageType: 'force', dice: { count: 1, sides: 8, bonus: 0 } }),
    ba('cleric_prayer_of_healing', 'Prayer of Healing', 'A prayer heals all wounded allies for 2d8 + your spellcasting modifier. +1d8 per slot above 2nd.', 'heal', 9, 2.5, 5, { spellTier: 2, dice: { count: 2, sides: 8, bonus: 0 }, dicePerSlotAbove: 1, aoe: true }),
    ba('cleric_mass_healing_word', 'Mass Healing Word', 'Words of hope heal all wounded allies for 1d4 + your spellcasting modifier. +1d4 per slot above 3rd.', 'heal', 9, 2.6, 14, { spellTier: 3, dice: { count: 1, sides: 4, bonus: 0 }, dicePerSlotAbove: 1, aoe: true, actionCost: 'bonus' }),
    ba('cleric_flame_strike', 'Flame Strike', 'A column of divine fire for 8d6 (4d6 fire + 4d6 radiant; DEX save halves). +1d6 per slot above 5th.', 'strike', 10, 2.2, 17, { spellTier: 5, damageType: 'radiant', dice: { count: 8, sides: 6, bonus: 0 }, dicePerSlotAbove: 1, save: { ability: 'dexterity', effect: 'half' }, aoe: true }),
    ba('cleric_hold_person', 'Hold Person', 'Paralyzing prayer seizes a humanoid — no damage, but a failed WIS save leaves it held helpless (stunned).', 'strike', 10, 0, 5, { spellTier: 2, save: { ability: 'wisdom', effect: 'negate' }, condition: { type: 'stunned', durationTurns: 1 } , validTargetTypes: ['humanoid'] }),
  ],
  druid: [
    ba('druid_thorn_whip', 'Thorn Whip', 'A vine lashes the target for 1d6 piercing (scales with level).', 'strike', 4, 1.0, 1, { spellTier: 0, damageType: 'piercing', dice: { count: 1, sides: 6, bonus: 0 } }),
    ba('druid_cure_wounds', 'Cure Wounds', "Nature's touch restores 1d8 + your spellcasting modifier. +1d8 per slot above 1st.", 'heal', 6, 2.1, 1, { spellTier: 1, dice: { count: 1, sides: 8, bonus: 0 }, dicePerSlotAbove: 1 }),
    ba('druid_thunderwave', 'Thunderwave', 'A wave of force for 2d8 thunder (CON save halves). +1d8 per slot above 1st.', 'strike', 7, 1.6, 1, { spellTier: 1, damageType: 'thunder', dice: { count: 2, sides: 8, bonus: 0 }, dicePerSlotAbove: 1, save: { ability: 'constitution', effect: 'half' }, aoe: true }),
    ba('druid_flaming_sphere', 'Flaming Sphere', 'A rolling sphere of fire sears for 2d6 fire each turn over 8s (DEX save halves).', 'dot', 8, 0, 5, { dot: { dotDurationSec: 8, dotTicks: 4, dotTickMult: 0, dotDice: { count: 2, sides: 6, bonus: 0 } }, spellTier: 2, damageType: 'fire', save: { ability: 'dexterity', effect: 'half' } }),
    ba('druid_mass_cure_wounds', 'Mass Cure Wounds', 'A surge of life heals all wounded allies for 3d8 + your spellcasting modifier. +1d8 per slot above 5th.', 'heal', 10, 2.8, 17, { spellTier: 5, dice: { count: 3, sides: 8, bonus: 0 }, dicePerSlotAbove: 1, aoe: true }),
    ba('druid_ice_storm', 'Ice Storm', 'A hail of ice for 4d6 cold over slick ground (DEX save halves, or be slowed). +1d6 per slot above 4th.', 'strike', 9, 1.9, 16, { spellTier: 4, damageType: 'cold', dice: { count: 4, sides: 6, bonus: 0 }, dicePerSlotAbove: 1, save: { ability: 'dexterity', effect: 'half' }, condition: { type: 'slowed', durationTurns: 1 }, aoe: true }),
    ba('druid_insect_plague', 'Insect Plague', 'A biting swarm gnaws for 4d10 piercing each turn over 8s (CON save halves).', 'dot', 10, 0, 17, { dot: { dotDurationSec: 8, dotTicks: 4, dotTickMult: 0, dotDice: { count: 4, sides: 10, bonus: 0 } }, spellTier: 5, damageType: 'piercing', save: { ability: 'constitution', effect: 'half' }, aoe: true }),
    ba('druid_entangle', 'Entangle', 'Grasping weeds erupt from the ground — no damage, but a failed STR save leaves the target restrained.', 'strike', 8, 0, 1, { spellTier: 1, save: { ability: 'strength', effect: 'negate' }, condition: { type: 'restrained', durationTurns: 2 } }),
    ba('druid_hold_person', 'Hold Person', 'Paralyzing magic seizes a humanoid — no damage, but a failed WIS save leaves it held helpless (stunned).', 'strike', 10, 0, 5, { spellTier: 2, save: { ability: 'wisdom', effect: 'negate' }, condition: { type: 'stunned', durationTurns: 1 } , validTargetTypes: ['humanoid'] }),
  ],
  paladin: [
    ba('paladin_thunderous_smite', 'Thunderous Smite', 'A thunderclap blow adding 2d6 thunder to the weapon hit. +1d6 per slot above 1st.', 'strike', 7, 1.0, 5, { spellTier: 1, damageType: 'thunder', bonusDice: { count: 2, sides: 6, bonus: 0 }, dicePerSlotAbove: 1 }),
    ba('paladin_wrathful_smite', 'Wrathful Smite', 'A frightening blow adding 1d6 psychic to the weapon hit; a failed WIS save leaves the target frightened.', 'strike', 6, 1.0, 5, { spellTier: 1, damageType: 'psychic', bonusDice: { count: 1, sides: 6, bonus: 0 }, save: { ability: 'wisdom', effect: 'none' }, condition: { type: 'frightened', durationTurns: 1 } }),
    ba('paladin_branding_smite', 'Branding Smite', 'A radiant brand adding 2d6 radiant to the weapon hit. +1d6 per slot above 2nd.', 'strike', 7, 1.0, 9, { spellTier: 2, damageType: 'radiant', bonusDice: { count: 2, sides: 6, bonus: 0 }, dicePerSlotAbove: 1 }),
    ba('paladin_blinding_smite', 'Blinding Smite', 'A flash of light adding 3d8 radiant to the weapon hit.', 'strike', 8, 1.0, 13, { spellTier: 3, damageType: 'radiant', bonusDice: { count: 3, sides: 8, bonus: 0 } }),
  ],
  ranger: [
    ba('ranger_zephyr_strike', 'Zephyr Strike', 'A wind-quick strike made with advantage, adding 1d8 force to the hit.', 'strike', 7, 1.0, 5, { spellTier: 1, damageType: 'force', advantage: true, bonusDice: { count: 1, sides: 8, bonus: 0 } }),
    ba('ranger_hail_of_thorns', 'Hail of Thorns', 'A rain of thorns for 1d10 piercing to all foes (DEX save halves). +1d10 per slot above 1st.', 'strike', 8, 1.0, 5, { spellTier: 1, damageType: 'piercing', dice: { count: 1, sides: 10, bonus: 0 }, dicePerSlotAbove: 1, save: { ability: 'dexterity', effect: 'half' }, aoe: true }),
    ba('ranger_lightning_arrow', 'Lightning Arrow', 'An arrow becomes a bolt of lightning for 4d8 (DEX save halves). +1d8 per slot above 3rd.', 'strike', 8, 1.0, 13, { spellTier: 3, damageType: 'lightning', dice: { count: 4, sides: 8, bonus: 0 }, dicePerSlotAbove: 1, save: { ability: 'dexterity', effect: 'half' } }),
    ba('ranger_conjure_barrage', 'Conjure Barrage', 'A volley of conjured weapons for 3d8 to all foes (DEX save halves).', 'strike', 9, 1.0, 13, { spellTier: 3, damageType: 'piercing', dice: { count: 3, sides: 8, bonus: 0 }, save: { ability: 'dexterity', effect: 'half' }, aoe: true }),
    ba('ranger_ensnaring_strike', 'Ensnaring Strike', 'A thorny vine bursts from a weapon hit — full weapon damage, and a failed STR save leaves the target restrained.', 'strike', 7, 1.0, 5, { spellTier: 1, save: { ability: 'strength', effect: 'none' }, condition: { type: 'restrained', durationTurns: 2 } }),
    ba('ranger_entangle', 'Entangle', 'Grasping weeds erupt from the ground — no damage, but a failed STR save leaves the target restrained.', 'strike', 8, 0, 5, { spellTier: 1, save: { ability: 'strength', effect: 'negate' }, condition: { type: 'restrained', durationTurns: 2 } }),
  ],
  sorcerer: [
    ba('sorc_ray_of_frost', 'Ray of Frost', 'A frigid beam for 1d8 cold that also slows the target on a hit (scales with level).', 'strike', 4, 1.1, 1, { spellTier: 0, damageType: 'cold', dice: { count: 1, sides: 8, bonus: 0 }, condition: { type: 'slowed', durationTurns: 1 } }),
    ba('sorc_shocking_grasp', 'Shocking Grasp', 'A jolt of lightning for 1d8 (scales with level).', 'strike', 4, 1.1, 1, { spellTier: 0, damageType: 'lightning', dice: { count: 1, sides: 8, bonus: 0 } }),
    ba('sorc_magic_missile', 'Magic Missile', 'Three darts of force for 3d4+3 (auto-hit). +1d4+1 per slot above 1st.', 'strike', 4, 1.3, 1, { spellTier: 1, damageType: 'force', dice: { count: 3, sides: 4, bonus: 3 }, dicePerSlotAbove: 1, autoHit: true }),
    ba('sorc_shatter', 'Shatter', 'A burst of sound for 3d8 thunder (CON save halves). +1d8 per slot above 2nd.', 'strike', 8, 1.7, 5, { spellTier: 2, damageType: 'thunder', dice: { count: 3, sides: 8, bonus: 0 }, dicePerSlotAbove: 1, save: { ability: 'constitution', effect: 'half' }, aoe: true }),
    ba('sorc_lightning_bolt', 'Lightning Bolt', 'A stroke of lightning for 8d6 (DEX save halves). +1d6 per slot above 3rd.', 'strike', 9, 2.2, 14, { spellTier: 3, damageType: 'lightning', dice: { count: 8, sides: 6, bonus: 0 }, dicePerSlotAbove: 1, save: { ability: 'dexterity', effect: 'half' }, aoe: true }),
    ba('sorc_ice_storm', 'Ice Storm', 'A hail of ice for 4d6 cold over slick ground (DEX save halves, or be slowed). +1d6 per slot above 4th.', 'strike', 9, 1.9, 16, { spellTier: 4, damageType: 'cold', dice: { count: 4, sides: 6, bonus: 0 }, dicePerSlotAbove: 1, save: { ability: 'dexterity', effect: 'half' }, condition: { type: 'slowed', durationTurns: 1 }, aoe: true }),
    ba('sorc_cone_of_cold', 'Cone of Cold', 'A blast of frigid air for 8d8 cold (CON save halves, or be slowed by the numbing chill). +1d8 per slot above 5th.', 'strike', 10, 2.4, 17, { spellTier: 5, damageType: 'cold', dice: { count: 8, sides: 8, bonus: 0 }, dicePerSlotAbove: 1, save: { ability: 'constitution', effect: 'half' }, condition: { type: 'slowed', durationTurns: 1 }, aoe: true }),
    ba('sorc_web', 'Web', 'Thick, clinging webbing fills the area — no damage, but a failed DEX save leaves the target restrained.', 'strike', 8, 0, 5, { spellTier: 2, save: { ability: 'dexterity', effect: 'negate' }, condition: { type: 'restrained', durationTurns: 2 } }),
    ba('sorc_hold_person', 'Hold Person', 'Paralyzing magic seizes a humanoid — no damage, but a failed WIS save leaves it held helpless (stunned).', 'strike', 10, 0, 5, { spellTier: 2, save: { ability: 'wisdom', effect: 'negate' }, condition: { type: 'stunned', durationTurns: 1 } , validTargetTypes: ['humanoid'] }),
  ],
  warlock: [
    ba('warlock_chill_touch', 'Chill Touch', 'A ghostly hand for 1d8 necrotic (scales with level).', 'strike', 4, 1.2, 1, { spellTier: 0, damageType: 'necrotic', dice: { count: 1, sides: 8, bonus: 0 } }),
    ba('warlock_witch_bolt', 'Witch Bolt', 'A sustained arc of lightning for 1d12 each turn over 8s.', 'dot', 7, 0, 1, { dot: { dotDurationSec: 8, dotTicks: 4, dotTickMult: 0, dotDice: { count: 1, sides: 12, bonus: 0 } }, spellTier: 1, damageType: 'lightning' }),
    ba('warlock_arms_of_hadar', 'Arms of Hadar', 'Tendrils of dark energy lash all foes for 2d6 necrotic (STR save halves). +1d6 per slot above 1st.', 'strike', 8, 1.5, 1, { spellTier: 1, damageType: 'necrotic', dice: { count: 2, sides: 6, bonus: 0 }, dicePerSlotAbove: 1, save: { ability: 'strength', effect: 'half' }, aoe: true }),
    ba('warlock_shatter', 'Shatter', 'A burst of sound for 3d8 thunder (CON save halves). +1d8 per slot above 2nd.', 'strike', 8, 1.7, 5, { spellTier: 2, damageType: 'thunder', dice: { count: 3, sides: 8, bonus: 0 }, dicePerSlotAbove: 1, save: { ability: 'constitution', effect: 'half' }, aoe: true }),
    ba('warlock_blight', 'Blight', 'Necrotic energy withers the target for 8d8 (CON save halves). +1d8 per slot above 4th.', 'strike', 9, 2.3, 16, { spellTier: 4, damageType: 'necrotic', dice: { count: 8, sides: 8, bonus: 0 }, dicePerSlotAbove: 1, save: { ability: 'constitution', effect: 'half' } }),
    ba('warlock_hold_person', 'Hold Person', 'Paralyzing magic seizes a humanoid — no damage, but a failed WIS save leaves it held helpless (stunned).', 'strike', 10, 0, 5, { spellTier: 2, save: { ability: 'wisdom', effect: 'negate' }, condition: { type: 'stunned', durationTurns: 1 } , validTargetTypes: ['humanoid'] }),
  ],
  wizard: [
    ba('wiz_ray_of_frost', 'Ray of Frost', 'A frigid beam for 1d8 cold that also slows the target on a hit (scales with level).', 'strike', 4, 1.05, 1, { spellTier: 0, damageType: 'cold', dice: { count: 1, sides: 8, bonus: 0 }, condition: { type: 'slowed', durationTurns: 1 } }),
    ba('wiz_shocking_grasp', 'Shocking Grasp', 'A jolt of lightning for 1d8 (scales with level).', 'strike', 4, 1.05, 1, { spellTier: 0, damageType: 'lightning', dice: { count: 1, sides: 8, bonus: 0 } }),
    ba('wiz_chromatic_orb', 'Chromatic Orb', 'An orb of elemental energy for 3d8. +1d8 per slot above 1st.', 'strike', 6, 1.65, 1, { spellTier: 1, damageType: 'cold', dice: { count: 3, sides: 8, bonus: 0 }, dicePerSlotAbove: 1 }),
    ba('wiz_thunderwave', 'Thunderwave', 'A wave of force for 2d8 thunder (CON save halves). +1d8 per slot above 1st.', 'strike', 7, 1.6, 1, { spellTier: 1, damageType: 'thunder', dice: { count: 2, sides: 8, bonus: 0 }, dicePerSlotAbove: 1, save: { ability: 'constitution', effect: 'half' }, aoe: true }),
    ba('wiz_shatter', 'Shatter', 'A burst of sound for 3d8 thunder (CON save halves). +1d8 per slot above 2nd.', 'strike', 8, 1.7, 5, { spellTier: 2, damageType: 'thunder', dice: { count: 3, sides: 8, bonus: 0 }, dicePerSlotAbove: 1, save: { ability: 'constitution', effect: 'half' }, aoe: true }),
    ba('wiz_lightning_bolt', 'Lightning Bolt', 'A stroke of lightning for 8d6 (DEX save halves). +1d6 per slot above 3rd.', 'strike', 9, 2.3, 14, { spellTier: 3, damageType: 'lightning', dice: { count: 8, sides: 6, bonus: 0 }, dicePerSlotAbove: 1, save: { ability: 'dexterity', effect: 'half' }, aoe: true }),
    ba('wiz_ice_storm', 'Ice Storm', 'A hail of ice for 4d6 cold over slick ground (DEX save halves, or be slowed). +1d6 per slot above 4th.', 'strike', 9, 1.9, 16, { spellTier: 4, damageType: 'cold', dice: { count: 4, sides: 6, bonus: 0 }, dicePerSlotAbove: 1, save: { ability: 'dexterity', effect: 'half' }, condition: { type: 'slowed', durationTurns: 1 }, aoe: true }),
    ba('wiz_cone_of_cold', 'Cone of Cold', 'A blast of frigid air for 8d8 cold (CON save halves, or be slowed by the numbing chill). +1d8 per slot above 5th.', 'strike', 10, 2.4, 17, { spellTier: 5, damageType: 'cold', dice: { count: 8, sides: 8, bonus: 0 }, dicePerSlotAbove: 1, save: { ability: 'constitution', effect: 'half' }, condition: { type: 'slowed', durationTurns: 1 }, aoe: true }),
    ba('wiz_disintegrate', 'Disintegrate', 'A thin green ray for 10d6+40 force (DEX save halves). +3d6 per slot above 6th.', 'strike', 11, 2.6, 17, { spellTier: 6, damageType: 'force', dice: { count: 10, sides: 6, bonus: 40 }, dicePerSlotAbove: 3, save: { ability: 'dexterity', effect: 'half' } }),
    ba('wiz_web', 'Web', 'Thick, clinging webbing fills the area — no damage, but a failed DEX save leaves the target restrained.', 'strike', 8, 0, 5, { spellTier: 2, save: { ability: 'dexterity', effect: 'negate' }, condition: { type: 'restrained', durationTurns: 2 } }),
    ba('wiz_hold_person', 'Hold Person', 'Paralyzing magic seizes a humanoid — no damage, but a failed WIS save leaves it held helpless (stunned).', 'strike', 10, 0, 5, { spellTier: 2, save: { ability: 'wisdom', effect: 'negate' }, condition: { type: 'stunned', durationTurns: 1 } , validTargetTypes: ['humanoid'] }),
  ],
};

/**
 * Plný katalog kouzel classy = baseline kit + rozšiřující pool (`EXTRA_SPELLS`),
 * **bez** subclass signature. Jediný zdroj nabídky pro Knihu kouzel. Deduplikuje
 * podle `id` (baseline má přednost) → bezpečné i kdyby se id překrylo.
 */
export function classSpellCatalog(klass: ClassId | string): BaselineAbility[] {
  const baseline = CLASS_BASELINE_ABILITIES[klass as ClassId] ?? [];
  const extra = EXTRA_SPELLS[klass as ClassId] ?? [];
  const seen = new Set(baseline.map((a) => a.id));
  return [...baseline, ...extra.filter((a) => !seen.has(a.id))];
}

// ── Subclass signature ability (1 per subclass v MVP) — odemčeno subclassLevel ─

export const SUBCLASS_ABILITIES: Record<SubclassId, BaselineAbility> = {
  path_of_the_berserker: ba('berserker_frenzy', 'Frenzy', 'Frenzied rage grants an extra weapon attack each turn.', 'strike', 8, 2.0, 3),
  path_of_the_totem_warrior: ba('totem_bear_spirit', 'Bear Spirit', 'The bear totem toughens your hide — incoming damage is reduced for a time.', 'mitigation', 24, 0, 3, { mitigation: { mitigationPct: 0.4, mitigationDurationSec: 12 } }),
  college_of_lore: ba('lore_song_of_rest', 'Song of Rest', 'An inspiring melody heals a wounded ally for 2d8 + your spellcasting modifier. +1d8 per slot above 2nd.', 'heal', 8, 2.7, 3, { spellTier: 2, dice: { count: 2, sides: 8, bonus: 0 }, dicePerSlotAbove: 1 }),
  college_of_valor: ba('valor_combat_inspiration', 'Combat Inspiration', 'A martial battle hymn empowers a mighty strike, adding 1d6 to the hit.', 'strike', 7, 1.0, 3, { bonusDice: { count: 1, sides: 6, bonus: 0 } }),
  life_domain: ba('life_preserve_life', 'Preserve Life', 'Channel Divinity surges a pool of healing for 5d8 — no spell slot (refreshes on a Long Rest).', 'heal', 26, 3.0, 1, { dice: { count: 5, sides: 8, bonus: 0 } }),
  war_domain: ba('war_guided_strike', 'Guided Strike', 'Channel Divinity guides your weapon with advantage, adding 2d6 radiant.', 'strike', 9, 1.0, 1, { advantage: true, damageType: 'radiant', bonusDice: { count: 2, sides: 6, bonus: 0 } }),
  circle_of_the_moon: ba('moon_wild_shape', 'Wild Shape: Dire Bear', 'Transforms into a dire bear and mauls with two attacks.', 'strike', 9, 2.0, 2),
  circle_of_the_land: ba('land_natures_wrath', "Nature's Wrath", 'Thorns and bramble lash a foe for 4d8 piercing. +1d8 per slot above 2nd.', 'strike', 9, 1.0, 2, { spellTier: 2, damageType: 'piercing', dice: { count: 4, sides: 8, bonus: 0 }, dicePerSlotAbove: 1 }),
  champion: ba('champion_heroic_surge', 'Heroic Surge', 'Action Surge grants an extra Attack action this turn.', 'strike', 8, 2.0, 3),
  battle_master: ba('battlemaster_maneuver', 'Combat Maneuver', 'A superiority die fuels a precise strike, adding 1d10 to the weapon hit.', 'strike', 8, 1.0, 3, { bonusDice: { count: 1, sides: 10, bonus: 0 } }),
  way_of_the_open_hand: ba('open_hand_flurry', 'Flurry of Blows', 'Two unarmed strikes as a bonus action. Costs 1 Ki.', 'strike', 8, 2.0, 3, { kiCost: 1 }),
  way_of_shadow: ba('shadow_shadow_strike', 'Shadow Strike', 'Strike from darkness with advantage. Costs 1 Ki.', 'strike', 8, 2.0, 3, { advantage: true, kiCost: 1 }),
  oath_of_devotion: ba('devotion_sacred_weapon', 'Sacred Weapon', 'Channel Divinity blesses the weapon: a strike that adds 2d4 radiant.', 'strike', 9, 1.0, 3, { damageType: 'radiant', bonusDice: { count: 2, sides: 4, bonus: 0 } }),
  oath_of_vengeance: ba('vengeance_vow_of_enmity', 'Vow of Enmity', 'Mark a foe for vengeance — strike with advantage and 2d8 radiant fury.', 'strike', 9, 1.0, 3, { advantage: true, damageType: 'radiant', bonusDice: { count: 2, sides: 8, bonus: 0 } }),
  hunter: ba('hunter_colossus_slayer', 'Colossus Slayer', 'A focused shot adding 1d8 to the weapon hit against a wounded foe.', 'strike', 9, 1.0, 3, { bonusDice: { count: 1, sides: 8, bonus: 0 } }),
  beast_master: ba('beastmaster_companion_strike', 'Companion Strike', 'Your bonded beast tears into the target for heavy damage.', 'strike', 7, 1.75, 3),
  thief: ba('thief_backstab', 'Backstab', 'A shadow strike struck with advantage, adding full Sneak Attack dice.', 'strike', 9, 1.0, 3, { advantage: true, bonusDice: { count: 1, sides: 6, bonus: 0 }, bonusDicePerLevels: 2 }),
  assassin: ba('assassin_assassinate', 'Assassinate', 'A lethal opening strike with advantage and full, level-scaling Sneak dice.', 'strike', 10, 1.0, 3, { advantage: true, bonusDice: { count: 1, sides: 6, bonus: 0 }, bonusDicePerLevels: 2 }),
  draconic_bloodline: ba('draconic_elemental_burst', 'Elemental Burst', 'Draconic power erupts for 4d6 fire. +1d6 per slot above 2nd.', 'strike', 9, 1.0, 1, { spellTier: 2, damageType: 'fire', dice: { count: 4, sides: 6, bonus: 0 }, dicePerSlotAbove: 1 }),
  wild_magic: ba('wild_magic_surge', 'Wild Magic Surge', 'Chaotic magic erupts for 4d6 force (DEX save halves). +1d6 per slot above 2nd.', 'strike', 9, 1.0, 1, { spellTier: 2, damageType: 'force', dice: { count: 4, sides: 6, bonus: 0 }, dicePerSlotAbove: 1, save: { ability: 'dexterity', effect: 'half' }, aoe: true }),
  the_fiend: ba('fiend_dark_ones_blessing', "Dark One's Blessing", 'A fiendish blast for 3d6 fire, draining 20% of the damage as healing. +1d6 per slot above 2nd.', 'drain', 8, 1.0, 1, { drainHealFraction: 0.2, spellTier: 2, damageType: 'fire', dice: { count: 3, sides: 6, bonus: 0 }, dicePerSlotAbove: 1 }),
  the_great_old_one: ba('great_old_one_mind_whispers', 'Mind Whispers', 'Alien whispers rend the mind for 3d6 psychic (WIS save halves, or be frightened). +1d6 per slot above 2nd.', 'strike', 8, 1.0, 1, { spellTier: 2, damageType: 'psychic', dice: { count: 3, sides: 6, bonus: 0 }, dicePerSlotAbove: 1, save: { ability: 'wisdom', effect: 'half' }, condition: { type: 'frightened', durationTurns: 1 } }),
  school_of_evocation: ba('evocation_overchannel', 'Overchannel', 'Overchanneled arcana erupts for 6d6 force (maximized evocation). +1d6 per slot above 3rd.', 'strike', 10, 1.0, 2, { spellTier: 3, damageType: 'force', dice: { count: 6, sides: 6, bonus: 0 }, dicePerSlotAbove: 1 }),
  school_of_abjuration: ba('abjuration_arcane_ward', 'Arcane Ward', 'An arcane ward absorbs incoming harm, reducing damage taken for a time.', 'mitigation', 22, 0, 2, { mitigation: { mitigationPct: 0.4, mitigationDurationSec: 10 } }),
};

/**
 * Draftovatelný pool „flashy" kouzel pro Gauntlet (M13) + combat-lookup. Není
 * vázán na class progresi — Gauntlet z něj náhodně nabízí „nové kouzlo" do runu.
 */
export const SIGNATURE_ABILITIES: Record<string, AbilitySpec> = {
  fireball: { name: 'Fireball', description: 'A roaring explosion for 8d6 fire (DEX save halves).', kind: 'strike', cooldownSec: 10, damageMult: 2.5, damageType: 'fire', dice: { count: 8, sides: 6, bonus: 0 }, dicePerSlotAbove: 1, save: { ability: 'dexterity', effect: 'half' }, aoe: true },
  lightning_bolt: { name: 'Lightning Bolt', description: 'A line of lightning for 8d6 (DEX save halves).', kind: 'strike', cooldownSec: 9, damageMult: 2.4, damageType: 'lightning', dice: { count: 8, sides: 6, bonus: 0 }, dicePerSlotAbove: 1, save: { ability: 'dexterity', effect: 'half' }, aoe: true },
  ice_storm: { name: 'Ice Storm', description: 'A hail of ice for 4d6 cold (DEX save halves).', kind: 'strike', cooldownSec: 10, damageMult: 1.75, damageType: 'cold', dice: { count: 4, sides: 6, bonus: 0 }, dicePerSlotAbove: 1, save: { ability: 'dexterity', effect: 'half' }, aoe: true },
  inflict_wounds: { name: 'Inflict Wounds', description: 'A necrotic touch for 3d10. +1d10 per slot above 1st.', kind: 'strike', cooldownSec: 8, damageMult: 2.0, damageType: 'necrotic', dice: { count: 3, sides: 10, bonus: 0 }, dicePerSlotAbove: 1 },
  guiding_bolt: { name: 'Guiding Bolt', description: 'A bolt of light for 4d6 radiant.', kind: 'strike', cooldownSec: 8, damageMult: 2.1, damageType: 'radiant', dice: { count: 4, sides: 6, bonus: 0 }, dicePerSlotAbove: 1 },
  spiritual_weapon: { name: 'Spiritual Weapon', description: 'A floating blade strikes for 1d8 force.', kind: 'strike', cooldownSec: 7, damageMult: 1.85, damageType: 'force', dice: { count: 1, sides: 8, bonus: 0 } },
  mass_healing_word: { name: 'Mass Healing Word', description: 'Restores 1d4 + your spellcasting modifier to all wounded allies. +1d4 per slot above 3rd.', kind: 'heal', cooldownSec: 9, damageMult: 2.8, spellTier: 3, dice: { count: 1, sides: 4, bonus: 0 }, dicePerSlotAbove: 1, aoe: true, actionCost: 'bonus' },
  flame_blade: { name: 'Flame Blade', description: 'A blade of fire for 3d6 fire.', kind: 'strike', cooldownSec: 8, damageMult: 2.0, damageType: 'fire', dice: { count: 3, sides: 6, bonus: 0 } },
  vampiric_touch: { name: 'Vampiric Touch', description: 'A withering touch for 3d6 necrotic, healing you for half the damage dealt.', kind: 'drain', cooldownSec: 8, damageMult: 1.6, drainHealFraction: 0.5, damageType: 'necrotic', dice: { count: 3, sides: 6, bonus: 0 }, dicePerSlotAbove: 1 },
  shield_of_faith: { name: 'Shield of Faith', description: 'A shimmering field reduces damage taken by 40% for 10s.', kind: 'mitigation', cooldownSec: 22, damageMult: 0, mitigationPct: 0.4, mitigationDurationSec: 10 },
};

/**
 * Sestaví seznam abilit postavy: **class kit** (gated levelem) + **subclass
 * signature** (gated subclassLevel). Jediný zdroj pravdy pro combat engine
 * (`deriveCombatProfile`) i editor rotace (API) → nemůžou se rozejít.
 */
export function resolveAbilities(
  klass: ClassId | string,
  subclass: SubclassId | string | null | undefined,
  level: number,
): SignatureAbility[] {
  const out: SignatureAbility[] = [];
  const kit = CLASS_BASELINE_ABILITIES[klass as ClassId];
  for (const ab of kit ?? []) {
    if (level < ab.unlockLevel) continue;
    const { unlockLevel: _u, ...sig } = ab;
    out.push(sig);
  }
  if (subclass) {
    const sub = SUBCLASS_ABILITIES[subclass as SubclassId];
    if (sub && level >= sub.unlockLevel) {
      const { unlockLevel: _u, ...sig } = sub;
      out.push(sig);
    }
  }
  return out;
}

/**
 * Damage multiplier ability (ADR 0036: execute „pod 30 % HP" = WoW-ismus, smazán).
 * Vrací `damageMult` — sim-knob magnitudy pro ability bez literal `dice`. `targetHpPct`
 * se zachovává v signatuře (call-sites) pro případné budoucí HP-aware efekty.
 */
export function abilityDamageMult(ability: SignatureAbility, _targetHpPct: number): number {
  return ability.damageMult;
}

/**
 * Tagy poskytující absorpční štít (pohlcuje příchozí poškození). Hodnota = násobek
 * velikosti štítu (viz `deriveCombatProfile`). Nově je tagy uděluje feat/ASI
 * (`levelup.ts`), ne talent.
 */
export const SHIELD_TAGS: Record<string, number> = {
  ice_barrier: 1.6,
  holy_shield: 1.2,
  shield_minor: 0.6,
};
