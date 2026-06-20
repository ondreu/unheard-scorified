/**
 * Spell-card info builder (Spell UI, Slice 1) — **jediný zdroj pravdy** pro to, co
 * se ukazuje na kartě kouzla/techniky napříč UI (detail modal, combat tlačítka,
 * spellbook). UI komponenty jen renderují tenhle struct → žádná duplikovaná logika
 * formátování damage/range/save/slot a žádné rozejití zobrazení s enginem.
 *
 * Čistá funkce nad `SignatureAbility` (+ level, volitelný cast tier a spell save DC).
 * Damage/heal počítáme přes engine helpery (`abilityDamageSpec`/`bonusDiceSpec`),
 * aby cantrip/upcast scaling sedělo s reálným combatem. Rozptyl (min–max) přes
 * `diceMin`/`diceMax` — „damage nejen jako kostky, ale i reálné číslo" (roadmapa).
 */
import { abilityDamageSpec, bonusDiceSpec } from './combat';
import type { ConditionType } from './conditions';
import type { SignatureAbility, AbilityKind, SpellSave } from './data/abilities';
import type { DamageType } from './data/damage';
import { diceNotation, diceRange, type DiceSpec } from './dice';

/** Jeden řádek „dice + rozptyl" na kartě (např. `8d6` → `8–48`). */
export interface DiceLine {
  /** Notace kostek, např. `8d6`, `2d8+3`. */
  notation: string;
  /** Rozptyl reálného čísla `min–max`, např. `8–48` (bez variance = jedno číslo). */
  range: string;
}

/** Strukturovaná data spell karty — UI z toho renderuje, nepočítá nic samo. */
export interface SpellCardInfo {
  name: string;
  kind: AbilityKind;
  description?: string;
  cooldownSec: number;
  /** Typ poškození (fire/radiant/…) pokud ho ability nese (přebíjí typ zbraně). */
  damageType?: DamageType;
  /** D&D action slot — `'action'` (default) nebo `'bonus'`. */
  actionCost: 'action' | 'bonus';
  /** Cantrip = at-will (tier 0, zdarma). */
  isCantrip: boolean;
  /** Martial technika (bez spellTier) — ne kouzlo, neplatí slot. */
  isMartial: boolean;
  /** Spell tier 0..9 (undefined u martial technik). */
  spellTier?: number;
  /** Tier slotu, který kouzlo spotřebuje (>=1). undefined = zdarma (cantrip/martial). */
  slotCost?: number;
  /** AoE — zasáhne všechny cíle / ošetří všechny spojence. */
  aoe: boolean;
  /** Auto-hit (ignoruje AC, Magic Missile). */
  autoHit: boolean;
  /** Advantage na hod na zásah (Reckless / Assassinate). */
  advantage: boolean;
  /** Použitelné jen 1× za encounter (Action Surge / Assassinate). */
  oncePerCombat: boolean;
  /** Ki cena (Monk techniky). undefined/0 = zdarma. */
  kiCost?: number;
  /** Přímé poškození/heal (literal kostky). undefined = škáluje přes attackPower. */
  damage?: DiceLine;
  /** Bonus kostky k weapon hitu (Smite/Sneak). */
  bonusDamage?: DiceLine;
  /** DoT per tik + rozvrh. */
  dot?: { perTick?: DiceLine; ticks?: number; durationSec?: number };
  /** Koncentrační rider per zásah (Hunter's Mark/Hex). */
  rider?: DiceLine;
  /** Upcast: kolik kostek navíc za každý slot tier nad základem. */
  upcastPerSlot?: number;
  /** Saving throw cíle (atribut + efekt) + DC, je-li známé. */
  save?: { ability: SpellSave['ability']; effect: SpellSave['effect']; dc?: number };
  /** Condition rider (status efekt) na neúspěšný save (Slice 2d) — pro UI štítek. */
  condition?: { type: ConditionType; durationTurns: number };
  /** Drain self-heal podíl (0..1). */
  drainHealFraction?: number;
  /** Mitigation: podíl sníženého poškození + doba trvání. */
  mitigation?: { pct: number; durationSec?: number };
}

/** `DiceSpec` → `DiceLine` (notace + rozptyl). */
function diceLine(spec: DiceSpec): DiceLine {
  return { notation: diceNotation(spec), range: diceRange(spec) };
}

/**
 * Sestaví spell-card info z ability. `level` = level postavy (cantrip/bonus-dice
 * scaling). `slotTier` = tier slotu, kterým je kouzlo sesláno (pro upcast preview);
 * `null`/undefined → základní tier kouzla. `spellSaveDc` = DC postavy (do save řádku).
 */
export function buildSpellCard(
  ability: SignatureAbility,
  opts: { level?: number; slotTier?: number | null; spellSaveDc?: number } = {},
): SpellCardInfo {
  const level = opts.level ?? 1;
  const slotTier = opts.slotTier ?? null;
  const isMartial = ability.spellTier == null;
  const isCantrip = ability.spellTier === 0;

  const dmgSpec = abilityDamageSpec(ability, slotTier, level);
  const bonusSpec = bonusDiceSpec(ability, slotTier, level);

  const card: SpellCardInfo = {
    name: ability.name,
    kind: ability.kind,
    description: ability.description,
    cooldownSec: ability.cooldownSec,
    damageType: ability.damageType,
    actionCost: ability.actionCost ?? 'action',
    isCantrip,
    isMartial,
    spellTier: ability.spellTier,
    slotCost: ability.spellTier != null && ability.spellTier >= 1 ? ability.spellTier : undefined,
    aoe: ability.aoe ?? false,
    autoHit: ability.autoHit ?? false,
    advantage: ability.advantage ?? false,
    oncePerCombat: ability.oncePerCombat ?? false,
    kiCost: ability.kiCost && ability.kiCost > 0 ? ability.kiCost : undefined,
    damage: dmgSpec ? diceLine(dmgSpec) : undefined,
    bonusDamage: bonusSpec ? diceLine(bonusSpec) : undefined,
    rider: ability.riderDice ? diceLine(ability.riderDice) : undefined,
    upcastPerSlot:
      ability.dicePerSlotAbove && ability.dicePerSlotAbove > 0
        ? ability.dicePerSlotAbove
        : undefined,
    drainHealFraction: ability.drainHealFraction,
  };

  if (ability.dotDice || ability.dotTicks || ability.dotDurationSec) {
    card.dot = {
      perTick: ability.dotDice ? diceLine(ability.dotDice) : undefined,
      ticks: ability.dotTicks,
      durationSec: ability.dotDurationSec,
    };
  }

  if (ability.save) {
    card.save = { ability: ability.save.ability, effect: ability.save.effect, dc: opts.spellSaveDc };
  }

  if (ability.condition) {
    card.condition = { type: ability.condition.type, durationTurns: ability.condition.durationTurns };
  }

  if (ability.mitigationPct) {
    card.mitigation = { pct: ability.mitigationPct, durationSec: ability.mitigationDurationSec };
  }

  return card;
}
