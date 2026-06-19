/**
 * Class-feature volby (Level-up overhaul Slice B2, ADR 0040). Vedle ASI/Feat a
 * subclass dostávají některé classy na konkrétních levelech **volbu class feature**:
 *  - **Fighting Style** (Fighter L1, Paladin/Ranger L2) — 1 volba.
 *  - **Metamagic** (Sorcerer) — víc voleb, škáluje levelem.
 *  - **Eldritch Invocations** (Warlock) — víc voleb, škáluje levelem.
 *  - **Battle Master manévry** (Fighter, vyžaduje subclass `battle_master`) — víc voleb.
 *
 * Model: každá *skupina* (`ClassFeatureGroup`) má rozvrh (`schedule`) říkající, kolik
 * voleb je odemčeno na daném levelu (kumulativně). Každá volba = **1 slot** (jako
 * subclass/ASI) → recykluje persistenci `character_levelup_choices` (slot id
 * `cf:<groupId>#<index>`), bez DB migrace. Efekty voleb (`ClassFeatureOption.effect`)
 * jsou stejného tvaru jako featy (`FeatEffect`) → mapují se na engine combat-tagy
 * (`COMBAT_TAG_EFFECTS`/`SHIELD_TAGS`), žádný nový kód v enginu.
 *
 * Čistá data + pure helpery (sdílené API↔web).
 */
import type { ClassId, SubclassId } from './classes';
import type { FeatEffect } from './feats';

/** Jedna volitelná class feature (Fighting Style / Metamagic / …). */
export interface ClassFeatureOption {
  id: string;
  name: string;
  description: string;
  /** Efekt na postavu (stejný tvar jako feat → engine combat-tagy). */
  effect: FeatEffect;
}

/** Skupina class-feature voleb dané třídy s rozvrhem počtu voleb dle levelu. */
export interface ClassFeatureGroup {
  /** Stabilní id skupiny (globálně unikátní). */
  id: string;
  klass: ClassId;
  name: string;
  description: string;
  /**
   * Kumulativní počet voleb dostupný na daném levelu (sorted ascending).
   * Např. `[{level:3,count:2},{level:10,count:3}]` = 2 volby od lvl 3, 3. od lvl 10.
   */
  schedule: { level: number; count: number }[];
  /** Vyžaduje zvolenou subclass (Battle Master manévry → `battle_master`). */
  requiresSubclass?: SubclassId;
  options: ClassFeatureOption[];
}

// ── Sdílené sady voleb ───────────────────────────────────────────────────────

const FIGHTING_STYLES: Record<string, ClassFeatureOption> = {
  archery: { id: 'archery', name: 'Archery', description: 'A keen eye for ranged attacks. +Crit.', effect: { combatTags: [{ tag: 'crit_minor', ranks: 3 }] } },
  defense: { id: 'defense', name: 'Defense', description: 'A disciplined guard turns aside blows. Absorb shield.', effect: { combatTags: [{ tag: 'shield_minor', ranks: 2 }] } },
  dueling: { id: 'dueling', name: 'Dueling', description: 'A single blade wielded with focus. +Damage.', effect: { combatTags: [{ tag: 'dmg_minor', ranks: 2 }] } },
  great_weapon: { id: 'great_weapon', name: 'Great Weapon Fighting', description: 'Reroll the weakest blows of a two-handed weapon. +Damage.', effect: { combatTags: [{ tag: 'dmg_minor', ranks: 2 }] } },
  two_weapon: { id: 'two_weapon', name: 'Two-Weapon Fighting', description: 'A blade in each hand strikes more often. +Attack speed.', effect: { combatTags: [{ tag: 'haste_minor', ranks: 2 }] } },
};

const fs = (...ids: (keyof typeof FIGHTING_STYLES)[]): ClassFeatureOption[] =>
  ids.map((id) => FIGHTING_STYLES[id]!);

export const CLASS_FEATURE_GROUPS: ClassFeatureGroup[] = [
  // ── Fighting Style ─────────────────────────────────────────────────────────
  {
    id: 'fighter_fighting_style',
    klass: 'fighter',
    name: 'Fighting Style',
    description: 'Adopt a martial specialization that shapes how you fight.',
    schedule: [{ level: 1, count: 1 }],
    options: fs('archery', 'defense', 'dueling', 'great_weapon', 'two_weapon'),
  },
  {
    id: 'paladin_fighting_style',
    klass: 'paladin',
    name: 'Fighting Style',
    description: 'Adopt a martial specialization that shapes how you fight.',
    schedule: [{ level: 2, count: 1 }],
    options: fs('defense', 'dueling', 'great_weapon'),
  },
  {
    id: 'ranger_fighting_style',
    klass: 'ranger',
    name: 'Fighting Style',
    description: 'Adopt a martial specialization that shapes how you fight.',
    schedule: [{ level: 2, count: 1 }],
    options: fs('archery', 'defense', 'dueling', 'two_weapon'),
  },

  // ── Metamagic (Sorcerer) ─────────────────────────────────────────────────
  {
    id: 'sorcerer_metamagic',
    klass: 'sorcerer',
    name: 'Metamagic',
    description: 'Bend your spells with sorcerous tricks. Choose Metamagic options.',
    schedule: [
      { level: 3, count: 2 },
      { level: 10, count: 3 },
      { level: 17, count: 4 },
    ],
    options: [
      { id: 'empowered', name: 'Empowered Spell', description: 'Reroll weak damage dice. +Damage.', effect: { combatTags: [{ tag: 'dmg_minor', ranks: 3 }] } },
      { id: 'quickened', name: 'Quickened Spell', description: 'Cast as a bonus action. +Attack speed.', effect: { combatTags: [{ tag: 'haste_minor', ranks: 3 }] } },
      { id: 'heightened', name: 'Heightened Spell', description: 'Foes struggle to resist. +Crit.', effect: { combatTags: [{ tag: 'crit_minor', ranks: 3 }] } },
      { id: 'careful', name: 'Careful Spell', description: 'Shield yourself from your own magic. Absorb shield.', effect: { combatTags: [{ tag: 'shield_minor', ranks: 2 }] } },
      { id: 'distant', name: 'Distant Spell', description: 'Extend your reach for steadier hits. +Damage.', effect: { combatTags: [{ tag: 'dmg_minor', ranks: 2 }] } },
      { id: 'twinned', name: 'Twinned Spell', description: 'Strike two targets at once. +Damage.', effect: { combatTags: [{ tag: 'dmg_minor', ranks: 2 }] } },
    ],
  },

  // ── Eldritch Invocations (Warlock) ───────────────────────────────────────
  {
    id: 'warlock_invocations',
    klass: 'warlock',
    name: 'Eldritch Invocations',
    description: 'Fragments of forbidden lore that reshape your eldritch power.',
    schedule: [
      { level: 2, count: 2 },
      { level: 5, count: 3 },
      { level: 9, count: 4 },
      { level: 12, count: 5 },
      { level: 15, count: 6 },
      { level: 18, count: 7 },
    ],
    options: [
      { id: 'agonizing_blast', name: 'Agonizing Blast', description: 'Add your patron’s fury to every blast. +Damage.', effect: { combatTags: [{ tag: 'dmg_major', ranks: 3 }] } },
      { id: 'repelling_blast', name: 'Repelling Blast', description: 'Hurl foes back with each blast. +Damage.', effect: { combatTags: [{ tag: 'dmg_minor', ranks: 2 }] } },
      { id: 'armor_of_shadows', name: 'Armor of Shadows', description: 'Wreathe yourself in spectral armor. Absorb shield.', effect: { combatTags: [{ tag: 'shield_minor', ranks: 2 }] } },
      { id: 'fiendish_vigor', name: 'Fiendish Vigor', description: 'False life bolsters your vitality. +Health.', effect: { healthBonus: 20, combatTags: [{ tag: 'hp_minor', ranks: 3 }] } },
      { id: 'thirsting_blade', name: 'Thirsting Blade', description: 'Strike twice with your pact weapon. +Attack speed.', effect: { combatTags: [{ tag: 'haste_minor', ranks: 3 }] } },
      { id: 'lifedrinker', name: 'Lifedrinker', description: 'Your pact weapon drinks life. Lifesteal.', effect: { combatTags: [{ tag: 'lifesteal_minor', ranks: 3 }] } },
      { id: 'eldritch_mind', name: 'Eldritch Mind', description: 'Unshakable focus sharpens your aim. +Crit.', effect: { combatTags: [{ tag: 'crit_minor', ranks: 2 }] } },
    ],
  },

  // ── Battle Master manévry (Fighter, subclass-gated) ──────────────────────
  {
    id: 'fighter_maneuvers',
    klass: 'fighter',
    name: 'Combat Maneuvers',
    description: 'Battle Master superiority dice fuel a repertoire of maneuvers.',
    requiresSubclass: 'battle_master',
    schedule: [
      { level: 3, count: 3 },
      { level: 7, count: 4 },
      { level: 10, count: 5 },
      { level: 15, count: 6 },
    ],
    options: [
      { id: 'trip_attack', name: 'Trip Attack', description: 'Knock a foe prone, opening them up. +Damage.', effect: { combatTags: [{ tag: 'dmg_minor', ranks: 2 }] } },
      { id: 'riposte', name: 'Riposte', description: 'Counter a missed attack with your own. Absorb shield.', effect: { combatTags: [{ tag: 'shield_minor', ranks: 2 }] } },
      { id: 'precision_attack', name: 'Precision Attack', description: 'Add a superiority die to your aim. +Crit.', effect: { combatTags: [{ tag: 'crit_minor', ranks: 3 }] } },
      { id: 'menacing_attack', name: 'Menacing Attack', description: 'A frightening blow rattles your foe. +Damage.', effect: { combatTags: [{ tag: 'dmg_minor', ranks: 2 }] } },
      { id: 'disarming_attack', name: 'Disarming Attack', description: 'Strike to disarm and disrupt. +Damage.', effect: { combatTags: [{ tag: 'dmg_minor', ranks: 2 }] } },
      { id: 'rally', name: 'Rally', description: 'A rallying cry bolsters your resolve. +Health.', effect: { combatTags: [{ tag: 'hp_minor', ranks: 3 }] } },
      { id: 'sweeping_attack', name: 'Sweeping Attack', description: 'A wide swing catches a second foe. +Damage.', effect: { combatTags: [{ tag: 'dmg_minor', ranks: 2 }] } },
    ],
  },
];

const GROUP_BY_ID = new Map(CLASS_FEATURE_GROUPS.map((g) => [g.id, g]));

/** Skupina dle id. */
export function findFeatureGroup(groupId: string): ClassFeatureGroup | undefined {
  return GROUP_BY_ID.get(groupId);
}

/** Volba dle skupiny + id. */
export function findFeatureOption(
  groupId: string,
  optionId: string,
): ClassFeatureOption | undefined {
  return findFeatureGroup(groupId)?.options.find((o) => o.id === optionId);
}

/**
 * Skupiny class-feature voleb dostupné dané class na daném levelu. `subclass` se
 * předává kvůli skupinám gated subclassem (Battle Master manévry); když není
 * zvolená, subclass-gated skupina se nenabízí.
 */
export function featureGroupsForClass(
  klass: ClassId,
  subclass?: SubclassId | null,
): ClassFeatureGroup[] {
  return CLASS_FEATURE_GROUPS.filter(
    (g) =>
      g.klass === klass &&
      (g.requiresSubclass === undefined || g.requiresSubclass === subclass),
  );
}

/** Kolik voleb skupiny je odemčeno na daném levelu (kumulativně). */
export function featureChoiceCount(group: ClassFeatureGroup, level: number): number {
  let count = 0;
  for (const step of group.schedule) {
    if (level >= step.level) count = step.count;
  }
  return count;
}

/** Level, na kterém se odemyká `index`-tá (1-based) volba skupiny (0 = neodemčeno). */
export function featureSlotUnlockLevel(group: ClassFeatureGroup, index: number): number {
  for (const step of group.schedule) {
    if (index <= step.count) return step.level;
  }
  return 0;
}

/** Slot id pro `index`-tou volbu skupiny. */
export function featureSlotId(groupId: string, index: number): string {
  return `cf:${groupId}#${index}`;
}

/** Popis jednoho class-feature slotu (před expanzí na LevelUpSlot). */
export interface ClassFeatureSlot {
  groupId: string;
  index: number;
  level: number;
}

/**
 * Class-feature sloty, na které má postava dané class/levelu (a subclassu) nárok.
 * Každá odemčená volba = vlastní slot.
 */
export function classFeatureSlotsFor(
  klass: ClassId,
  level: number,
  subclass?: SubclassId | null,
): ClassFeatureSlot[] {
  const slots: ClassFeatureSlot[] = [];
  for (const group of featureGroupsForClass(klass, subclass)) {
    const count = featureChoiceCount(group, level);
    for (let index = 1; index <= count; index++) {
      slots.push({ groupId: group.id, index, level: featureSlotUnlockLevel(group, index) });
    }
  }
  return slots;
}
