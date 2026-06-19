/**
 * D&D 5e tiered spell sloty (MR-4). Jediný zdroj pravdy pro to, kolik slotů
 * jakého tieru (1.–9. level kouzel) má postava dané třídy a levelu k dispozici.
 *
 * Idle model (rozhodnutí PM, viz ADR 0029):
 *  - Spell sloty jsou **zdroj spotřebovávaný aktivitami** (quest/grind/dungeon…):
 *    při startu aktivity se sloty „vyčerpají" dle délky/obtížnosti
 *    (`activitySlotCost`), seslání nejlepších dostupných kouzel.
 *  - **Long Rest = plné dobití** při claimu odměny / návratu (`longRest` → prázdné
 *    „spent"). Warlock (Pact Magic) dobíjí na **Short Rest** → v idle modelu se
 *    bere jako rychlejší obnova (taktéž reset při claimu; časová granularita = MR-5).
 *
 * Plný dopad spotřeby na boj (per-encounter depletion, „šetři sloty na bosse")
 * přijde s dice-roll combatem (MR-5). Tady stavíme systém + zdroj + zobrazení.
 *
 * Čistá data + pure funkce (žádný import z combatu/DB) → deterministické a
 * testovatelné, sdílené API↔web.
 */
import type { ClassId, SubclassId } from './classes';
import {
  classSpellCatalog,
  resolveAbilities,
  CLASS_BASELINE_ABILITIES,
  SUBCLASS_ABILITIES,
  type AbilityKind,
  type BaselineAbility,
  type SignatureAbility,
} from './abilities';

/**
 * Typ sesilatele (D&D 5e):
 *  - `full` — Bard, Cleric, Druid, Sorcerer, Wizard (plná tabulka 1.–9. tier).
 *  - `half` — Paladin, Ranger (poloviční progrese, sloty 1.–5. tier, od lvl 2).
 *  - `pact` — Warlock (Pact Magic: málo slotů, všechny na nejvyšším tieru,
 *    Short Rest recharge).
 *  - `none` — Barbarian, Fighter, Monk, Rogue (bez spell slotů; bojové zdroje).
 */
export type CasterType = 'full' | 'half' | 'pact' | 'none';

export const CASTER_TYPE: Record<ClassId, CasterType> = {
  barbarian: 'none',
  fighter: 'none',
  monk: 'none',
  rogue: 'none',
  paladin: 'half',
  ranger: 'half',
  warlock: 'pact',
  bard: 'full',
  cleric: 'full',
  druid: 'full',
  sorcerer: 'full',
  wizard: 'full',
};

export function casterTypeOf(klass: ClassId): CasterType {
  return CASTER_TYPE[klass] ?? 'none';
}

export function isCaster(klass: ClassId): boolean {
  return casterTypeOf(klass) !== 'none';
}

/** Nejvyšší tier kouzel (D&D 5e). */
export const MAX_SPELL_TIER = 9;

/**
 * Spell sloty: tier (1..9) → počet slotů. Tiery s 0 sloty se vynechávají
 * (řídká mapa) → jednoduché součty/iterace.
 */
export type SpellSlots = Record<number, number>;

// ── D&D 5e tabulky slotů (řádek = level 1..20, sloupce = tier 1..9 / 1..5) ────

/** Full caster (Bard/Cleric/Druid/Sorcerer/Wizard) — sloty tieru 1.–9. */
const FULL_CASTER_SLOTS: readonly (readonly number[])[] = [
  [2, 0, 0, 0, 0, 0, 0, 0, 0], // 1
  [3, 0, 0, 0, 0, 0, 0, 0, 0], // 2
  [4, 2, 0, 0, 0, 0, 0, 0, 0], // 3
  [4, 3, 0, 0, 0, 0, 0, 0, 0], // 4
  [4, 3, 2, 0, 0, 0, 0, 0, 0], // 5
  [4, 3, 3, 0, 0, 0, 0, 0, 0], // 6
  [4, 3, 3, 1, 0, 0, 0, 0, 0], // 7
  [4, 3, 3, 2, 0, 0, 0, 0, 0], // 8
  [4, 3, 3, 3, 1, 0, 0, 0, 0], // 9
  [4, 3, 3, 3, 2, 0, 0, 0, 0], // 10
  [4, 3, 3, 3, 2, 1, 0, 0, 0], // 11
  [4, 3, 3, 3, 2, 1, 0, 0, 0], // 12
  [4, 3, 3, 3, 2, 1, 1, 0, 0], // 13
  [4, 3, 3, 3, 2, 1, 1, 0, 0], // 14
  [4, 3, 3, 3, 2, 1, 1, 1, 0], // 15
  [4, 3, 3, 3, 2, 1, 1, 1, 0], // 16
  [4, 3, 3, 3, 2, 1, 1, 1, 1], // 17
  [4, 3, 3, 3, 3, 1, 1, 1, 1], // 18
  [4, 3, 3, 3, 3, 2, 1, 1, 1], // 19
  [4, 3, 3, 3, 3, 2, 2, 1, 1], // 20
];

/** Half caster (Paladin/Ranger) — sloty tieru 1.–5., progrese od lvl 2. */
const HALF_CASTER_SLOTS: readonly (readonly number[])[] = [
  [0, 0, 0, 0, 0], // 1
  [2, 0, 0, 0, 0], // 2
  [3, 0, 0, 0, 0], // 3
  [3, 0, 0, 0, 0], // 4
  [4, 2, 0, 0, 0], // 5
  [4, 2, 0, 0, 0], // 6
  [4, 3, 0, 0, 0], // 7
  [4, 3, 0, 0, 0], // 8
  [4, 3, 2, 0, 0], // 9
  [4, 3, 2, 0, 0], // 10
  [4, 3, 3, 0, 0], // 11
  [4, 3, 3, 0, 0], // 12
  [4, 3, 3, 1, 0], // 13
  [4, 3, 3, 1, 0], // 14
  [4, 3, 3, 2, 0], // 15
  [4, 3, 3, 2, 0], // 16
  [4, 3, 3, 3, 1], // 17
  [4, 3, 3, 3, 1], // 18
  [4, 3, 3, 3, 2], // 19
  [4, 3, 3, 3, 2], // 20
];

/** Pact Magic (Warlock) — počet slotů × jeden tier; Short Rest recharge. */
const PACT_MAGIC: readonly { slots: number; tier: number }[] = [
  { slots: 1, tier: 1 }, // 1
  { slots: 2, tier: 1 }, // 2
  { slots: 2, tier: 2 }, // 3
  { slots: 2, tier: 2 }, // 4
  { slots: 2, tier: 3 }, // 5
  { slots: 2, tier: 3 }, // 6
  { slots: 2, tier: 4 }, // 7
  { slots: 2, tier: 4 }, // 8
  { slots: 2, tier: 5 }, // 9
  { slots: 2, tier: 5 }, // 10
  { slots: 3, tier: 5 }, // 11
  { slots: 3, tier: 5 }, // 12
  { slots: 3, tier: 5 }, // 13
  { slots: 3, tier: 5 }, // 14
  { slots: 3, tier: 5 }, // 15
  { slots: 3, tier: 5 }, // 16
  { slots: 4, tier: 5 }, // 17
  { slots: 4, tier: 5 }, // 18
  { slots: 4, tier: 5 }, // 19
  { slots: 4, tier: 5 }, // 20
];

/** Řádek tabulky → řídká mapa `{ tier: count }` (vynechá nulové). */
function rowToSlots(row: readonly number[]): SpellSlots {
  const slots: SpellSlots = {};
  for (let i = 0; i < row.length; i++) {
    const count = row[i] ?? 0;
    if (count > 0) slots[i + 1] = count;
  }
  return slots;
}

/** Ořízne level do 1..20 (D&D cap). */
function clampLevel(level: number): number {
  return Math.max(1, Math.min(20, Math.floor(level)));
}

/**
 * Maximální spell sloty postavy dané třídy a levelu (plně odpočatá). Non-caster
 * → prázdná mapa.
 */
export function spellSlotsFor(klass: ClassId, level: number): SpellSlots {
  const lvl = clampLevel(level);
  switch (casterTypeOf(klass)) {
    case 'full':
      return rowToSlots(FULL_CASTER_SLOTS[lvl - 1]!);
    case 'half':
      return rowToSlots(HALF_CASTER_SLOTS[lvl - 1]!);
    case 'pact': {
      const pact = PACT_MAGIC[lvl - 1]!;
      return pact.slots > 0 ? { [pact.tier]: pact.slots } : {};
    }
    case 'none':
    default:
      return {};
  }
}

/** Celkový počet slotů (napříč tiery). */
export function totalSpellSlots(slots: SpellSlots): number {
  let total = 0;
  for (const tier of Object.keys(slots)) total += slots[Number(tier)] ?? 0;
  return total;
}

/** Nejvyšší tier s alespoň jedním slotem (0 = žádné sloty). */
export function highestSpellTier(slots: SpellSlots): number {
  let max = 0;
  for (const tier of Object.keys(slots)) {
    const t = Number(tier);
    if ((slots[t] ?? 0) > 0 && t > max) max = t;
  }
  return max;
}

/** Tiery (vzestupně), které mají alespoň jeden slot. */
export function spellSlotTiers(slots: SpellSlots): number[] {
  return Object.keys(slots)
    .map(Number)
    .filter((t) => (slots[t] ?? 0) > 0)
    .sort((a, b) => a - b);
}

/**
 * Vyčerpá jeden spell slot tieru **>= `minTier`**. **Mutuje** předaný rozpočet
 * (lokální kopie per-encounter); vrací použitý tier, nebo `null` když žádný slot
 * tieru ≥ minTier není (kouzlo „fizzles" → postava sáhne po zbrani/cantripu).
 *
 * `preferHighest`:
 *  - `false` (default) — **nejnižší** dostupný slot (upcast jen když musí). Úsporné
 *    hospodaření pro kouzla, jimž upcast nepomáhá (heal/buff/smite bez `dice`).
 *  - `true` — **nejvyšší** dostupný slot (maximální upcast). Pro upcastovatelné nuke
 *    (`dice` + `dicePerSlotAbove`): high-level caster vrazí do bombu svůj největší
 *    slot → velké sloty (které existují jen na vysokém levelu) konečně škálují damage.
 *
 * Sdílený slot model napříč VŠEMI bojovými simulátory (quest / dungeon / PVP /
 * Gauntlet) — jediný zdroj per-encounter spotřeby slotů.
 */
export function spendSlotForTier(
  slots: SpellSlots,
  minTier: number,
  preferHighest = false,
): number | null {
  const lo = Math.max(1, minTier);
  if (preferHighest) {
    for (let tier = MAX_SPELL_TIER; tier >= lo; tier--) {
      if ((slots[tier] ?? 0) > 0) {
        slots[tier] = (slots[tier] ?? 0) - 1;
        return tier;
      }
    }
    return null;
  }
  for (let tier = lo; tier <= MAX_SPELL_TIER; tier++) {
    if ((slots[tier] ?? 0) > 0) {
      slots[tier] = (slots[tier] ?? 0) - 1;
      return tier;
    }
  }
  return null;
}

/**
 * Má kouzlo prospěch z upcastu? Upcastovatelné nuke (`dice` + `dicePerSlotAbove`,
 * např. Fireball +1d6/slot) → `true` (sešli nejvyšším slotem). Ostatní (heal/buff/
 * smite, kouzla bez per-slot kostek) → `false` (úsporně, nejnižší slot).
 */
export function abilityPrefersUpcast(ability: {
  dice?: unknown;
  dicePerSlotAbove?: number;
}): boolean {
  return ability.dice != null && (ability.dicePerSlotAbove ?? 0) > 0;
}

/**
 * Je k dispozici alespoň jeden slot tieru **>= `minTier`**? Čistá kontrola (nemutuje)
 * — pro UI (zašednutí kouzla bez slotu) a server-side validaci tahu, kde se ještě
 * nesmí utratit. `minTier ≤ 0` (cantrip/martial) → vždy `true` (at-will, bez slotu).
 */
export function hasSlotForTier(slots: SpellSlots, minTier: number): boolean {
  if (minTier < 1) return true;
  for (let tier = minTier; tier <= 9; tier++) {
    if ((slots[tier] ?? 0) > 0) return true;
  }
  return false;
}

/** Součet dvou slot map (využito pro „spent" akumulaci). */
export function addSlots(a: SpellSlots, b: SpellSlots): SpellSlots {
  const out: SpellSlots = { ...a };
  for (const tier of Object.keys(b)) {
    const t = Number(tier);
    out[t] = (out[t] ?? 0) + (b[t] ?? 0);
  }
  return out;
}

/**
 * Zbývající (available) sloty = max − spent, clampnuté na ≥ 0 a max
 * (přebytečný/nevalidní „spent" se ignoruje). Jediný zdroj pravdy pro „kolik
 * mám teď k dispozici".
 */
export function availableSlots(max: SpellSlots, spent: SpellSlots): SpellSlots {
  const out: SpellSlots = {};
  for (const tier of Object.keys(max)) {
    const t = Number(tier);
    const remaining = (max[t] ?? 0) - (spent[t] ?? 0);
    if (remaining > 0) out[t] = Math.min(remaining, max[t] ?? 0);
  }
  return out;
}

/**
 * Spotřebuje `count` slotů od **nejvyššího dostupného tieru** dolů (sešle nejlepší
 * kouzla) — vrací novou „spent" mapu (přičtenou k předchozí). Když není dost
 * slotů, spotřebuje co může (idle: postava prostě dál mlátí zbraní/cantripy).
 */
export function spendHighestSlots(
  max: SpellSlots,
  spent: SpellSlots,
  count: number,
): SpellSlots {
  let remaining = Math.max(0, Math.floor(count));
  let nextSpent: SpellSlots = { ...spent };
  while (remaining > 0) {
    const avail = availableSlots(max, nextSpent);
    const tier = highestSpellTier(avail);
    if (tier === 0) break; // nic víc k utracení
    nextSpent = addSlots(nextSpent, { [tier]: 1 });
    remaining--;
  }
  return nextSpent;
}

/**
 * „Spent" mapa po Long Restu — plné dobití = nic vyčerpaného. Pure (vrací nový
 * objekt) → repozitář ji jen uloží.
 */
export function longRest(): SpellSlots {
  return {};
}

/**
 * Kolik slotů spotřebuje aktivita dané délky. Idle aproximace: ~1 slot za každou
 * započatou půlhodinu adventuru, strop 6 (delší/těžší běhy „vyjedou" víc kouzel).
 * Skutečná spotřeba je clampnutá dostupnými sloty ve `spendHighestSlots`.
 */
export function activitySlotCost(durationSec: number): number {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return 0;
  return Math.min(6, Math.max(1, Math.ceil(durationSec / 1800)));
}

// ── Spellbook (spell list per class) ─────────────────────────────────────────

/** Jeden záznam ve spellbooku (známé kouzlo / cantrip). */
export interface SpellbookEntry {
  id: string;
  name: string;
  description?: string;
  kind: AbilityKind;
  /** 0 = cantrip (at-will), 1..9 = kouzlo daného levelu. */
  spellTier: number;
}

/** Skupina kouzel jednoho tieru. */
export interface SpellTierGroup {
  tier: number;
  spells: SpellbookEntry[];
}

/** Spellbook postavy — cantripy + známá kouzla seskupená po tieru. */
export interface Spellbook {
  casterType: CasterType;
  /** Cantripy (tier 0, at-will, bez slotu). */
  cantrips: SpellbookEntry[];
  /** Známá kouzla seskupená po tieru (vzestupně). */
  spellsByTier: SpellTierGroup[];
}

/**
 * Spellbook postavy: známá kouzla (z `resolveAbilities`, gated levelem/subclassem)
 * seskupená po tieru. Martial classy (casterType `none`) → prázdný spellbook
 * (jejich „abilities" jsou bojové techniky, ne kouzla — viz panel abilit/rotace).
 * Class features bez `spellTier` (např. Wild Shape) se zde nezobrazují.
 */
export function spellbookFor(
  klass: ClassId,
  subclass: SubclassId | null | undefined,
  level: number,
): Spellbook {
  const casterType = casterTypeOf(klass);
  if (casterType === 'none') {
    return { casterType, cantrips: [], spellsByTier: [] };
  }

  const cantrips: SpellbookEntry[] = [];
  const byTier = new Map<number, SpellbookEntry[]>();

  for (const ab of resolveAbilities(klass, subclass ?? null, level)) {
    if (ab.spellTier === undefined) continue; // class feature, ne kouzlo
    const entry: SpellbookEntry = {
      id: ab.id,
      name: ab.name,
      description: ab.description,
      kind: ab.kind,
      spellTier: ab.spellTier,
    };
    if (ab.spellTier === 0) {
      cantrips.push(entry);
    } else {
      const list = byTier.get(ab.spellTier) ?? [];
      list.push(entry);
      byTier.set(ab.spellTier, list);
    }
  }

  const spellsByTier: SpellTierGroup[] = [...byTier.keys()]
    .sort((a, b) => a - b)
    .map((tier) => ({ tier, spells: byTier.get(tier)! }));

  return { casterType, cantrips, spellsByTier };
}

// ── Prepared spells (Kniha kouzel / ADR 0039) ────────────────────────────────
//
// Caster si z `classSpellCatalog` volí aktivní (prepared) kouzla — cantripy a
// leveled spelly zvlášť, každé se svým limitem. „Always-on" abilities (baseline
// bez `spellTier` = martial techniky/class features + subclass signature) jsou
// dostupné vždy a do limitů se nepočítají. Swap je zdarma (gate = Long Rest /
// level-up, řeší API), tady jen čistá data + validace.

/** Limit aktivních kouzel: kolik cantripů a leveled kouzel smí mít postava připravených. */
export interface PreparedLimits {
  cantrips: number;
  leveled: number;
}

/**
 * Limity prepared kouzel dle classy/levelu (záměrně štědré — rozhodnutí PM:
 * „ať je z čeho vybírat a hráč nemá problém"). Cantripy škálují 2→3→4 (lvl 4/10);
 * leveled dle caster typu (full nejvíc, half/pact méně). Non-caster → 0/0.
 */
export function preparedLimits(klass: ClassId, level: number): PreparedLimits {
  const lvl = clampLevel(level);
  switch (casterTypeOf(klass)) {
    case 'full':
      return { cantrips: 2 + (lvl >= 4 ? 1 : 0) + (lvl >= 10 ? 1 : 0), leveled: 4 + Math.floor(lvl / 2) };
    case 'pact':
      return { cantrips: 2 + (lvl >= 4 ? 1 : 0) + (lvl >= 10 ? 1 : 0), leveled: 2 + Math.floor(lvl / 3) };
    case 'half':
      // Paladin/Ranger — bez cantripů v D&D; leveled poloviční tempo.
      return { cantrips: 0, leveled: 2 + Math.floor(lvl / 4) };
    case 'none':
    default:
      return { cantrips: 0, leveled: 0 };
  }
}

/**
 * Volitelná kouzla (pool nabídky) classy do daného levelu — cantripy a leveled
 * zvlášť. **Bez** subclass signature a bez martial technik (always-on). Pro UI
 * editoru Knihy kouzel.
 */
export function spellPoolFor(
  klass: ClassId,
  level: number,
): { cantrips: SpellbookEntry[]; leveled: SpellbookEntry[] } {
  const cantrips: SpellbookEntry[] = [];
  const leveled: SpellbookEntry[] = [];
  for (const ab of classSpellCatalog(klass)) {
    if (ab.spellTier === undefined) continue; // martial technika / class feature
    if (level < ab.unlockLevel) continue;
    const entry: SpellbookEntry = {
      id: ab.id,
      name: ab.name,
      description: ab.description,
      kind: ab.kind,
      spellTier: ab.spellTier,
    };
    if (ab.spellTier === 0) cantrips.push(entry);
    else leveled.push(entry);
  }
  leveled.sort((a, b) => a.spellTier - b.spellTier || a.name.localeCompare(b.name));
  cantrips.sort((a, b) => a.name.localeCompare(b.name));
  return { cantrips, leveled };
}

/** Baseline kouzla (legacy kit) classy do levelu — výchozí prepared sada (zpětná kompatibilita). */
function baselineSpellIds(klass: ClassId, level: number): string[] {
  return (CLASS_BASELINE_ABILITIES[klass] ?? [])
    .filter((ab) => ab.spellTier !== undefined && level >= ab.unlockLevel)
    .map((ab) => ab.id);
}

/**
 * Výchozí (auto) prepared sada — legacy baseline kit. Postavy bez uložené volby
 * (nebo po resetu) dostanou přesně dřívější kit → žádná regrese v boji; rozšiřující
 * pool je čistě opt-in přes editor.
 */
export function defaultPreparedSpellIds(klass: ClassId, level: number): string[] {
  return baselineSpellIds(klass, level);
}

/**
 * Validuje výběr prepared kouzel: každé id musí být v poolu classy do levelu a
 * počty (cantrip/leveled) nesmí přesáhnout limity. Always-on (subclass/martial)
 * se sem nepředávají.
 */
export function isValidPreparedSelection(
  klass: ClassId,
  level: number,
  ids: readonly string[],
): boolean {
  const pool = spellPoolFor(klass, level);
  const byId = new Map<string, SpellbookEntry>();
  for (const e of [...pool.cantrips, ...pool.leveled]) byId.set(e.id, e);
  const unique = new Set(ids);
  if (unique.size !== ids.length) return false; // duplicity
  let cantrips = 0;
  let leveled = 0;
  for (const id of unique) {
    const e = byId.get(id);
    if (!e) return false; // mimo pool / pod levelem
    if (e.spellTier === 0) cantrips++;
    else leveled++;
  }
  const limits = preparedLimits(klass, level);
  return cantrips <= limits.cantrips && leveled <= limits.leveled;
}

/**
 * Bojový abilit set postavy s ohledem na prepared volbu (Kniha kouzel). Vrací:
 *  - **always-on** abilities (baseline bez `spellTier` + subclass signature) — vždy,
 *  - **vybraná kouzla** z poolu (cantripy + leveled) dle `prepared`.
 *
 * `prepared == null/undefined` → legacy: vrátí přesně `resolveAbilities` (baseline
 * kit + subclass) → zpětná kompatibilita pro postavy bez uložené volby. Neplatná id
 * v `prepared` (mimo pool / nad limit) se bezpečně ignorují (defenzivní clamp).
 */
export function resolvePreparedAbilities(
  klass: ClassId,
  subclass: SubclassId | null | undefined,
  level: number,
  prepared: readonly string[] | null | undefined,
): SignatureAbility[] {
  if (prepared == null) return resolveAbilities(klass, subclass ?? null, level);

  const out: SignatureAbility[] = [];
  const strip = (ab: BaselineAbility): SignatureAbility => {
    const { unlockLevel: _u, ...sig } = ab;
    return sig;
  };

  // Always-on: baseline bez spellTier (martial techniky / class features).
  for (const ab of CLASS_BASELINE_ABILITIES[klass] ?? []) {
    if (ab.spellTier === undefined && level >= ab.unlockLevel) out.push(strip(ab));
  }

  // Vybraná kouzla z poolu (cantrip + leveled), v limitech (defenzivní clamp).
  const wanted = new Set(prepared);
  const limits = preparedLimits(klass, level);
  let cantrips = 0;
  let leveled = 0;
  for (const ab of classSpellCatalog(klass)) {
    if (ab.spellTier === undefined || level < ab.unlockLevel) continue;
    if (!wanted.has(ab.id)) continue;
    if (ab.spellTier === 0) {
      if (cantrips >= limits.cantrips) continue;
      cantrips++;
    } else {
      if (leveled >= limits.leveled) continue;
      leveled++;
    }
    out.push(strip(ab));
  }

  // Subclass signature — always-on (class identita).
  if (subclass) {
    const sub = SUBCLASS_ABILITIES[subclass];
    if (sub && level >= sub.unlockLevel) out.push(strip(sub));
  }
  return out;
}
