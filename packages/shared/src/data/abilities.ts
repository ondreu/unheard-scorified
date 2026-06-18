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
import type { ClassId, SubclassId } from './classes';

/** Druh abilit — řídí log i mechaniku v enginu. */
export type AbilityKind = 'strike' | 'drain' | 'dot' | 'heal' | 'shield' | 'mitigation';

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
  /** Drain: podíl uděleného poškození, který útočníka vyléčí (navíc k lifestealu). */
  drainHealFraction?: number;
  /** Execute: pod tímto podílem HP cíle (0..1) se použije `executeDamageMult`. */
  executeBelowPct?: number;
  /** Execute: zvýšený damage multiplier proti cíli pod `executeBelowPct`. */
  executeDamageMult?: number;
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
}

/** Šablona katalogu (id se doplní z klíče). */
type AbilitySpec = Omit<SignatureAbility, 'id'>;

/** Ability classy/subclassy odemčená levelem. */
export interface BaselineAbility extends SignatureAbility {
  /** Minimální level, od kterého je ability dostupná. */
  unlockLevel: number;
}

interface BaselineOpts {
  dot?: { dotDurationSec: number; dotTicks: number; dotTickMult: number };
  drainHealFraction?: number;
  execute?: { executeBelowPct: number; executeDamageMult: number };
  mitigation?: { mitigationPct: number; mitigationDurationSec: number };
  /** D&D spell tier (0 = cantrip, 1..9 = kouzlo). Jen pro caster classy. */
  spellTier?: number;
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
    ...(opts.execute ?? {}),
    ...(opts.mitigation ?? {}),
    ...(opts.spellTier !== undefined ? { spellTier: opts.spellTier } : {}),
  };
}

// ── Class ability kit (D&D 5e flavor) — odemčeno levelem ─────────────────────
//
// Každá classa má základní sadu abilit/kouzel → rotace nikdy není prázdná.
// Subclass ability se přidává navrch (viz SUBCLASS_ABILITIES). Heal-kind využije
// jen healer role; offensive (strike/drain/dot) používá každý jako filler.

export const CLASS_BASELINE_ABILITIES: Record<ClassId, BaselineAbility[]> = {
  barbarian: [
    ba('barb_reckless_attack', 'Reckless Attack', 'Throws caution aside for a 120% weapon-damage blow.', 'strike', 4, 1.2, 1),
    ba('barb_rage_strike', 'Rage', 'Channels fury into a 160% weapon-damage smash.', 'strike', 6, 1.6, 5),
    ba('barb_brutal_strike', 'Brutal Strike', 'A crushing 180% blow, rising to 280% against foes below 30% health.', 'strike', 8, 1.8, 11, { execute: { executeBelowPct: 0.3, executeDamageMult: 2.8 } }),
  ],
  bard: [
    ba('bard_vicious_mockery', 'Vicious Mockery', 'Cutting insults sear the mind for 110% spell damage and 90% over 6s.', 'dot', 5, 1.1, 1, { dot: { dotDurationSec: 6, dotTicks: 3, dotTickMult: 0.3 }, spellTier: 0 }),
    ba('bard_healing_word', 'Healing Word', 'A word of power restores 200% of your healing power to a wounded ally.', 'heal', 5, 2.0, 1, { spellTier: 1 }),
    ba('bard_dissonant_whispers', 'Dissonant Whispers', 'Maddening whispers deal 175% spell damage.', 'strike', 7, 1.75, 9, { spellTier: 1 }),
  ],
  cleric: [
    ba('cleric_sacred_flame', 'Sacred Flame', 'Radiant flame descends for 150% spell damage.', 'strike', 5, 1.5, 1, { spellTier: 0 }),
    ba('cleric_cure_wounds', 'Cure Wounds', 'Channels divine power to heal an ally for 230% of your healing power.', 'heal', 6, 2.3, 1, { spellTier: 1 }),
    ba('cleric_guiding_bolt', 'Guiding Bolt', 'A bolt of light strikes for 210% spell damage.', 'strike', 7, 2.1, 8, { spellTier: 1 }),
    ba('cleric_spirit_guardians', 'Spirit Guardians', 'Spectral guardians harry the enemy for 120% damage over 9s.', 'dot', 8, 0.4, 14, { dot: { dotDurationSec: 9, dotTicks: 3, dotTickMult: 0.4 }, spellTier: 3 }),
  ],
  druid: [
    ba('druid_produce_flame', 'Produce Flame', 'Hurls a mote of fire for 150% spell damage.', 'strike', 5, 1.5, 1, { spellTier: 0 }),
    ba('druid_healing_word', 'Healing Word', 'Nature mends an ally for 220% of your healing power.', 'heal', 5, 2.2, 1, { spellTier: 1 }),
    ba('druid_moonbeam', 'Moonbeam', 'A beam of moonlight sears for 130% damage over 9s.', 'dot', 8, 0.5, 8, { dot: { dotDurationSec: 9, dotTicks: 3, dotTickMult: 0.45 }, spellTier: 2 }),
    ba('druid_call_lightning', 'Call Lightning', 'Summons a storm bolt for 190% spell damage.', 'strike', 7, 1.9, 14, { spellTier: 3 }),
  ],
  fighter: [
    ba('fighter_weapon_strike', 'Weapon Strike', 'A disciplined 115% weapon-damage strike.', 'strike', 4, 1.15, 1),
    ba('fighter_action_surge', 'Action Surge', 'A burst of speed unleashes a 170% weapon-damage flurry.', 'strike', 8, 1.7, 6),
    ba('fighter_trip_attack', 'Trip Attack', 'Sweeps the enemy for 140% damage and bleeds for 80% over 6s.', 'dot', 7, 0.5, 12, { dot: { dotDurationSec: 6, dotTicks: 3, dotTickMult: 0.27 } }),
    ba('fighter_execute', 'Killing Blow', 'A finisher for 180% weapon damage, rising to 270% against foes below 30% health.', 'strike', 8, 1.8, 20, { execute: { executeBelowPct: 0.3, executeDamageMult: 2.7 } }),
  ],
  monk: [
    ba('monk_martial_arts', 'Martial Arts', 'A swift unarmed strike for 120% weapon damage.', 'strike', 3, 1.2, 1),
    ba('monk_stunning_strike', 'Stunning Strike', 'A precise blow to a pressure point for 175% weapon damage.', 'strike', 7, 1.75, 5),
    ba('monk_quivering_palm', 'Quivering Palm', 'Lethal vibrations for 200% damage, rising to 300% against foes below 30% health.', 'strike', 9, 2.0, 11, { execute: { executeBelowPct: 0.3, executeDamageMult: 3.0 } }),
  ],
  paladin: [
    ba('paladin_divine_smite', 'Divine Smite', 'A radiant strike for 180% weapon damage.', 'strike', 5, 1.8, 1, { spellTier: 1 }),
    ba('paladin_lay_on_hands', 'Lay on Hands', 'Restores 220% of your healing power to a wounded ally.', 'heal', 6, 2.2, 1, { spellTier: 1 }),
    ba('paladin_searing_smite', 'Searing Smite', 'A flaming blow for 140% damage that burns for 100% over 8s.', 'dot', 8, 0.4, 12, { dot: { dotDurationSec: 8, dotTicks: 4, dotTickMult: 0.3 }, spellTier: 2 }),
    ba('paladin_flash_of_light', 'Flash of Light', 'A quick heal restoring 130% of your healing power.', 'heal', 4, 1.3, 20, { spellTier: 1 }),
  ],
  ranger: [
    ba('ranger_hunters_mark', "Hunter's Mark", 'A marked-prey shot for 155% weapon damage.', 'strike', 5, 1.55, 1, { spellTier: 1 }),
    ba('ranger_serpent_arrow', 'Serpent Arrow', 'A venomed arrow for 40% on impact and 125% over 10s.', 'dot', 9, 0.4, 6, { dot: { dotDurationSec: 10, dotTicks: 5, dotTickMult: 0.25 }, spellTier: 1 }),
    ba('ranger_volley', 'Volley', 'A rain of arrows dealing 185% weapon damage.', 'strike', 8, 1.85, 14, { spellTier: 2 }),
    ba('ranger_cure_wounds', 'Cure Wounds', 'Restores 170% of your healing power to a wounded ally.', 'heal', 6, 1.7, 9, { spellTier: 1 }),
  ],
  rogue: [
    ba('rogue_sneak_attack', 'Sneak Attack', 'A vital strike for 140% weapon damage, rising to 250% against foes below 35% health.', 'strike', 4, 1.4, 1, { execute: { executeBelowPct: 0.35, executeDamageMult: 2.5 } }),
    ba('rogue_poisoned_blade', 'Poisoned Blade', 'A coated blade for 45% on impact and 120% over 8s.', 'dot', 9, 0.45, 8, { dot: { dotDurationSec: 8, dotTicks: 4, dotTickMult: 0.3 } }),
    ba('rogue_assassinate', 'Assassinate', 'A killing strike for 200% weapon damage, rising to 320% against foes below 35% health.', 'strike', 8, 2.0, 14, { execute: { executeBelowPct: 0.35, executeDamageMult: 3.2 } }),
  ],
  sorcerer: [
    ba('sorc_fire_bolt', 'Fire Bolt', 'A mote of fire for 110% spell damage.', 'strike', 4, 1.1, 1, { spellTier: 0 }),
    ba('sorc_chromatic_orb', 'Chromatic Orb', 'An orb of elemental energy for 165% spell damage.', 'strike', 6, 1.65, 5, { spellTier: 1 }),
    ba('sorc_scorching_ray', 'Scorching Ray', 'Searing rays for 140% damage plus 90% over 6s.', 'dot', 8, 0.4, 9, { dot: { dotDurationSec: 6, dotTicks: 3, dotTickMult: 0.3 }, spellTier: 2 }),
    ba('sorc_fireball', 'Fireball', 'A roaring explosion for 220% spell damage.', 'strike', 9, 2.2, 14, { spellTier: 3 }),
  ],
  warlock: [
    ba('warlock_eldritch_blast', 'Eldritch Blast', 'A beam of crackling energy for 145% spell damage.', 'strike', 4, 1.45, 1, { spellTier: 0 }),
    ba('warlock_hex', 'Hex', 'A curse dealing 45% on impact and 130% over 12s.', 'dot', 9, 0.45, 6, { dot: { dotDurationSec: 12, dotTicks: 6, dotTickMult: 0.22 }, spellTier: 1 }),
    ba('warlock_drain_life', 'Drain Life', 'Drains 100% damage, healing you for 50% of the damage dealt.', 'drain', 6, 1.0, 10, { drainHealFraction: 0.5, spellTier: 3 }),
    ba('warlock_hunger_of_hadar', 'Hunger of Hadar', 'Void tendrils gnaw for 40% on impact and 110% over 8s.', 'dot', 9, 0.4, 20, { dot: { dotDurationSec: 8, dotTicks: 4, dotTickMult: 0.27 }, spellTier: 3 }),
  ],
  wizard: [
    ba('wiz_fire_bolt', 'Fire Bolt', 'A mote of fire for 105% spell damage.', 'strike', 4, 1.05, 1, { spellTier: 0 }),
    ba('wiz_magic_missile', 'Magic Missile', 'Unerring darts of force for 130% spell damage.', 'strike', 4, 1.3, 1, { spellTier: 1 }),
    ba('wiz_scorching_ray', 'Scorching Ray', 'Searing rays for 40% on impact and 75% over 6s.', 'dot', 8, 0.4, 8, { dot: { dotDurationSec: 6, dotTicks: 3, dotTickMult: 0.25 }, spellTier: 2 }),
    ba('wiz_fireball', 'Fireball', 'A roaring explosion for 230% spell damage.', 'strike', 9, 2.3, 14, { spellTier: 3 }),
  ],
};

// ── Subclass signature ability (1 per subclass v MVP) — odemčeno subclassLevel ─

export const SUBCLASS_ABILITIES: Record<SubclassId, BaselineAbility> = {
  path_of_the_berserker: ba('berserker_frenzy', 'Frenzy', 'Berserk fury strikes for 250% weapon damage.', 'strike', 8, 2.5, 3),
  college_of_lore: ba('lore_song_of_rest', 'Song of Rest', 'An inspiring melody heals an ally for 270% of your healing power.', 'heal', 8, 2.7, 3, { spellTier: 2 }),
  life_domain: ba('life_preserve_life', 'Preserve Life', 'Disciple of life surges a heal for 300% of your healing power.', 'heal', 8, 3.0, 1, { spellTier: 2 }),
  circle_of_the_moon: ba('moon_wild_shape', 'Wild Shape: Dire Bear', 'Transforms to maul for 240% weapon damage.', 'strike', 9, 2.4, 2),
  champion: ba('champion_heroic_surge', 'Heroic Surge', 'A champion strike for 230% weapon damage.', 'strike', 8, 2.3, 3),
  way_of_the_open_hand: ba('open_hand_flurry', 'Flurry of Blows', 'A blinding flurry for 260% weapon damage.', 'strike', 8, 2.6, 3),
  oath_of_devotion: ba('devotion_sacred_weapon', 'Sacred Weapon', 'A radiant strike for 240% weapon damage.', 'strike', 9, 2.4, 3, { spellTier: 1 }),
  hunter: ba('hunter_colossus_slayer', 'Colossus Slayer', 'A focused shot for 230% damage, rising to 320% against foes below 35% health.', 'strike', 9, 2.3, 3, { execute: { executeBelowPct: 0.35, executeDamageMult: 3.2 } }),
  thief: ba('thief_backstab', 'Backstab', 'A shadow strike for 230% weapon damage, rising to 320% against foes below 35% health.', 'strike', 9, 2.3, 3, { execute: { executeBelowPct: 0.35, executeDamageMult: 3.2 } }),
  draconic_bloodline: ba('draconic_elemental_burst', 'Elemental Burst', 'Draconic power erupts for 250% spell damage.', 'strike', 9, 2.5, 1, { spellTier: 2 }),
  the_fiend: ba('fiend_dark_ones_blessing', "Dark One's Own Luck", 'A fiendish blast for 230% damage, healing you for 20% of the damage dealt.', 'drain', 8, 2.3, 1, { drainHealFraction: 0.2, spellTier: 2 }),
  school_of_evocation: ba('evocation_overchannel', 'Overchannel', 'Overchanneled arcana for 270% spell damage.', 'strike', 10, 2.7, 2, { spellTier: 3 }),
};

/**
 * Draftovatelný pool „flashy" kouzel pro Gauntlet (M13) + combat-lookup. Není
 * vázán na class progresi — Gauntlet z něj náhodně nabízí „nové kouzlo" do runu.
 */
export const SIGNATURE_ABILITIES: Record<string, AbilitySpec> = {
  fireball: { name: 'Fireball', description: 'A roaring explosion for 250% spell damage.', kind: 'strike', cooldownSec: 10, damageMult: 2.5 },
  lightning_bolt: { name: 'Lightning Bolt', description: 'A line of lightning for 240% spell damage.', kind: 'strike', cooldownSec: 9, damageMult: 2.4 },
  ice_storm: { name: 'Ice Storm', description: 'Battering ice for 175% damage plus 120% over 6s.', kind: 'dot', cooldownSec: 10, damageMult: 1.75, dotDurationSec: 6, dotTicks: 3, dotTickMult: 0.4 },
  inflict_wounds: { name: 'Inflict Wounds', description: 'Necrotic touch for 200% damage, healing you for 25% of the damage dealt.', kind: 'drain', cooldownSec: 8, damageMult: 2.0, drainHealFraction: 0.25 },
  guiding_bolt: { name: 'Guiding Bolt', description: 'A bolt of light for 210% spell damage.', kind: 'strike', cooldownSec: 8, damageMult: 2.1 },
  spiritual_weapon: { name: 'Spiritual Weapon', description: 'A floating blade strikes for 185% damage.', kind: 'strike', cooldownSec: 7, damageMult: 1.85 },
  mass_healing_word: { name: 'Mass Healing Word', description: 'Restores 280% of your healing power to a wounded ally.', kind: 'heal', cooldownSec: 9, damageMult: 2.8 },
  flame_blade: { name: 'Flame Blade', description: 'A blade of fire for 200% weapon damage.', kind: 'strike', cooldownSec: 8, damageMult: 2.0 },
  vampiric_touch: { name: 'Vampiric Touch', description: 'Drains 160% damage, healing you for 40% of the damage dealt.', kind: 'drain', cooldownSec: 8, damageMult: 1.6, drainHealFraction: 0.4 },
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
 * Efektivní damage multiplier ability proti cíli s daným HP% (0..1). Aplikuje
 * **execute** bonus (víc poškození pod prahem HP cíle). Bez execute polí vrací
 * base `damageMult`.
 */
export function abilityDamageMult(ability: SignatureAbility, targetHpPct: number): number {
  if (ability.executeBelowPct != null && targetHpPct <= ability.executeBelowPct) {
    return ability.executeDamageMult ?? ability.damageMult;
  }
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
