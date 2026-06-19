/**
 * Level track 1–20 (Level-up overhaul, Slice A — UI redesign / přehlednost).
 *
 * Čistá prezentační vrstva nad **existujícími** daty (žádná změna mechanik):
 * pro každý level 1–20 spočítá, co přináší — HP z hit dice, proficiency bonus,
 * nové spell sloty, nově dostupná kouzla (do Knihy kouzel), class/subclass
 * features a milníkové volby (subclass / ASI / Feat). Cíl: **každý level = událost
 * s feedbackem**, ne prázdno (dnešní `/levelup` dává volbu jen na 5 levelech).
 *
 * Jediný zdroj pravdy (API i web) — agreguje `classes` / `spell-slots` /
 * `abilities` / `levelup`, nic neduplikuje. Pure funkce → deterministické a
 * testovatelné.
 */
import { MAX_LEVEL } from './constants';
import { proficiencyBonus, dndMaxHp } from './character';
import { CLASSES, SUBCLASSES, type ClassId, type SubclassId } from './data/classes';
import {
  CLASS_BASELINE_ABILITIES,
  SUBCLASS_ABILITIES,
  classSpellCatalog,
} from './data/abilities';
import { ASI_LEVELS } from './levelup';
import { spellSlotsFor, casterTypeOf, type CasterType } from './data/spell-slots';
import { classFeatureSlotsFor } from './data/class-features';

/** Milníková volba odemčená na daném levelu (mapuje na `levelUpSlots`). */
export type LevelTrackChoiceType = 'subclass' | 'asi_or_feat' | 'class_feature';

/** Nově odemčená feature / kouzlo (čistá prezentace). */
export interface LevelTrackEntry_Feature {
  id: string;
  name: string;
  description?: string;
  /** Spell tier (0 = cantrip, 1..9 = kouzlo). `undefined` = class feature / technika. */
  spellTier?: number;
}

/** Nově přidaný / navýšený spell slot na daném levelu. */
export interface LevelTrackSlotGain {
  tier: number;
  /** Kolik slotů tohoto tieru přibylo oproti minulému levelu. */
  gained: number;
  /** Celkový počet slotů tohoto tieru na tomto levelu. */
  total: number;
}

/** Co přináší jeden level (1–20). */
export interface LevelTrackEntry {
  level: number;
  /** Postava na tento level už dosáhla (řídí UI: dostupnost milníkových voleb). */
  reached: boolean;
  /** Proficiency bonus na tomto levelu (+2 … +6). */
  proficiencyBonus: number;
  /** Vzrostl proficiency bonus oproti minulému levelu? */
  proficiencyIncreased: boolean;
  /** HP získané na tomto levelu (lvl 1 = max hit die + CON, dál = avg + CON). */
  hpGain: number;
  /** Celkové max HP na tomto levelu. */
  totalHp: number;
  /** Nové / navýšené spell sloty na tomto levelu. */
  newSpellSlots: LevelTrackSlotGain[];
  /** Nově odemčené class/subclass features (techniky, ne kouzla do výběru). */
  newFeatures: LevelTrackEntry_Feature[];
  /** Nově dostupná kouzla do Knihy kouzel (caster pool, k přípravě). */
  newSpells: LevelTrackEntry_Feature[];
  /** Milníkové volby odemčené na tomto levelu (subclass / ASI / Feat). */
  choices: LevelTrackChoiceType[];
}

/** Celý level track postavy + meta pro hlavičku UI. */
export interface LevelTrack {
  klass: ClassId;
  className: string;
  subclass: SubclassId | null;
  subclassName: string | null;
  casterType: CasterType;
  currentLevel: number;
  entries: LevelTrackEntry[];
}

function toFeature(ab: {
  id: string;
  name: string;
  description?: string;
  spellTier?: number;
}): LevelTrackEntry_Feature {
  return { id: ab.id, name: ab.name, description: ab.description, spellTier: ab.spellTier };
}

/**
 * Sestaví level track 1–20 pro danou třídu/subclass/level. `conMod` (CON
 * modifikátor postavy) jen pro výpočet HP — nezávisí na něm žádná mechanika.
 *
 * - **newFeatures** — baseline class abilities bez `spellTier` (martial techniky /
 *   class features) + subclass signature, odemčené přesně na tomto levelu.
 * - **newSpells** — kouzla z `classSpellCatalog` (baseline + rozšířený pool) se
 *   `spellTier`, odemčená přesně na tomto levelu (k přípravě v Knize kouzel).
 * - **choices** — subclass na `subclassLevel`, ASI/Feat na `ASI_LEVELS`.
 */
export function buildLevelTrack(
  klass: ClassId,
  subclass: SubclassId | null | undefined,
  currentLevel: number,
  conMod = 0,
): LevelTrack {
  const def = CLASSES[klass];
  const sub = subclass ?? null;
  const hitDie = def.hitDie;

  // Index baseline abilit a pool kouzel podle unlockLevel.
  const baseline = CLASS_BASELINE_ABILITIES[klass] ?? [];
  const catalog = classSpellCatalog(klass);
  const subAbility = sub ? SUBCLASS_ABILITIES[sub] : undefined;
  const asiLevels = new Set<number>(ASI_LEVELS);
  // Levely, na kterých se odemyká aspoň jedna class-feature volba (s ohledem na subclass).
  const classFeatureLevels = new Set<number>(
    classFeatureSlotsFor(klass, MAX_LEVEL, sub).map((s) => s.level),
  );

  const entries: LevelTrackEntry[] = [];
  for (let level = 1; level <= MAX_LEVEL; level++) {
    const prof = proficiencyBonus(level);
    const proficiencyIncreased = level > 1 && prof !== proficiencyBonus(level - 1);

    const totalHp = dndMaxHp(hitDie, level, conMod);
    const hpGain = level === 1 ? totalHp : totalHp - dndMaxHp(hitDie, level - 1, conMod);

    // Nové spell sloty = diff oproti minulému levelu.
    const slots = spellSlotsFor(klass, level);
    const prev = level > 1 ? spellSlotsFor(klass, level - 1) : {};
    const newSpellSlots: LevelTrackSlotGain[] = [];
    for (const key of Object.keys(slots)) {
      const tier = Number(key);
      const gained = (slots[tier] ?? 0) - (prev[tier] ?? 0);
      if (gained > 0) newSpellSlots.push({ tier, gained, total: slots[tier] ?? 0 });
    }
    newSpellSlots.sort((a, b) => a.tier - b.tier);

    // Nové features (techniky / class features) — baseline bez spellTier + subclass signature.
    const newFeatures: LevelTrackEntry_Feature[] = baseline
      .filter((ab) => ab.unlockLevel === level && ab.spellTier === undefined)
      .map(toFeature);
    if (subAbility && subAbility.unlockLevel === level) {
      newFeatures.push(toFeature(subAbility));
    }

    // Nová kouzla do Knihy kouzel — catalog se spellTier, odemčená na tomto levelu.
    const newSpells: LevelTrackEntry_Feature[] = catalog
      .filter((ab) => ab.unlockLevel === level && ab.spellTier !== undefined)
      .map(toFeature)
      .sort((a, b) => (a.spellTier ?? 0) - (b.spellTier ?? 0) || a.name.localeCompare(b.name));

    const choices: LevelTrackChoiceType[] = [];
    if (level === def.subclassLevel) choices.push('subclass');
    if (asiLevels.has(level)) choices.push('asi_or_feat');
    if (classFeatureLevels.has(level)) choices.push('class_feature');

    entries.push({
      level,
      reached: level <= currentLevel,
      proficiencyBonus: prof,
      proficiencyIncreased,
      hpGain,
      totalHp,
      newSpellSlots,
      newFeatures,
      newSpells,
      choices,
    });
  }

  return {
    klass,
    className: def.name,
    subclass: sub,
    subclassName: sub ? (SUBCLASSES[sub]?.name ?? null) : null,
    casterType: casterTypeOf(klass),
    currentLevel: Math.max(1, Math.min(MAX_LEVEL, Math.floor(currentLevel))),
    entries,
  };
}
