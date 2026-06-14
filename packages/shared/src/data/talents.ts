/**
 * Talent stromy pro každou classu. 3 stromy po 5 nodech.
 * Efekty jsou hinty pro M5 combat engine; část přímých bonusů (staty) se aplikuje v M4.
 */
import type { ClassId } from './classes';

/** Efekt talentu — část jsou přímé stat bonusy, část combat tagy pro M5. */
export interface TalentEffect {
  /** Flat bonus k primárnímu statu za každý rank. */
  statPerRank?: Partial<Record<'strength' | 'agility' | 'stamina' | 'intellect' | 'spirit', number>>;
  /** Flat bonus k HP za každý rank. */
  healthPerRank?: number;
  /** Combat tagy pro engine v M5 (otevírá schopnosti / modifikuje rotaci). */
  combatTags?: string[];
}

/** Uzel v talent stromě. */
export interface TalentNode {
  id: string;
  name: string;
  description: string;
  /** Počet bodů v tomto stromě potřebný před tímto nodem. */
  tierRequirement: number;
  maxRanks: number;
  effect: TalentEffect;
}

export interface TalentTree {
  name: string;
  nodes: TalentNode[];
}

export type ClassTalents = [TalentTree, TalentTree, TalentTree];

function n(
  id: string, name: string, description: string,
  tierRequirement: number, maxRanks: number, effect: TalentEffect,
): TalentNode {
  return { id, name, description, tierRequirement, maxRanks, effect };
}

const WARRIOR_TALENTS: ClassTalents = [
  {
    name: 'Arms',
    nodes: [
      n('warrior.arms.weapon_expertise', 'Weapon Expertise', 'Increases weapon damage by 3% per rank.', 0, 5, { combatTags: ['weapon_expertise'] }),
      n('warrior.arms.tactical_mastery', 'Tactical Mastery', 'Increases Stamina by 1 per rank.', 0, 5, { statPerRank: { stamina: 1 } }),
      n('warrior.arms.improved_rend', 'Improved Rend', 'Increases bleed damage by 25% per rank.', 5, 3, { combatTags: ['improved_rend'] }),
      n('warrior.arms.deep_wounds', 'Deep Wounds', 'Your critical strikes cause the target to bleed for 20% of the damage per rank.', 10, 3, { combatTags: ['deep_wounds'] }),
      n('warrior.arms.mortal_strike', 'Mortal Strike', 'A powerful strike that wounds the target, reducing healing received by 50%.', 15, 1, { combatTags: ['mortal_strike'] }),
    ],
  },
  {
    name: 'Fury',
    nodes: [
      n('warrior.fury.cruelty', 'Cruelty', 'Increases critical strike chance by 1% per rank.', 0, 5, { combatTags: ['cruelty'] }),
      n('warrior.fury.dual_wield_spec', 'Dual Wield Specialization', 'Increases Agility by 1 per rank.', 0, 5, { statPerRank: { agility: 1 } }),
      n('warrior.fury.enrage', 'Enrage', 'After taking a critical hit, increases damage by 3% per rank for 10 seconds.', 5, 3, { combatTags: ['enrage'] }),
      n('warrior.fury.flurry', 'Flurry', 'After landing a critical strike, increases attack speed by 10% per rank for 3 attacks.', 10, 5, { combatTags: ['flurry'] }),
      n('warrior.fury.bloodthirst', 'Bloodthirst', 'Instantly attack for 45% of your Attack Power. Restores health equal to 10% damage dealt.', 15, 1, { combatTags: ['bloodthirst'] }),
    ],
  },
  {
    name: 'Protection',
    nodes: [
      n('warrior.prot.toughness', 'Toughness', 'Increases armor by 4% per rank and max health by 10 per rank.', 0, 5, { healthPerRank: 10, combatTags: ['toughness'] }),
      n('warrior.prot.shield_spec', 'Shield Specialization', 'Increases Stamina by 1 per rank.', 0, 5, { statPerRank: { stamina: 1 } }),
      n('warrior.prot.improved_blocking', 'Improved Blocking', 'Increases block value by 15% per rank.', 5, 3, { combatTags: ['improved_blocking'] }),
      n('warrior.prot.defiance', 'Defiance', 'Increases threat generation by 5% per rank.', 10, 5, { combatTags: ['defiance'] }),
      n('warrior.prot.last_stand', 'Last Stand', 'Temporarily increases max health by 30% for 20 seconds. Usable once per fight.', 15, 1, { healthPerRank: 50, combatTags: ['last_stand'] }),
    ],
  },
];

const PALADIN_TALENTS: ClassTalents = [
  {
    name: 'Holy',
    nodes: [
      n('paladin.holy.divine_strength', 'Divine Strength', 'Increases Strength by 1 per rank.', 0, 5, { statPerRank: { strength: 1 } }),
      n('paladin.holy.healing_light', 'Healing Light', 'Increases healing spells by 4% per rank.', 0, 5, { combatTags: ['healing_light'] }),
      n('paladin.holy.illumination', 'Illumination', 'After casting a critical healing spell, restores mana equal to the base cost.', 5, 3, { combatTags: ['illumination'] }),
      n('paladin.holy.divine_favor', 'Divine Favor', 'Your next heal is a guaranteed critical strike.', 10, 1, { combatTags: ['divine_favor'] }),
      n('paladin.holy.holy_light_mastery', 'Holy Light Mastery', 'Reduces cast time of Holy Light by 0.5s and increases its heal by 15%.', 15, 1, { combatTags: ['holy_light_mastery'] }),
    ],
  },
  {
    name: 'Protection',
    nodes: [
      n('paladin.prot.devotion', 'Devotion Aura Improvement', 'Increases armor from Devotion Aura by 8% per rank.', 0, 5, { combatTags: ['devotion_aura'] }),
      n('paladin.prot.toughness', 'Toughness', 'Increases armor by 3% per rank and max health by 8 per rank.', 0, 5, { healthPerRank: 8, combatTags: ['toughness'] }),
      n('paladin.prot.improved_hammer', 'Improved Hammer of Justice', 'Reduces cooldown of Hammer of Justice by 5s per rank.', 5, 3, { combatTags: ['improved_hoj'] }),
      n('paladin.prot.holy_shield', 'Holy Shield', 'Blocks the next 4 attacks and deals Holy damage equal to your block value.', 10, 1, { combatTags: ['holy_shield'] }),
      n('paladin.prot.divine_guardian', 'Divine Guardian', 'Reduces damage taken by the party by 10% for 6 seconds.', 15, 1, { combatTags: ['divine_guardian'] }),
    ],
  },
  {
    name: 'Retribution',
    nodes: [
      n('paladin.ret.benediction', 'Benediction', 'Reduces mana cost of Judgement by 3% per rank.', 0, 5, { combatTags: ['benediction'] }),
      n('paladin.ret.seal_of_command', 'Improved Seal of Command', 'Increases Agility by 1 per rank.', 0, 5, { statPerRank: { agility: 1 } }),
      n('paladin.ret.crusade', 'Crusade', 'Increases damage against Undead and Demons by 3% per rank.', 5, 3, { combatTags: ['crusade'] }),
      n('paladin.ret.vengeance', 'Vengeance', 'After landing a critical strike, increases your damage by 2% per rank for 8s.', 10, 5, { combatTags: ['vengeance'] }),
      n('paladin.ret.repentance', 'Repentance', 'Incapacitates the target for 6 seconds. Damage breaks the effect.', 15, 1, { combatTags: ['repentance'] }),
    ],
  },
];

const HUNTER_TALENTS: ClassTalents = [
  {
    name: 'Beast Mastery',
    nodes: [
      n('hunter.bm.improved_aspect', 'Improved Aspect of the Hawk', 'Increases Agility by 1 per rank.', 0, 5, { statPerRank: { agility: 1 } }),
      n('hunter.bm.endurance_training', 'Endurance Training', 'Increases Stamina by 1 per rank.', 0, 5, { statPerRank: { stamina: 1 } }),
      n('hunter.bm.unleashed_fury', 'Unleashed Fury', 'Increases pet damage by 4% per rank.', 5, 5, { combatTags: ['unleashed_fury'] }),
      n('hunter.bm.frenzy', 'Frenzy', 'After pet gets a kill, increases pet attack speed by 30% for 8s per rank.', 10, 5, { combatTags: ['frenzy'] }),
      n('hunter.bm.bestial_wrath', 'Bestial Wrath', 'Pet goes into a frenzy, increasing damage by 50% for 18s. Pet is immune to crowd control.', 15, 1, { combatTags: ['bestial_wrath'] }),
    ],
  },
  {
    name: 'Marksmanship',
    nodes: [
      n('hunter.mm.lethal_shots', 'Lethal Shots', 'Increases ranged critical strike chance by 1% per rank.', 0, 5, { combatTags: ['lethal_shots'] }),
      n('hunter.mm.efficiency', 'Efficiency', 'Reduces mana cost of shots by 2% per rank.', 0, 5, { combatTags: ['efficiency'] }),
      n('hunter.mm.aimed_shot', 'Improved Aimed Shot', 'Reduces cast time of Aimed Shot by 0.1s per rank.', 5, 3, { combatTags: ['improved_aimed_shot'] }),
      n('hunter.mm.trueshot_aura', 'Trueshot Aura', 'Increases attack power of party members by 5% per rank.', 10, 3, { combatTags: ['trueshot_aura'] }),
      n('hunter.mm.silencing_shot', 'Silencing Shot', 'Silences the target for 3 seconds, dealing weapon damage.', 15, 1, { combatTags: ['silencing_shot'] }),
    ],
  },
  {
    name: 'Survival',
    nodes: [
      n('hunter.surv.hawk_eye', 'Hawk Eye', 'Increases ranged attack range by 2 yards per rank.', 0, 3, { combatTags: ['hawk_eye'] }),
      n('hunter.surv.thick_hide', 'Thick Hide', 'Increases Stamina by 1 per rank.', 0, 5, { statPerRank: { stamina: 1 } }),
      n('hunter.surv.trap_mastery', 'Trap Mastery', 'Increases the duration of all traps by 10% per rank.', 5, 5, { combatTags: ['trap_mastery'] }),
      n('hunter.surv.expose_weakness', 'Expose Weakness', "Your ranged criticals increase target's physical damage taken by 2% per rank for 7s.", 10, 5, { combatTags: ['expose_weakness'] }),
      n('hunter.surv.wyvern_sting', 'Wyvern Sting', 'Puts the target to sleep for 12 seconds.', 15, 1, { combatTags: ['wyvern_sting'] }),
    ],
  },
];

const ROGUE_TALENTS: ClassTalents = [
  {
    name: 'Assassination',
    nodes: [
      n('rogue.ass.improved_eviscerate', 'Improved Eviscerate', 'Increases Eviscerate damage by 5% per rank.', 0, 3, { combatTags: ['improved_eviscerate'] }),
      n('rogue.ass.malice', 'Malice', 'Increases critical strike chance by 1% per rank.', 0, 5, { combatTags: ['malice'] }),
      n('rogue.ass.ruthlessness', 'Ruthlessness', '20% chance per rank to add a combo point after spending points.', 5, 3, { combatTags: ['ruthlessness'] }),
      n('rogue.ass.vile_poisons', 'Vile Poisons', 'Increases poison damage by 7% per rank.', 10, 5, { combatTags: ['vile_poisons'] }),
      n('rogue.ass.mutilate', 'Mutilate', 'Instant attack dealing 200% weapon damage. Awards 2 combo points.', 15, 1, { combatTags: ['mutilate'] }),
    ],
  },
  {
    name: 'Combat',
    nodes: [
      n('rogue.combat.improved_sinister', 'Improved Sinister Strike', 'Reduces energy cost of Sinister Strike by 3 per rank.', 0, 5, { combatTags: ['improved_sinister'] }),
      n('rogue.combat.dual_wield', 'Dual Wield Specialization', 'Increases Agility by 1 per rank.', 0, 5, { statPerRank: { agility: 1 } }),
      n('rogue.combat.sword_spec', 'Weapon Expertise', 'Increases attack power by 3% per rank.', 5, 5, { combatTags: ['weapon_expertise'] }),
      n('rogue.combat.adrenaline_rush', 'Adrenaline Rush', 'Doubles energy regeneration for 15 seconds.', 10, 1, { combatTags: ['adrenaline_rush'] }),
      n('rogue.combat.blade_flurry', 'Blade Flurry', 'Increases attack speed by 20% and hits an additional target for 40% damage.', 15, 1, { combatTags: ['blade_flurry'] }),
    ],
  },
  {
    name: 'Subtlety',
    nodes: [
      n('rogue.sub.master_of_deception', 'Master of Deception', 'Reduces stealth detection range against you by 5% per rank.', 0, 5, { combatTags: ['master_of_deception'] }),
      n('rogue.sub.opportunity', 'Opportunity', 'Increases damage of Backstab by 4% per rank.', 0, 5, { combatTags: ['opportunity'] }),
      n('rogue.sub.improved_sap', 'Dirty Tricks', 'Increases Stamina by 1 per rank.', 5, 5, { statPerRank: { stamina: 1 } }),
      n('rogue.sub.hemorrhage', 'Hemorrhage', 'Strikes the target for 115% weapon damage and causes target to bleed for 10s.', 10, 1, { combatTags: ['hemorrhage'] }),
      n('rogue.sub.shadowstep', 'Shadowstep', 'Teleport behind the target and increase damage of next ability by 20%.', 15, 1, { combatTags: ['shadowstep'] }),
    ],
  },
];

const PRIEST_TALENTS: ClassTalents = [
  {
    name: 'Discipline',
    nodes: [
      n('priest.disc.wand_spec', 'Wand Specialization', 'Increases Spirit by 1 per rank.', 0, 5, { statPerRank: { spirit: 1 } }),
      n('priest.disc.inner_focus', 'Inner Focus', 'When cast, makes next spell free and increases its critical chance by 25%.', 0, 1, { combatTags: ['inner_focus'] }),
      n('priest.disc.meditation', 'Meditation', 'Allows 5% per rank of mana regeneration to continue while casting.', 5, 5, { combatTags: ['meditation'] }),
      n('priest.disc.power_infusion', 'Power Infusion', 'Infuse the target with power, increasing spell power by 20% for 15s.', 10, 1, { combatTags: ['power_infusion'] }),
      n('priest.disc.pain_suppression', 'Pain Suppression', 'Instantly reduces threat, then reduces damage taken by 40% for 8s.', 15, 1, { combatTags: ['pain_suppression'] }),
    ],
  },
  {
    name: 'Holy',
    nodes: [
      n('priest.holy.healing_focus', 'Healing Focus', "Increases the chance spells won't be interrupted by damage by 14% per rank.", 0, 5, { combatTags: ['healing_focus'] }),
      n('priest.holy.improved_renew', 'Improved Renew', 'Increases the amount healed by Renew by 5% per rank.', 0, 5, { combatTags: ['improved_renew'] }),
      n('priest.holy.divine_spirit', 'Divine Spirit', 'Increases Spirit by 2 per rank.', 5, 5, { statPerRank: { spirit: 2 } }),
      n('priest.holy.circle_of_healing', 'Circle of Healing', 'Heals 3 nearby party members for a moderate amount.', 10, 1, { combatTags: ['circle_of_healing'] }),
      n('priest.holy.lightwell', 'Lightwell', 'Creates a Lightwell that party members can click to heal themselves.', 15, 1, { combatTags: ['lightwell'] }),
    ],
  },
  {
    name: 'Shadow',
    nodes: [
      n('priest.shadow.spirit_tap', 'Spirit Tap', 'After killing a target, restores 83% of total mana over 15s per rank.', 0, 5, { combatTags: ['spirit_tap'] }),
      n('priest.shadow.shadow_affinity', 'Shadow Affinity', 'Reduces the threat generated by Shadow spells by 8% per rank.', 0, 5, { combatTags: ['shadow_affinity'] }),
      n('priest.shadow.shadow_weaving', 'Shadow Weaving', 'Shadow spells have a 4% chance per rank to increase Shadow damage taken by 15%.', 5, 5, { combatTags: ['shadow_weaving'] }),
      n('priest.shadow.vampiric_embrace', 'Vampiric Embrace', 'Shadow damage heals you for 15% and party members for 3% of damage dealt.', 10, 1, { combatTags: ['vampiric_embrace'] }),
      n('priest.shadow.shadow_form', 'Shadowform', 'Assume a Shadowform, reducing physical damage taken by 15% and increasing Shadow damage by 15%.', 15, 1, { combatTags: ['shadowform'] }),
    ],
  },
];

const SHAMAN_TALENTS: ClassTalents = [
  {
    name: 'Elemental',
    nodes: [
      n('shaman.ele.convection', 'Convection', 'Reduces mana cost of shock spells by 2% per rank.', 0, 5, { combatTags: ['convection'] }),
      n('shaman.ele.concussion', 'Concussion', 'Increases damage of lightning spells by 1% per rank.', 0, 5, { combatTags: ['concussion'] }),
      n('shaman.ele.lightning_mastery', 'Lightning Mastery', 'Reduces cast time of lightning spells by 0.1s per rank.', 5, 5, { combatTags: ['lightning_mastery'] }),
      n('shaman.ele.elemental_mastery', 'Elemental Mastery', 'Next spell is free and guaranteed to critically strike.', 10, 1, { combatTags: ['elemental_mastery'] }),
      n('shaman.ele.thunderstorm', 'Thunderstorm', 'Calls down a bolt of lightning, damaging and knocking back nearby enemies.', 15, 1, { combatTags: ['thunderstorm'] }),
    ],
  },
  {
    name: 'Enhancement',
    nodes: [
      n('shaman.enh.ancestral_knowledge', 'Ancestral Knowledge', 'Increases Intellect by 1 per rank.', 0, 5, { statPerRank: { intellect: 1 } }),
      n('shaman.enh.shield_spec', 'Shield Specialization', 'Increases Stamina by 1 per rank.', 0, 5, { statPerRank: { stamina: 1 } }),
      n('shaman.enh.flurry', 'Flurry', 'After landing a critical strike, increases attack speed by 10% per rank for 3 swings.', 5, 5, { combatTags: ['flurry'] }),
      n('shaman.enh.dual_wield', 'Dual Wield', 'Allows you to dual wield one-handed weapons.', 10, 1, { combatTags: ['dual_wield'] }),
      n('shaman.enh.stormstrike', 'Stormstrike', 'Instant melee attack dealing weapon damage twice. Target takes 20% more Nature damage for 12s.', 15, 1, { combatTags: ['stormstrike'] }),
    ],
  },
  {
    name: 'Restoration',
    nodes: [
      n('shaman.resto.tidal_focus', 'Tidal Focus', 'Reduces mana cost of healing spells by 1% per rank.', 0, 5, { combatTags: ['tidal_focus'] }),
      n('shaman.resto.improved_healing_wave', 'Improved Healing Wave', 'Reduces cast time of Healing Wave by 0.1s per rank.', 0, 5, { combatTags: ['improved_healing_wave'] }),
      n('shaman.resto.totemic_focus', 'Totemic Focus', 'Reduces mana cost of totems by 5% per rank.', 5, 5, { combatTags: ['totemic_focus'] }),
      n('shaman.resto.nature_swiftness', "Nature's Swiftness", 'Next Nature spell becomes instant cast.', 10, 1, { combatTags: ['natures_swiftness'] }),
      n('shaman.resto.chain_heal', 'Improved Chain Heal', 'Increases Chain Heal effectiveness by 5% per rank.', 15, 5, { combatTags: ['improved_chain_heal'] }),
    ],
  },
];

const MAGE_TALENTS: ClassTalents = [
  {
    name: 'Arcane',
    nodes: [
      n('mage.arcane.arcane_subtlety', 'Arcane Subtlety', 'Reduces spell threat by 4% per rank.', 0, 5, { combatTags: ['arcane_subtlety'] }),
      n('mage.arcane.arcane_focus', 'Arcane Focus', 'Increases Intellect by 1 per rank.', 0, 5, { statPerRank: { intellect: 1 } }),
      n('mage.arcane.arcane_concentration', 'Arcane Concentration', '1% chance per rank to enter Clearcasting after spell damage.', 5, 5, { combatTags: ['arcane_concentration'] }),
      n('mage.arcane.presence_of_mind', 'Presence of Mind', 'Next spell is instant cast.', 10, 1, { combatTags: ['presence_of_mind'] }),
      n('mage.arcane.arcane_power', 'Arcane Power', 'Increases damage by 30% but costs 30% more mana for 15s.', 15, 1, { combatTags: ['arcane_power'] }),
    ],
  },
  {
    name: 'Fire',
    nodes: [
      n('mage.fire.improved_fireball', 'Improved Fireball', 'Reduces cast time of Fireball by 0.1s per rank.', 0, 5, { combatTags: ['improved_fireball'] }),
      n('mage.fire.incinerate', 'Incinerate', 'Increases Fire spell critical strike chance by 1% per rank.', 0, 5, { combatTags: ['incinerate'] }),
      n('mage.fire.ignite', 'Ignite', 'When your spells critically strike, the target burns for 8% of the spell damage per rank over 4s.', 5, 5, { combatTags: ['ignite'] }),
      n('mage.fire.combustion', 'Combustion', 'Next Fire spell is guaranteed crit. Each Fire crit charges combustion further.', 10, 1, { combatTags: ['combustion'] }),
      n('mage.fire.pyroblast', 'Pyroblast Mastery', 'Reduces cast time of Pyroblast by 0.5s and increases its damage by 15%.', 15, 1, { combatTags: ['pyroblast_mastery'] }),
    ],
  },
  {
    name: 'Frost',
    nodes: [
      n('mage.frost.improved_frostbolt', 'Improved Frostbolt', 'Reduces cast time of Frostbolt by 0.1s per rank.', 0, 5, { combatTags: ['improved_frostbolt'] }),
      n('mage.frost.ice_shards', 'Ice Shards', 'Increases critical strike damage bonus of Frost spells by 20% per rank.', 0, 5, { combatTags: ['ice_shards'] }),
      n('mage.frost.shatter', 'Shatter', 'Increases critical strike chance against frozen targets by 10% per rank.', 5, 5, { combatTags: ['shatter'] }),
      n('mage.frost.ice_barrier', 'Ice Barrier', 'Absorbs damage. While active, spells are not interrupted by damage.', 10, 1, { combatTags: ['ice_barrier'] }),
      n('mage.frost.cold_snap', 'Cold Snap', 'Resets cooldown of all Frost spells.', 15, 1, { combatTags: ['cold_snap'] }),
    ],
  },
];

const WARLOCK_TALENTS: ClassTalents = [
  {
    name: 'Affliction',
    nodes: [
      n('warlock.aff.suppression', 'Suppression', 'Increases spell hit chance by 1% per rank.', 0, 5, { combatTags: ['suppression'] }),
      n('warlock.aff.improved_corruption', 'Improved Corruption', 'Reduces cast time of Corruption by 0.2s per rank.', 0, 5, { combatTags: ['improved_corruption'] }),
      n('warlock.aff.shadow_mastery', 'Shadow Mastery', 'Increases Shadow damage by 2% per rank.', 5, 5, { combatTags: ['shadow_mastery'] }),
      n('warlock.aff.unstable_affliction', 'Unstable Affliction', 'Inflicts a shadow curse that deals heavy damage if dispelled.', 10, 1, { combatTags: ['unstable_affliction'] }),
      n('warlock.aff.contagion', 'Contagion', 'Reduces chance your DoTs are dispelled by 6% per rank and increases DoT damage by 1%.', 15, 5, { combatTags: ['contagion'] }),
    ],
  },
  {
    name: 'Demonology',
    nodes: [
      n('warlock.demo.improved_imp', 'Improved Imp', 'Increases Intellect by 1 per rank.', 0, 5, { statPerRank: { intellect: 1 } }),
      n('warlock.demo.demonic_embrace', 'Demonic Embrace', 'Increases Stamina by 1 per rank.', 0, 5, { statPerRank: { stamina: 1 } }),
      n('warlock.demo.master_summoner', 'Master Summoner', 'Reduces casting time of summoning spells by 2s per rank.', 5, 3, { combatTags: ['master_summoner'] }),
      n('warlock.demo.demonic_sacrifice', 'Demonic Sacrifice', 'Sacrifice your demon pet for a powerful buff depending on its type.', 10, 1, { combatTags: ['demonic_sacrifice'] }),
      n('warlock.demo.demonic_empowerment', 'Demonic Empowerment', 'Empowers your current demon with a unique ability.', 15, 1, { combatTags: ['demonic_empowerment'] }),
    ],
  },
  {
    name: 'Destruction',
    nodes: [
      n('warlock.dest.improved_shadow_bolt', 'Improved Shadow Bolt', 'Reduces cast time of Shadow Bolt by 0.1s per rank.', 0, 5, { combatTags: ['improved_shadow_bolt'] }),
      n('warlock.dest.bane', 'Bane', 'Reduces cast time of Shadow Bolt and Immolate by 0.1s per rank.', 0, 5, { combatTags: ['bane'] }),
      n('warlock.dest.devastation', 'Devastation', 'Increases critical strike chance of destruction spells by 1% per rank.', 5, 5, { combatTags: ['devastation'] }),
      n('warlock.dest.conflagrate', 'Conflagrate', 'Ignites a target already affected by your Immolate, dealing heavy instant damage.', 10, 1, { combatTags: ['conflagrate'] }),
      n('warlock.dest.chaos_bolt', 'Chaos Bolt', 'Sends a bolt of chaos at the enemy. Cannot be absorbed or resisted.', 15, 1, { combatTags: ['chaos_bolt'] }),
    ],
  },
];

const DRUID_TALENTS: ClassTalents = [
  {
    name: 'Balance',
    nodes: [
      n('druid.bal.improved_wrath', 'Improved Wrath', 'Reduces cast time of Wrath by 0.1s per rank.', 0, 5, { combatTags: ['improved_wrath'] }),
      n('druid.bal.nature_grasp', 'Focused Starfire', 'Increases Intellect by 1 per rank.', 0, 5, { statPerRank: { intellect: 1 } }),
      n('druid.bal.moonfire_mastery', 'Moonfire Mastery', 'Increases Moonfire damage by 5% per rank.', 5, 5, { combatTags: ['moonfire_mastery'] }),
      n('druid.bal.starfall', 'Starfall', 'Calls down 10 bolts of starlight dealing Arcane damage to enemies.', 10, 1, { combatTags: ['starfall'] }),
      n('druid.bal.typhoon', 'Typhoon', 'Summons a violent wind storm, damaging and knocking back nearby enemies.', 15, 1, { combatTags: ['typhoon'] }),
    ],
  },
  {
    name: 'Feral',
    nodes: [
      n('druid.feral.ferocity', 'Ferocity', 'Reduces energy cost of Maul, Swipe, Claw and Rake by 1 per rank.', 0, 5, { combatTags: ['ferocity'] }),
      n('druid.feral.thick_hide', 'Thick Hide', 'Increases Stamina by 1 per rank.', 0, 5, { statPerRank: { stamina: 1 } }),
      n('druid.feral.primal_fury', 'Primal Fury', 'Gives 25% per rank chance to gain an extra combo point on a critical strike.', 5, 5, { combatTags: ['primal_fury'] }),
      n('druid.feral.mangle', 'Mangle', 'Mangle the target, dealing weapon damage and increasing bleed effects by 30%.', 10, 1, { combatTags: ['mangle'] }),
      n('druid.feral.berserk', 'Berserk', 'Reduces energy cost of all attacks by 50% and makes Mangle hit 3 targets for 15s.', 15, 1, { combatTags: ['berserk'] }),
    ],
  },
  {
    name: 'Restoration',
    nodes: [
      n('druid.resto.imp_rejuvenation', 'Improved Rejuvenation', 'Increases healing of Rejuvenation by 5% per rank.', 0, 5, { combatTags: ['improved_rejuvenation'] }),
      n('druid.resto.nature_focus', "Nature's Focus", 'Increases Spirit by 1 per rank.', 0, 5, { statPerRank: { spirit: 1 } }),
      n('druid.resto.tranquil_spirit', 'Tranquil Spirit', 'Reduces mana cost of Healing Touch by 2% per rank.', 5, 5, { combatTags: ['tranquil_spirit'] }),
      n('druid.resto.natures_swiftness', "Nature's Swiftness", 'Next Nature spell is instant cast.', 10, 1, { combatTags: ['natures_swiftness'] }),
      n('druid.resto.tree_of_life', 'Tree of Life', 'Transform into Tree of Life, increasing healing by 15% and enabling Lifebloom.', 15, 1, { combatTags: ['tree_of_life'] }),
    ],
  },
];

export const CLASS_TALENTS: Record<ClassId, ClassTalents> = {
  warrior: WARRIOR_TALENTS,
  paladin: PALADIN_TALENTS,
  hunter: HUNTER_TALENTS,
  rogue: ROGUE_TALENTS,
  priest: PRIEST_TALENTS,
  shaman: SHAMAN_TALENTS,
  mage: MAGE_TALENTS,
  warlock: WARLOCK_TALENTS,
  druid: DRUID_TALENTS,
};

/** Celkový počet dostupných talent bodů pro daný level (lvl 1 = 0 bodů). */
export function talentPointsForLevel(level: number): number {
  return Math.max(0, level - 1);
}

/** Získá TalentNode pro dané talentId. Vrátí undefined, pokud neexistuje. */
export function getTalentNode(classId: ClassId, talentId: string): TalentNode | undefined {
  const trees = CLASS_TALENTS[classId];
  for (const tree of trees) {
    const node = tree.nodes.find((n) => n.id === talentId);
    if (node) return node;
  }
  return undefined;
}

/** Spočítá počet bodů použitých v daném stromě (pro tierRequirement). */
export function pointsInTree(
  talentAllocations: Record<string, number>,
  classId: ClassId,
  treeIndex: number,
): number {
  const tree = CLASS_TALENTS[classId][treeIndex as 0 | 1 | 2];
  if (!tree) return 0;
  return tree.nodes.reduce((sum, node) => sum + (talentAllocations[node.id] ?? 0), 0);
}
