/**
 * Class progression — Level-up overhaul **Slice C** (ADR 0041).
 *
 * Automatické class features na jejich D&D levelech, **odvozené z jediného zdroje
 * pravdy** (engine + class-resources), aby se zviditelnily v level tracku. Jde o
 * features, které *nedávají volbu* (volby = subclass / ASI / Feat / class-feature
 * skupiny řeší `levelup.ts` + `class-features.ts`, Slice B) — tedy „co level
 * automaticky přinese", aby ani „prázdné" levely nezely v `/levelup`.
 *
 * **Žádná duplikace magnitud** (konvence „sdílená pravda jen jednou"): prahy i
 * čísla se čtou z `basicAttackDiceCount` / `cantripDiceMultiplier` (combat),
 * `rageChargesFor` / `rageDamageBonus` / `kiPointsFor` (class-resources) a ze
 * scalingu baseline abilit (`bonusDicePerLevels`). Surfaceujeme **jen to, co engine
 * skutečně modeluje** — žádné fiktivní features (Channel Divinity uses ap. = až s
 * jejich mechanickou implementací, „Enemy/class features" backlog).
 *
 * Pure data/derivace → deterministické, testovatelné, sdílené API↔web.
 */
import { MAX_LEVEL } from './constants';
import { type ClassId } from './data/classes';
import { CLASS_BASELINE_ABILITIES } from './data/abilities';
import { kiPointsFor, rageChargesFor, rageDamageBonus } from './data/class-resources';
import { casterTypeOf } from './data/spell-slots';
import { basicAttackDiceCount, cantripDiceMultiplier } from './combat';

/** Jedna automatická class feature odemčená na konkrétním levelu (čistá prezentace). */
export interface ClassFeatureMilestone {
  /** Stabilní id (`prog_*@<level>`) — unikátní v rámci classy. */
  id: string;
  level: number;
  name: string;
  description: string;
}

/** Počítá engine `basicAttackDiceCount` s caster větví? (full/pact caster). */
function isEngineCaster(klass: ClassId): boolean {
  const ct = casterTypeOf(klass);
  return ct === 'full' || ct === 'pact';
}

/**
 * Automatické class features třídy napříč levely 1–20. Každá položka má `level`,
 * na kterém se feature odemyká / navyšuje. Magnitudy jsou odvozené (viz hlavička),
 * takže se nikdy nerozejdou s bojovým enginem.
 */
export function classProgression(klass: ClassId): ClassFeatureMilestone[] {
  const out: ClassFeatureMilestone[] = [];
  const caster = isEngineCaster(klass);

  // Extra Attack (martial) / Improved Cantrips (caster) — prahy a počet kostek/útoků
  // z jádra (basicAttackDiceCount / cantripDiceMultiplier). Surfaceujeme jen levely,
  // kde se počet zvýší (martial 5/11/20, caster 5/11/17).
  for (let level = 2; level <= MAX_LEVEL; level++) {
    if (caster) {
      const now = cantripDiceMultiplier(level);
      if (now > cantripDiceMultiplier(level - 1)) {
        out.push({
          id: `prog_cantrip@${level}`,
          level,
          name: 'Improved Cantrips',
          description: `Your at-will cantrips now strike with ${now} damage dice.`,
        });
      }
    } else {
      const now = basicAttackDiceCount(level, false);
      if (now > basicAttackDiceCount(level - 1, false)) {
        out.push({
          id: `prog_extra_attack@${level}`,
          level,
          name: now === 2 ? 'Extra Attack' : 'Improved Extra Attack',
          description: `You strike ${now} times when you attack.`,
        });
      }
    }
  }

  // Rage (Barbarian) — uses/odpočinek a damage bonus z class-resources.
  if (klass === 'barbarian') {
    out.push({
      id: 'prog_rage@1',
      level: 1,
      name: 'Rage',
      description:
        `Enter a battle fury: resistance to physical damage and +${rageDamageBonus(1)} damage ` +
        `while raging. ${rageChargesFor('barbarian', 1)} uses per long rest.`,
    });
    for (let level = 2; level <= MAX_LEVEL; level++) {
      const uses = rageChargesFor('barbarian', level);
      if (uses > rageChargesFor('barbarian', level - 1)) {
        out.push({
          id: `prog_rage_uses@${level}`,
          level,
          name: 'Rage',
          description: `Rage uses per long rest increase to ${uses}.`,
        });
      }
      const dmg = rageDamageBonus(level);
      if (dmg > rageDamageBonus(level - 1)) {
        out.push({
          id: `prog_rage_dmg@${level}`,
          level,
          name: 'Rage',
          description: `Your Rage damage bonus increases to +${dmg}.`,
        });
      }
    }
  }

  // Ki (Monk) — pool = úroveň (roste každým levelem), jediná položka na lvl 1.
  if (klass === 'monk') {
    out.push({
      id: 'prog_ki@1',
      level: 1,
      name: 'Ki',
      description:
        `A pool of ki points equal to your level fuels your techniques ` +
        `(${kiPointsFor('monk', 1)} at level 1, growing each level).`,
    });
  }

  // Scaling baseline technik s `bonusDicePerLevels` (Rogue Sneak Attack: +Nd6,
  // N = ceil(level/2)). Odvozeno přesně jako `bonusDiceSpec` v enginu. Položka jen
  // na levelech, kde počet kostek vzroste (unlock level řeší baseline ability sama).
  for (const ab of CLASS_BASELINE_ABILITIES[klass] ?? []) {
    if (!ab.bonusDicePerLevels || ab.bonusDicePerLevels <= 0) continue;
    const per = ab.bonusDicePerLevels;
    const sides = ab.bonusDice?.sides ?? 6;
    const diceAt = (lvl: number): number => Math.max(1, Math.ceil(Math.max(1, lvl) / per));
    for (let level = ab.unlockLevel + 1; level <= MAX_LEVEL; level++) {
      const now = diceAt(level);
      if (now > diceAt(level - 1)) {
        out.push({
          id: `prog_${ab.id}_scale@${level}`,
          level,
          name: ab.name,
          description: `${ab.name} now adds ${now}d${sides}.`,
        });
      }
    }
  }

  out.sort((a, b) => a.level - b.level);
  return out;
}

/** Automatické class features odemčené přesně na daném levelu. */
export function classProgressionAt(klass: ClassId, level: number): ClassFeatureMilestone[] {
  return classProgression(klass).filter((m) => m.level === level);
}
