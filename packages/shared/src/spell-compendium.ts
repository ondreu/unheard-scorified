/**
 * Spell compendium — in-game encyklopedie **všech kouzel ve hře**.
 *
 * Čistá (pure) vrstva nad katalogem abilit (`data/abilities.ts`). Agreguje každé
 * **kouzlo** ze dvou zdrojů a sjednotí ho dle jména (jeden záznam = jedno kouzlo +
 * množina tříd + zda je v Gauntlet draft poolu):
 *  1. **class kit** — `CLASS_BASELINE_ABILITIES` + `EXTRA_SPELLS` + subclass
 *     signatury; sem patří jen entry se `spellTier` (cantripy + leveled kouzla).
 *     Martial techniky (Weapon Strike, Sneak Attack, Action Surge…) **nejsou
 *     kouzla** (`spellTier == null`) → do spell kompendia nepatří.
 *  2. **Gauntlet draft pool** — `SIGNATURE_ABILITIES` (procedurální nabídka „nového
 *     kouzla" do runu). Tyhle entry jsou kouzla bez vazby na třídu; v Gauntletu se
 *     drží bez spell-slotu (tier-less = zdarma), takže nesou volitelný `spellTier`.
 *
 * Zobrazení karty jede přes sdílený `buildSpellCard` (jediný zdroj pravdy) →
 * kompendium se nerozejde s combatem ani s Knihou kouzel / level-upem.
 */
import {
  CLASS_BASELINE_ABILITIES,
  EXTRA_SPELLS,
  SIGNATURE_ABILITIES,
  SUBCLASS_ABILITIES,
  type AbilityKind,
  type SignatureAbility,
  type SpellSave,
} from './data/abilities';
import { CLASSES, CLASS_IDS, type ClassId, type SubclassId } from './data/classes';
import type { ConditionType } from './conditions';
import type { DamageType } from './data/damage';

/** Jeden záznam kompendia = kouzlo + množina tříd + zda je v Gauntlet draft poolu. */
export interface CompendiumSpell {
  /** Id reprezentativní varianty (pro stabilní klíč v UI). */
  id: string;
  name: string;
  description?: string;
  /** Reprezentativní ability (pro `buildSpellCard` na webu). */
  ability: SignatureAbility;
  /** Spell tier 0..9 (0 = cantrip). `undefined` = tier-less (Gauntlet draft). */
  spellTier?: number;
  isCantrip: boolean;
  kind: AbilityKind;
  /** Typ poškození (fire/radiant/…), pokud ho kouzlo nese. */
  damageType?: DamageType;
  /** Atribut saving throwu, pokud kouzlo hází save. */
  saveAbility?: SpellSave['ability'];
  /** Status efekt, který kouzlo uvalí (na neúspěšný save), pokud nějaký. */
  condition?: ConditionType;
  /** Třídy, které kouzlo mají (seřazené dle pořadí `CLASS_IDS`). Prázdné = jen draft. */
  classes: ClassId[];
  /** Lidsky čitelné názvy tříd (UI nehardcoduje). */
  classNames: string[];
  /** Kouzlo je nabízené v Gauntlet draft poolu (`SIGNATURE_ABILITIES`). */
  gauntletDraft: boolean;
}

/** Subclass id → mateřská třída (z `CLASSES`). */
const SUBCLASS_TO_CLASS: Record<string, ClassId> = (() => {
  const map: Record<string, ClassId> = {};
  for (const c of CLASS_IDS) {
    for (const sub of CLASSES[c].subclasses) map[sub.id] = c;
  }
  return map;
})();

/** Sentinel pro řazení/grupování tier-less kouzel (Gauntlet draft) — až na konec. */
const NO_TIER = 99;

/** Štítek tieru pro grupování v UI (cantrip / úroveň kouzla / Gauntlet draft). */
export function spellTierLabel(tier: number | undefined): string {
  if (tier == null) return 'Gauntlet draft';
  return tier === 0 ? 'Cantrip' : `Tier ${tier}`;
}

interface Accum {
  ability: SignatureAbility;
  classes: Set<ClassId>;
  gauntletDraft: boolean;
}

/** Je class-kit ability kouzlo (má spell tier)? Martial techniky nemají → nejsou kouzla. */
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
 * třídy, které ho mají + zda je v draft poolu). Reprezentativní varianta = první
 * nalezená (class kit má přednost před draft poolem; same-name kouzla sdílí D&D
 * dice/typ/save, liší se jen sim-knoby). Seřazeno dle tieru (tier-less na konec),
 * pak jména.
 */
export function allCompendiumSpells(): CompendiumSpell[] {
  const byName = new Map<string, Accum>();

  const addClassSpell = (
    raw: SignatureAbility & { unlockLevel?: number },
    klass: ClassId,
  ): void => {
    if (!isSpell(raw)) return;
    const existing = byName.get(raw.name);
    if (existing) {
      existing.classes.add(klass);
    } else {
      byName.set(raw.name, {
        ability: toSignature(raw),
        classes: new Set([klass]),
        gauntletDraft: false,
      });
    }
  };

  // 1) Class kit (baseline + rozšiřující pool) per třída — pořadí CLASS_IDS pro determinismus.
  for (const klass of CLASS_IDS) {
    for (const ab of CLASS_BASELINE_ABILITIES[klass]) addClassSpell(ab, klass);
    for (const ab of EXTRA_SPELLS[klass]) addClassSpell(ab, klass);
  }
  // …a subclass signatury (přiřadí kouzlo mateřské třídě).
  for (const subId of Object.keys(SUBCLASS_ABILITIES) as SubclassId[]) {
    const klass = SUBCLASS_TO_CLASS[subId];
    if (klass) addClassSpell(SUBCLASS_ABILITIES[subId], klass);
  }

  // 2) Gauntlet draft pool — kouzla bez vazby na třídu. Existující záznam jen
  //    označí jako draftovatelný; nové (draft-only) přidá s prázdnou množinou tříd.
  for (const [id, spec] of Object.entries(SIGNATURE_ABILITIES)) {
    const existing = byName.get(spec.name);
    if (existing) {
      existing.gauntletDraft = true;
    } else {
      byName.set(spec.name, {
        ability: { id, ...spec },
        classes: new Set(),
        gauntletDraft: true,
      });
    }
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
      spellTier: a.spellTier,
      isCantrip: a.spellTier === 0,
      kind: a.kind,
      damageType: a.damageType,
      saveAbility: a.save?.ability,
      condition: a.condition?.type,
      classes,
      classNames: classes.map((c) => CLASSES[c].name),
      gauntletDraft: acc.gauntletDraft,
    });
  }

  return spells.sort(
    (x, y) => (x.spellTier ?? NO_TIER) - (y.spellTier ?? NO_TIER) || x.name.localeCompare(y.name),
  );
}
