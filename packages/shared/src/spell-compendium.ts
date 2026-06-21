/**
 * Spell compendium — in-game encyklopedie **všech kouzel ve hře**.
 *
 * Čistá (pure) vrstva nad katalogem abilit (`data/abilities.ts` + `EXTRA_SPELLS`
 * + subclass signatury). Agreguje každé **kouzlo** (entry se `spellTier`, tj.
 * cantripy + leveled kouzla — martial techniky bez `spellTier` nejsou kouzla a
 * sem nepatří) a sjednotí ho napříč třídami: stejné jméno (Cure Wounds, Fireball)
 * = jeden záznam s množinou tříd, které ho mají. Zobrazení karty pak jede přes
 * sdílený `buildSpellCard` (jediný zdroj pravdy) → kompendium se nerozejde s
 * combatem ani s Knihou kouzel / level-upem (čerpají ze stejných dat).
 *
 * Gauntlet draft-pool (`SIGNATURE_ABILITIES`) sem **nepatří** — to je procedurální
 * mechanika bez vazby na třídu; kompendium ukazuje kouzla, která hráč reálně sesílá
 * přes svou postavu. (Případné zařazení = follow-up.)
 */
import {
  CLASS_BASELINE_ABILITIES,
  EXTRA_SPELLS,
  SUBCLASS_ABILITIES,
  type AbilityKind,
  type SignatureAbility,
  type SpellSave,
} from './data/abilities';
import { CLASSES, CLASS_IDS, type ClassId, type SubclassId } from './data/classes';
import type { ConditionType } from './conditions';
import type { DamageType } from './data/damage';

/** Jeden záznam kompendia = kouzlo + množina tříd, které ho mají. */
export interface CompendiumSpell {
  /** Id reprezentativní varianty (pro stabilní klíč v UI). */
  id: string;
  name: string;
  description?: string;
  /** Reprezentativní ability (pro `buildSpellCard` na webu). */
  ability: SignatureAbility;
  /** Spell tier 0..9 (0 = cantrip). */
  spellTier: number;
  isCantrip: boolean;
  kind: AbilityKind;
  /** Typ poškození (fire/radiant/…), pokud ho kouzlo nese. */
  damageType?: DamageType;
  /** Atribut saving throwu, pokud kouzlo hází save. */
  saveAbility?: SpellSave['ability'];
  /** Status efekt, který kouzlo uvalí (na neúspěšný save), pokud nějaký. */
  condition?: ConditionType;
  /** Třídy, které kouzlo mají (seřazené dle pořadí `CLASS_IDS`). */
  classes: ClassId[];
  /** Lidsky čitelné názvy tříd (UI nehardcoduje). */
  classNames: string[];
}

/** Subclass id → mateřská třída (z `CLASSES`). */
const SUBCLASS_TO_CLASS: Record<string, ClassId> = (() => {
  const map: Record<string, ClassId> = {};
  for (const c of CLASS_IDS) {
    for (const sub of CLASSES[c].subclasses) map[sub.id] = c;
  }
  return map;
})();

/** Štítek tieru pro grupování v UI (cantrip vs. úroveň kouzla). */
export function spellTierLabel(tier: number): string {
  return tier === 0 ? 'Cantrip' : `Tier ${tier}`;
}

interface Accum {
  ability: SignatureAbility;
  classes: Set<ClassId>;
}

/** Je ability kouzlo (má spell tier 0..9)? Martial techniky nemají → nejsou kouzla. */
function isSpell(ability: SignatureAbility): boolean {
  return ability.spellTier != null;
}

/** Strip `unlockLevel` (compendium nepotřebuje level-gating) → čistá `SignatureAbility`. */
function toSignature(ability: SignatureAbility & { unlockLevel?: number }): SignatureAbility {
  const { unlockLevel: _u, ...sig } = ability;
  return sig;
}

/**
 * Všechna kouzla ve hře, sjednocená dle jména (jeden záznam = jedno kouzlo +
 * třídy, které ho mají). Reprezentativní varianta = první nalezená (dle pořadí
 * tříd / baseline před extra) — same-name kouzla sdílí D&D dice/typ/save, liší se
 * jen sim-knoby (cooldown/mult), takže karta je reprezentativní. Seřazeno dle
 * tieru, pak jména.
 */
export function allCompendiumSpells(): CompendiumSpell[] {
  const byName = new Map<string, Accum>();

  const add = (raw: SignatureAbility & { unlockLevel?: number }, klass: ClassId): void => {
    if (!isSpell(raw)) return;
    const existing = byName.get(raw.name);
    if (existing) {
      existing.classes.add(klass);
    } else {
      byName.set(raw.name, { ability: toSignature(raw), classes: new Set([klass]) });
    }
  };

  // Baseline + rozšiřující pool per třída (v pořadí CLASS_IDS pro determinismus).
  for (const klass of CLASS_IDS) {
    for (const ab of CLASS_BASELINE_ABILITIES[klass]) add(ab, klass);
    for (const ab of EXTRA_SPELLS[klass]) add(ab, klass);
  }
  // Subclass signatury — přiřadí kouzlo mateřské třídě.
  for (const subId of Object.keys(SUBCLASS_ABILITIES) as SubclassId[]) {
    const klass = SUBCLASS_TO_CLASS[subId];
    if (klass) add(SUBCLASS_ABILITIES[subId], klass);
  }

  const spells: CompendiumSpell[] = [];
  for (const acc of byName.values()) {
    const a = acc.ability;
    const classes = CLASS_IDS.filter((c) => acc.classes.has(c));
    spells.push({
      id: a.id,
      name: a.name,
      description: a.description,
      ability: a,
      spellTier: a.spellTier ?? 0,
      isCantrip: a.spellTier === 0,
      kind: a.kind,
      damageType: a.damageType,
      saveAbility: a.save?.ability,
      condition: a.condition?.type,
      classes,
      classNames: classes.map((c) => CLASSES[c].name),
    });
  }

  return spells.sort((x, y) => x.spellTier - y.spellTier || x.name.localeCompare(y.name));
}
