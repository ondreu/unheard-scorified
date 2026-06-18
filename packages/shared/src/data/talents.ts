/**
 * Talent stromy pro každou classu (overhaul). Filozofie 3 stromů zachována;
 * **kapacita každého stromu ≈ 34 bodů** (9 nodů). Na level cap 60 má hráč 59
 * bodů (`talentPointsForLevel`), takže **nelze naplnit vše** — 59 / 34 ≈ **1 a
 * 3/4 stromu** (záměr PM). Mix: filler (staty/HP), „zábavné" pasivní procy
 * (crit/dmg/haste/lifesteal/štít) a **capstone = nový spell** (req 28) napojený na
 * combat engine přes `combatTags` → `@game/shared/data/abilities`.
 *
 * Efekty: `statPerRank`/`healthPerRank` (M4) + `combatTags` (M5 engine — pasivní
 * efekt z `COMBAT_TAG_EFFECTS`/`SHIELD_TAGS`, nebo ability z `SIGNATURE_ABILITIES`).
 */
import type { AbilityScore } from '../character';
import type { ClassId } from './classes';

/** Efekt talentu — část jsou přímé stat bonusy, část combat tagy pro M5. */
export interface TalentEffect {
  /** Flat bonus k atributu za každý rank. */
  statPerRank?: Partial<Record<AbilityScore, number>>;
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

// ── Sdílené efekt shortcuts (sníží boilerplate) ──────────────────────────────
const STAT = (s: keyof NonNullable<TalentEffect['statPerRank']>): TalentEffect => ({ statPerRank: { [s]: 1 } });
const TAG = (t: string): TalentEffect => ({ combatTags: [t] });
const D = {
  crit: 'Increases critical strike chance by 1% per rank.',
  dmg1: 'Increases damage by 1% per rank.',
  dmg2: 'Increases damage by 2% per rank.',
  haste: 'Increases attack and cast speed by 3% per rank.',
  hp: 'Increases maximum health by 12 per rank.',
  lifesteal: 'Heals you for 4% of damage dealt per rank.',
  shield: 'Surrounds you with an absorbing shield in combat.',
} as const;

const WARRIOR_TALENTS: ClassTalents = [
  {
    name: 'Arms',
    nodes: [
      n('warrior.arms.weapon_expertise', 'Weapon Expertise', 'Increases weapon damage by 2% per rank.', 0, 5, TAG('weapon_expertise')),
      n('warrior.arms.tactical_mastery', 'Tactical Mastery', 'Increases Stamina by 1 per rank.', 0, 5, STAT('constitution')),
      n('warrior.arms.deflection', 'Deflection', D.crit, 5, 5, TAG('crit_minor')),
      n('warrior.arms.improved_rend', 'Improved Rend', 'Increases bleed damage by 1% per rank.', 10, 3, TAG('improved_rend')),
      n('warrior.arms.poleaxe_specialization', 'Poleaxe Specialization', D.dmg2, 10, 5, TAG('dmg_major')),
      n('warrior.arms.deep_wounds', 'Deep Wounds', 'Your critical strikes cause extra bleed damage (1% per rank).', 15, 3, TAG('deep_wounds')),
      n('warrior.arms.two_handed_specialization', 'Two-Handed Specialization', D.dmg1, 20, 4, TAG('dmg_minor')),
      n('warrior.arms.sudden_death', 'Sudden Death', D.lifesteal, 25, 3, TAG('lifesteal_minor')),
      n('warrior.arms.mortal_strike', 'Mortal Strike', 'A brutal strike for 145% weapon damage.', 28, 1, TAG('mortal_strike')),
    ],
  },
  {
    name: 'Fury',
    nodes: [
      n('warrior.fury.cruelty', 'Cruelty', D.crit, 0, 5, TAG('cruelty')),
      n('warrior.fury.booming_voice', 'Booming Voice', 'Increases Strength by 1 per rank.', 0, 5, STAT('strength')),
      n('warrior.fury.unbridled_wrath', 'Unbridled Wrath', D.dmg2, 5, 5, TAG('dmg_major')),
      n('warrior.fury.enrage', 'Enrage', D.dmg1, 10, 3, TAG('dmg_minor')),
      n('warrior.fury.flurry', 'Flurry', 'Increases attack speed by 5% per rank.', 10, 5, TAG('flurry')),
      n('warrior.fury.bloodcraze', 'Bloodcraze', D.lifesteal, 15, 3, TAG('lifesteal_minor')),
      n('warrior.fury.improved_cleave', 'Improved Cleave', D.crit, 20, 4, TAG('crit_minor')),
      n('warrior.fury.rampage', 'Rampage', D.dmg1, 25, 3, TAG('dmg_minor')),
      n('warrior.fury.bloodthirst', 'Bloodthirst', 'Strikes for 150% weapon damage, healing you for 20% of the damage dealt.', 28, 1, TAG('bloodthirst')),
    ],
  },
  {
    // Tank strom: vysoká výdrž, nízké poškození (jen threat), mitigation capstone.
    name: 'Protection',
    nodes: [
      n('warrior.prot.toughness', 'Toughness', D.hp, 0, 5, TAG('toughness')),
      n('warrior.prot.anticipation', 'Anticipation', 'Increases Stamina by 1 per rank.', 0, 5, STAT('constitution')),
      n('warrior.prot.shield_specialization', 'Shield Specialization', D.hp, 5, 5, TAG('hp_minor')),
      n('warrior.prot.vitality', 'Vitality', 'Increases Stamina by 1 per rank.', 10, 5, STAT('constitution')),
      n('warrior.prot.last_stand', 'Last Stand', D.shield, 10, 3, TAG('shield_minor')),
      n('warrior.prot.improved_defensive_stance', 'Improved Defensive Stance', D.hp, 15, 5, TAG('hp_minor')),
      n('warrior.prot.shield_slam', 'Shield Slam', 'Slams the enemy with your shield for 150% weapon damage (threat).', 20, 1, TAG('shield_slam')),
      n('warrior.prot.defiance', 'Defiance', D.dmg1, 20, 4, TAG('dmg_minor')),
      n('warrior.prot.shield_wall', 'Shield Wall', 'Raises your shield, reducing damage taken by 50% for 8s.', 28, 1, TAG('shield_wall')),
    ],
  },
];

const PALADIN_TALENTS: ClassTalents = [
  {
    name: 'Holy',
    nodes: [
      n('paladin.holy.divine_intellect', 'Divine Intellect', 'Increases Intellect by 1 per rank.', 0, 5, STAT('intelligence')),
      n('paladin.holy.spiritual_focus', 'Spiritual Focus', 'Increases Spirit by 1 per rank.', 0, 5, STAT('wisdom')),
      n('paladin.holy.healing_light', 'Healing Light', D.hp, 5, 5, TAG('hp_minor')),
      n('paladin.holy.illumination', 'Illumination', D.crit, 10, 5, TAG('crit_minor')),
      n('paladin.holy.divine_favor', 'Divine Favor', D.haste, 15, 3, TAG('haste_minor')),
      n('paladin.holy.holy_power', 'Holy Power', D.dmg1, 20, 5, TAG('dmg_minor')),
      n('paladin.holy.sanctified_light', 'Sanctified Light', 'Increases Intellect by 1 per rank.', 25, 3, STAT('intelligence')),
      n('paladin.holy.lights_grace', "Light's Grace", 'Increases Spirit by 1 per rank.', 25, 2, STAT('wisdom')),
      n('paladin.holy.holy_shock', 'Holy Shock', 'Instantly restores 260% of your healing power to a wounded ally.', 28, 1, TAG('holy_shock')),
    ],
  },
  {
    // Tank strom: vysoká výdrž, nízké poškození (jen threat), mitigation capstone.
    name: 'Protection',
    nodes: [
      n('paladin.prot.divinity', 'Divinity', D.hp, 0, 5, TAG('hp_minor')),
      n('paladin.prot.stoicism', 'Stoicism', 'Increases Stamina by 1 per rank.', 0, 5, STAT('constitution')),
      n('paladin.prot.toughness', 'Toughness', D.hp, 5, 5, TAG('toughness')),
      n('paladin.prot.sacred_duty', 'Sacred Duty', 'Increases Stamina by 1 per rank.', 10, 5, STAT('constitution')),
      n('paladin.prot.holy_shield', 'Holy Shield', D.shield, 10, 3, TAG('holy_shield')),
      n('paladin.prot.improved_devotion_aura', 'Improved Devotion Aura', D.hp, 15, 5, TAG('hp_minor')),
      n('paladin.prot.avengers_shield', "Avenger's Shield", 'Hurls a holy shield at the enemy for 180% damage (threat).', 20, 1, TAG('avengers_shield')),
      n('paladin.prot.anticipation', 'Anticipation', D.dmg1, 20, 4, TAG('dmg_minor')),
      n('paladin.prot.ardent_defender', 'Ardent Defender', 'A holy ward reducing damage taken by 40% for 10s.', 28, 1, TAG('ardent_defender')),
    ],
  },
  {
    name: 'Retribution',
    nodes: [
      n('paladin.ret.benediction', 'Benediction', 'Increases Strength by 1 per rank.', 0, 5, STAT('strength')),
      n('paladin.ret.improved_judgement', 'Improved Judgement', D.crit, 0, 5, TAG('crit_minor')),
      n('paladin.ret.deflection', 'Deflection', 'Increases Strength by 1 per rank.', 5, 5, STAT('strength')),
      n('paladin.ret.crusade', 'Crusade', D.dmg2, 10, 5, TAG('dmg_major')),
      n('paladin.ret.vengeance', 'Vengeance', 'Increases damage by 1% per rank after a critical strike.', 15, 3, TAG('vengeance')),
      n('paladin.ret.conviction', 'Conviction', D.dmg1, 20, 5, TAG('dmg_minor')),
      n('paladin.ret.sanctity_aura', 'Sanctity Aura', D.haste, 25, 3, TAG('haste_minor')),
      n('paladin.ret.eye_for_an_eye', 'Eye for an Eye', D.lifesteal, 25, 2, TAG('lifesteal_minor')),
      n('paladin.ret.repentance', 'Repentance', 'Smites the target for 240% weapon damage.', 28, 1, TAG('repentance')),
    ],
  },
];

const HUNTER_TALENTS: ClassTalents = [
  {
    name: 'Beast Mastery',
    nodes: [
      n('hunter.bm.improved_aspect', 'Improved Aspect of the Hawk', 'Increases Agility by 1 per rank.', 0, 5, STAT('dexterity')),
      n('hunter.bm.endurance_training', 'Endurance Training', 'Increases Stamina by 1 per rank.', 0, 5, STAT('constitution')),
      n('hunter.bm.ferocity', 'Ferocity', D.crit, 5, 5, TAG('crit_minor')),
      n('hunter.bm.unleashed_fury', 'Unleashed Fury', D.dmg2, 10, 5, TAG('dmg_major')),
      n('hunter.bm.frenzy', 'Frenzy', D.haste, 15, 3, TAG('haste_minor')),
      n('hunter.bm.spirit_bond', 'Spirit Bond', D.hp, 20, 5, TAG('hp_minor')),
      n('hunter.bm.serpents_swiftness', "Serpent's Swiftness", D.haste, 25, 3, TAG('haste_minor')),
      n('hunter.bm.animal_handler', 'Animal Handler', 'Increases Agility by 1 per rank.', 25, 2, STAT('dexterity')),
      n('hunter.bm.bestial_wrath', 'Bestial Wrath', 'Sends your beast into a frenzy for 200% damage.', 28, 1, TAG('bestial_wrath')),
    ],
  },
  {
    name: 'Marksmanship',
    nodes: [
      n('hunter.mm.lethal_shots', 'Lethal Shots', D.crit, 0, 5, TAG('lethal_shots')),
      n('hunter.mm.efficiency', 'Efficiency', 'Increases Agility by 1 per rank.', 0, 5, STAT('dexterity')),
      n('hunter.mm.improved_arcane_shot', 'Improved Arcane Shot', D.dmg2, 5, 5, TAG('dmg_major')),
      n('hunter.mm.mortal_shots', 'Mortal Shots', D.crit, 10, 5, TAG('crit_minor')),
      n('hunter.mm.barrage', 'Barrage', D.dmg1, 15, 3, TAG('dmg_minor')),
      n('hunter.mm.ranged_weapon_specialization', 'Ranged Weapon Specialization', D.dmg2, 20, 5, TAG('dmg_major')),
      n('hunter.mm.trueshot_aura', 'Trueshot Aura', D.dmg1, 25, 3, TAG('dmg_minor')),
      n('hunter.mm.combat_experience', 'Combat Experience', 'Increases Agility by 1 per rank.', 25, 2, STAT('dexterity')),
      n('hunter.mm.silencing_shot', 'Silencing Shot', 'Silences the target and deals 170% weapon damage.', 28, 1, TAG('silencing_shot')),
    ],
  },
  {
    name: 'Survival',
    nodes: [
      n('hunter.surv.savage_strikes', 'Savage Strikes', D.crit, 0, 5, TAG('crit_minor')),
      n('hunter.surv.thick_hide', 'Thick Hide', 'Increases Stamina by 1 per rank.', 0, 5, STAT('constitution')),
      n('hunter.surv.survivalist', 'Survivalist', D.hp, 5, 5, TAG('hp_minor')),
      n('hunter.surv.lightning_reflexes', 'Lightning Reflexes', 'Increases Agility by 1 per rank.', 10, 5, STAT('dexterity')),
      n('hunter.surv.expose_weakness', 'Expose Weakness', D.dmg2, 15, 3, TAG('dmg_major')),
      n('hunter.surv.killer_instinct', 'Killer Instinct', D.dmg1, 20, 5, TAG('dmg_minor')),
      n('hunter.surv.surefooted', 'Surefooted', D.haste, 25, 3, TAG('haste_minor')),
      n('hunter.surv.thrill_of_the_hunt', 'Thrill of the Hunt', D.lifesteal, 25, 2, TAG('lifesteal_minor')),
      n('hunter.surv.explosive_shot', 'Explosive Shot', 'Sears the target for 150% damage plus 120% over 6s.', 28, 1, TAG('explosive_shot')),
    ],
  },
];

const ROGUE_TALENTS: ClassTalents = [
  {
    name: 'Assassination',
    nodes: [
      n('rogue.ass.malice', 'Malice', D.crit, 0, 5, TAG('malice')),
      n('rogue.ass.ruthlessness', 'Ruthlessness', 'Increases Agility by 1 per rank.', 0, 5, STAT('dexterity')),
      n('rogue.ass.lethality', 'Lethality', D.dmg2, 5, 5, TAG('dmg_major')),
      n('rogue.ass.vile_poisons', 'Vile Poisons', D.dmg1, 10, 5, TAG('dmg_minor')),
      n('rogue.ass.cold_blood', 'Cold Blood', D.crit, 15, 3, TAG('crit_minor')),
      n('rogue.ass.seal_fate', 'Seal Fate', D.dmg2, 20, 5, TAG('dmg_major')),
      n('rogue.ass.quick_recovery', 'Quick Recovery', D.lifesteal, 25, 3, TAG('lifesteal_minor')),
      n('rogue.ass.deadliness', 'Deadliness', 'Increases Agility by 1 per rank.', 25, 2, STAT('dexterity')),
      n('rogue.ass.mutilate', 'Mutilate', 'A flurry of blades for 200% weapon damage.', 28, 1, TAG('mutilate')),
    ],
  },
  {
    name: 'Combat',
    nodes: [
      n('rogue.combat.improved_sinister_strike', 'Improved Sinister Strike', D.haste, 0, 5, TAG('haste_minor')),
      n('rogue.combat.dual_wield_specialization', 'Dual Wield Specialization', 'Increases Agility by 1 per rank.', 0, 5, STAT('dexterity')),
      n('rogue.combat.precision', 'Precision', D.crit, 5, 5, TAG('crit_minor')),
      n('rogue.combat.weapon_expertise', 'Weapon Expertise', D.dmg2, 10, 5, TAG('dmg_major')),
      n('rogue.combat.aggression', 'Aggression', D.dmg1, 15, 3, TAG('dmg_minor')),
      n('rogue.combat.lightning_reflexes', 'Lightning Reflexes', 'Increases Agility by 1 per rank.', 20, 5, STAT('dexterity')),
      n('rogue.combat.adrenaline_rush', 'Adrenaline Rush', D.haste, 25, 3, TAG('haste_minor')),
      n('rogue.combat.weapon_master', 'Weapon Master', D.dmg1, 25, 2, TAG('dmg_minor')),
      n('rogue.combat.blade_flurry', 'Blade Flurry', 'Whirls into the target for 150% weapon damage.', 28, 1, TAG('blade_flurry')),
    ],
  },
  {
    name: 'Subtlety',
    nodes: [
      n('rogue.sub.opportunity', 'Opportunity', D.dmg2, 0, 5, TAG('dmg_major')),
      n('rogue.sub.master_of_deception', 'Master of Deception', 'Increases Agility by 1 per rank.', 0, 5, STAT('dexterity')),
      n('rogue.sub.initiative', 'Initiative', D.crit, 5, 5, TAG('crit_minor')),
      n('rogue.sub.serrated_blades', 'Serrated Blades', D.dmg1, 10, 5, TAG('dmg_minor')),
      n('rogue.sub.hemorrhage', 'Hemorrhage', D.dmg2, 15, 3, TAG('dmg_major')),
      n('rogue.sub.deadliness', 'Deadliness', 'Increases Agility by 1 per rank.', 20, 5, STAT('dexterity')),
      n('rogue.sub.sinister_calling', 'Sinister Calling', D.crit, 25, 3, TAG('crit_minor')),
      n('rogue.sub.elusiveness', 'Elusiveness', D.hp, 25, 2, TAG('hp_minor')),
      n('rogue.sub.shadowstrike', 'Shadowstrike', 'Strikes from the shadows for 230% weapon damage, increased to 300% below 35% health.', 28, 1, TAG('shadowstrike')),
    ],
  },
];

const PRIEST_TALENTS: ClassTalents = [
  {
    name: 'Discipline',
    nodes: [
      n('priest.disc.meditation', 'Meditation', 'Increases Spirit by 1 per rank.', 0, 5, STAT('wisdom')),
      n('priest.disc.enlightenment', 'Enlightenment', 'Increases Intellect by 1 per rank.', 0, 5, STAT('intelligence')),
      n('priest.disc.improved_power_word_fortitude', 'Improved Power Word: Fortitude', D.hp, 5, 5, TAG('hp_minor')),
      n('priest.disc.mental_strength', 'Mental Strength', D.crit, 10, 5, TAG('crit_minor')),
      n('priest.disc.power_infusion', 'Power Infusion', D.haste, 15, 3, TAG('haste_minor')),
      n('priest.disc.focused_power', 'Focused Power', D.dmg1, 20, 5, TAG('dmg_minor')),
      n('priest.disc.grace', 'Grace', 'Increases Spirit by 1 per rank.', 25, 3, STAT('wisdom')),
      n('priest.disc.inner_focus', 'Inner Focus', 'Increases Intellect by 1 per rank.', 25, 2, STAT('intelligence')),
      n('priest.disc.penance', 'Penance', 'Channels healing for 250% of your healing power to a wounded ally.', 28, 1, TAG('penance')),
    ],
  },
  {
    name: 'Holy',
    nodes: [
      n('priest.holy.healing_focus', 'Healing Focus', 'Increases Spirit by 1 per rank.', 0, 5, STAT('wisdom')),
      n('priest.holy.improved_renew', 'Improved Renew', 'Increases Intellect by 1 per rank.', 0, 5, STAT('intelligence')),
      n('priest.holy.spiritual_healing', 'Spiritual Healing', D.hp, 5, 5, TAG('hp_minor')),
      n('priest.holy.divine_fury', 'Divine Fury', D.crit, 10, 5, TAG('crit_minor')),
      n('priest.holy.holy_concentration', 'Holy Concentration', D.haste, 15, 3, TAG('haste_minor')),
      n('priest.holy.blessed_resilience', 'Blessed Resilience', 'Increases Spirit by 1 per rank.', 20, 5, STAT('wisdom')),
      n('priest.holy.empowered_healing', 'Empowered Healing', 'Increases Intellect by 1 per rank.', 25, 3, STAT('intelligence')),
      n('priest.holy.serendipity', 'Serendipity', D.crit, 25, 2, TAG('crit_minor')),
      n('priest.holy.guardian_spirit', 'Guardian Spirit', 'A powerful heal restoring 300% of your healing power to a wounded ally.', 28, 1, TAG('guardian_spirit')),
    ],
  },
  {
    name: 'Shadow',
    nodes: [
      n('priest.shadow.darkness', 'Darkness', 'Increases shadow damage by 2% per rank.', 0, 5, TAG('shadow_mastery')),
      n('priest.shadow.spirit_tap', 'Spirit Tap', 'Increases Spirit by 1 per rank.', 0, 5, STAT('wisdom')),
      n('priest.shadow.shadow_focus', 'Shadow Focus', D.crit, 5, 5, TAG('crit_minor')),
      n('priest.shadow.shadow_weaving', 'Shadow Weaving', D.dmg1, 10, 5, TAG('dmg_minor')),
      n('priest.shadow.vampiric_embrace', 'Vampiric Embrace', 'Heals you for 8% of shadow damage dealt per rank.', 15, 3, TAG('vampiric_embrace')),
      n('priest.shadow.shadow_power', 'Shadow Power', D.dmg2, 20, 5, TAG('dmg_major')),
      n('priest.shadow.focused_mind', 'Focused Mind', D.crit, 25, 3, TAG('crit_minor')),
      n('priest.shadow.shadow_affinity', 'Shadow Affinity', 'Increases Intellect by 1 per rank.', 25, 2, STAT('intelligence')),
      n('priest.shadow.mind_blast', 'Mind Blast', "Blasts the target's mind for 250% spell damage.", 28, 1, TAG('mind_blast')),
    ],
  },
];

const SHAMAN_TALENTS: ClassTalents = [
  {
    name: 'Elemental',
    nodes: [
      n('shaman.ele.convection', 'Convection', 'Increases Intellect by 1 per rank.', 0, 5, STAT('intelligence')),
      n('shaman.ele.concussion', 'Concussion', 'Increases lightning damage by 1% per rank.', 0, 5, TAG('concussion')),
      n('shaman.ele.call_of_flame', 'Call of Flame', D.dmg2, 5, 5, TAG('dmg_major')),
      n('shaman.ele.elemental_devastation', 'Elemental Devastation', D.crit, 10, 5, TAG('crit_minor')),
      n('shaman.ele.elemental_focus', 'Elemental Focus', D.haste, 15, 3, TAG('haste_minor')),
      n('shaman.ele.lightning_mastery', 'Lightning Mastery', D.dmg1, 20, 5, TAG('dmg_minor')),
      n('shaman.ele.elemental_precision', 'Elemental Precision', D.crit, 25, 3, TAG('crit_minor')),
      n('shaman.ele.unrelenting_storm', 'Unrelenting Storm', 'Increases Intellect by 1 per rank.', 25, 2, STAT('intelligence')),
      n('shaman.ele.thunderstorm', 'Thunderstorm', 'Calls down lightning for 300% spell damage.', 28, 1, TAG('thunderstorm')),
    ],
  },
  {
    name: 'Enhancement',
    nodes: [
      n('shaman.enh.ancestral_knowledge', 'Ancestral Knowledge', 'Increases Strength by 1 per rank.', 0, 5, STAT('strength')),
      n('shaman.enh.thundering_strikes', 'Thundering Strikes', D.crit, 0, 5, TAG('crit_minor')),
      n('shaman.enh.improved_weapons', 'Improved Weapons', D.dmg2, 5, 5, TAG('dmg_major')),
      n('shaman.enh.flurry', 'Flurry', 'Increases attack speed by 5% per rank.', 10, 5, TAG('flurry')),
      n('shaman.enh.unleashed_rage', 'Unleashed Rage', D.dmg1, 15, 3, TAG('dmg_minor')),
      n('shaman.enh.weapon_mastery', 'Weapon Mastery', D.dmg2, 20, 5, TAG('dmg_major')),
      n('shaman.enh.elemental_weapons', 'Elemental Weapons', D.haste, 25, 3, TAG('haste_minor')),
      n('shaman.enh.spirit_weapons', 'Spirit Weapons', D.lifesteal, 25, 2, TAG('lifesteal_minor')),
      n('shaman.enh.stormstrike', 'Stormstrike', 'An elemental melee strike for 200% damage.', 28, 1, TAG('stormstrike')),
    ],
  },
  {
    name: 'Restoration',
    nodes: [
      n('shaman.resto.tidal_focus', 'Tidal Focus', 'Increases Spirit by 1 per rank.', 0, 5, STAT('wisdom')),
      n('shaman.resto.totemic_focus', 'Totemic Focus', 'Increases Intellect by 1 per rank.', 0, 5, STAT('intelligence')),
      n('shaman.resto.healing_grace', 'Healing Grace', D.hp, 5, 5, TAG('hp_minor')),
      n('shaman.resto.tidal_mastery', 'Tidal Mastery', D.crit, 10, 5, TAG('crit_minor')),
      n('shaman.resto.natures_swiftness', "Nature's Swiftness", D.haste, 15, 3, TAG('haste_minor')),
      n('shaman.resto.purification', 'Purification', 'Increases Intellect by 1 per rank.', 20, 5, STAT('intelligence')),
      n('shaman.resto.healing_way', 'Healing Way', 'Increases Spirit by 1 per rank.', 25, 3, STAT('wisdom')),
      n('shaman.resto.nature_guardian', "Nature's Guardian", D.hp, 25, 2, TAG('hp_minor')),
      n('shaman.resto.riptide', 'Riptide', 'A surging wave restoring 260% of your healing power to a wounded ally.', 28, 1, TAG('riptide')),
    ],
  },
];

const MAGE_TALENTS: ClassTalents = [
  {
    name: 'Arcane',
    nodes: [
      n('mage.arcane.arcane_focus', 'Arcane Focus', 'Increases Intellect by 1 per rank.', 0, 5, STAT('intelligence')),
      n('mage.arcane.arcane_concentration', 'Arcane Concentration', D.crit, 0, 5, TAG('crit_minor')),
      n('mage.arcane.arcane_impact', 'Arcane Impact', D.dmg2, 5, 5, TAG('dmg_major')),
      n('mage.arcane.arcane_meditation', 'Arcane Meditation', 'Increases Spirit by 1 per rank.', 10, 5, STAT('wisdom')),
      n('mage.arcane.presence_of_mind', 'Presence of Mind', D.haste, 15, 3, TAG('haste_minor')),
      n('mage.arcane.arcane_instability', 'Arcane Instability', D.dmg1, 20, 5, TAG('dmg_minor')),
      n('mage.arcane.arcane_potency', 'Arcane Potency', D.crit, 25, 3, TAG('crit_minor')),
      n('mage.arcane.mind_mastery', 'Mind Mastery', 'Increases Intellect by 1 per rank.', 25, 2, STAT('intelligence')),
      n('mage.arcane.arcane_power', 'Arcane Power', 'Unleashes raw arcane power for 200% spell damage.', 28, 1, TAG('arcane_power')),
    ],
  },
  {
    name: 'Fire',
    nodes: [
      n('mage.fire.improved_fireball', 'Improved Fireball', D.haste, 0, 5, TAG('haste_minor')),
      n('mage.fire.incinerate', 'Incinerate', D.crit, 0, 5, TAG('incinerate')),
      n('mage.fire.ignite', 'Ignite', 'Increases fire damage by 1% per rank.', 5, 5, TAG('ignite')),
      n('mage.fire.fire_power', 'Fire Power', D.dmg2, 10, 5, TAG('dmg_major')),
      n('mage.fire.combustion', 'Combustion', D.crit, 15, 3, TAG('crit_minor')),
      n('mage.fire.master_of_elements', 'Master of Elements', D.dmg1, 20, 5, TAG('dmg_minor')),
      n('mage.fire.burning_soul', 'Burning Soul', 'Increases Intellect by 1 per rank.', 25, 3, STAT('intelligence')),
      n('mage.fire.pyromaniac', 'Pyromaniac', D.crit, 25, 2, TAG('crit_minor')),
      n('mage.fire.pyroblast', 'Pyroblast', 'A massive fireball for 185% damage that burns for a further 60% over 6s.', 28, 1, TAG('pyroblast_mastery')),
    ],
  },
  {
    name: 'Frost',
    nodes: [
      n('mage.frost.improved_frostbolt', 'Improved Frostbolt', D.haste, 0, 5, TAG('haste_minor')),
      n('mage.frost.elemental_precision', 'Elemental Precision', D.crit, 0, 5, TAG('crit_minor')),
      n('mage.frost.ice_shards', 'Ice Shards', D.dmg2, 5, 5, TAG('dmg_major')),
      n('mage.frost.piercing_ice', 'Piercing Ice', D.dmg1, 10, 5, TAG('dmg_minor')),
      n('mage.frost.ice_barrier', 'Ice Barrier', D.shield, 15, 3, TAG('ice_barrier')),
      n('mage.frost.arctic_winds', 'Arctic Winds', D.dmg2, 20, 5, TAG('dmg_major')),
      n('mage.frost.shatter', 'Shatter', D.crit, 25, 3, TAG('crit_minor')),
      n('mage.frost.frost_channeling', 'Frost Channeling', 'Increases Intellect by 1 per rank.', 25, 2, STAT('intelligence')),
      n('mage.frost.frostfire_bolt', 'Frostfire Bolt', 'A bolt of frost and fire for 180% spell damage.', 28, 1, TAG('frostfire_bolt')),
    ],
  },
];

const WARLOCK_TALENTS: ClassTalents = [
  {
    name: 'Affliction',
    nodes: [
      n('warlock.aff.suppression', 'Suppression', D.crit, 0, 5, TAG('crit_minor')),
      n('warlock.aff.improved_corruption', 'Improved Corruption', D.dmg1, 0, 5, TAG('dmg_minor')),
      n('warlock.aff.shadow_mastery', 'Shadow Mastery', 'Increases shadow damage by 2% per rank.', 5, 5, TAG('shadow_mastery')),
      n('warlock.aff.fel_concentration', 'Fel Concentration', 'Increases Intellect by 1 per rank.', 10, 5, STAT('intelligence')),
      n('warlock.aff.siphon_life', 'Siphon Life', D.lifesteal, 15, 3, TAG('lifesteal_minor')),
      n('warlock.aff.shadow_embrace', 'Shadow Embrace', D.dmg2, 20, 5, TAG('dmg_major')),
      n('warlock.aff.malediction', 'Malediction', D.crit, 25, 3, TAG('crit_minor')),
      n('warlock.aff.contagion', 'Contagion', D.dmg1, 25, 2, TAG('dmg_minor')),
      n('warlock.aff.unstable_affliction', 'Unstable Affliction', 'Afflicts the target for 155% damage plus 120% over 8s.', 28, 1, TAG('unstable_affliction')),
    ],
  },
  {
    name: 'Demonology',
    nodes: [
      n('warlock.demo.improved_imp', 'Improved Imp', 'Increases Intellect by 1 per rank.', 0, 5, STAT('intelligence')),
      n('warlock.demo.demonic_embrace', 'Demonic Embrace', 'Increases Stamina by 1 per rank.', 0, 5, STAT('constitution')),
      n('warlock.demo.fel_intellect', 'Fel Intellect', D.hp, 5, 5, TAG('hp_minor')),
      n('warlock.demo.demonic_power', 'Demonic Power', D.dmg2, 10, 5, TAG('dmg_major')),
      n('warlock.demo.soul_link', 'Soul Link', D.lifesteal, 15, 3, TAG('lifesteal_minor')),
      n('warlock.demo.master_demonologist', 'Master Demonologist', D.dmg1, 20, 5, TAG('dmg_minor')),
      n('warlock.demo.demonic_tactics', 'Demonic Tactics', D.crit, 25, 3, TAG('crit_minor')),
      n('warlock.demo.demonic_knowledge', 'Demonic Knowledge', 'Increases Intellect by 1 per rank.', 25, 2, STAT('intelligence')),
      n('warlock.demo.demonbolt', 'Demonbolt', 'Hurls demonic fire at the target for 230% spell damage.', 28, 1, TAG('demonbolt')),
    ],
  },
  {
    name: 'Destruction',
    nodes: [
      n('warlock.dest.improved_shadow_bolt', 'Improved Shadow Bolt', D.crit, 0, 5, TAG('crit_minor')),
      n('warlock.dest.cataclysm', 'Cataclysm', 'Increases Intellect by 1 per rank.', 0, 5, STAT('intelligence')),
      n('warlock.dest.bane', 'Bane', D.haste, 5, 5, TAG('haste_minor')),
      n('warlock.dest.devastation', 'Devastation', D.crit, 10, 5, TAG('devastation')),
      n('warlock.dest.improved_immolate', 'Improved Immolate', D.dmg1, 15, 3, TAG('dmg_minor')),
      n('warlock.dest.emberstorm', 'Emberstorm', D.dmg2, 20, 5, TAG('dmg_major')),
      n('warlock.dest.ruin', 'Ruin', D.crit, 25, 3, TAG('crit_minor')),
      n('warlock.dest.backlash', 'Backlash', D.haste, 25, 2, TAG('haste_minor')),
      n('warlock.dest.chaos_bolt', 'Chaos Bolt', 'Unstoppable chaos for 250% spell damage.', 28, 1, TAG('chaos_bolt')),
    ],
  },
];

const DRUID_TALENTS: ClassTalents = [
  {
    name: 'Balance',
    nodes: [
      n('druid.bal.starlight_wrath', 'Starlight Wrath', D.haste, 0, 5, TAG('haste_minor')),
      n('druid.bal.focused_starlight', 'Focused Starlight', D.crit, 0, 5, TAG('crit_minor')),
      n('druid.bal.improved_moonfire', 'Improved Moonfire', D.dmg2, 5, 5, TAG('dmg_major')),
      n('druid.bal.vengeance', 'Vengeance', D.crit, 10, 5, TAG('crit_minor')),
      n('druid.bal.lunar_guidance', 'Lunar Guidance', 'Increases Intellect by 1 per rank.', 15, 3, STAT('intelligence')),
      n('druid.bal.moonfury', 'Moonfury', D.dmg2, 20, 5, TAG('dmg_major')),
      n('druid.bal.wrath_of_cenarius', 'Wrath of Cenarius', D.dmg1, 25, 3, TAG('dmg_minor')),
      n('druid.bal.dreamstate', 'Dreamstate', 'Increases Spirit by 1 per rank.', 25, 2, STAT('wisdom')),
      n('druid.bal.starfall', 'Starfall', 'Calls down starlight for 290% spell damage.', 28, 1, TAG('starfall')),
    ],
  },
  {
    name: 'Feral',
    nodes: [
      n('druid.feral.ferocity', 'Ferocity', 'Increases Agility by 1 per rank.', 0, 5, STAT('dexterity')),
      n('druid.feral.sharpened_claws', 'Sharpened Claws', D.crit, 0, 5, TAG('crit_minor')),
      n('druid.feral.feral_aggression', 'Feral Aggression', D.dmg2, 5, 5, TAG('dmg_major')),
      n('druid.feral.thick_hide', 'Thick Hide', 'Increases Stamina by 1 per rank.', 10, 5, STAT('constitution')),
      n('druid.feral.blood_frenzy', 'Blood Frenzy', D.lifesteal, 15, 3, TAG('lifesteal_minor')),
      n('druid.feral.heart_of_the_wild', 'Heart of the Wild', D.dmg1, 20, 5, TAG('dmg_minor')),
      n('druid.feral.predatory_instincts', 'Predatory Instincts', D.crit, 25, 3, TAG('crit_minor')),
      n('druid.feral.primal_fury', 'Primal Fury', D.haste, 25, 2, TAG('haste_minor')),
      n('druid.feral.berserk', 'Berserk', 'Enters a frenzy, striking for 330% damage.', 28, 1, TAG('berserk')),
    ],
  },
  {
    name: 'Restoration',
    nodes: [
      n('druid.resto.improved_rejuvenation', 'Improved Rejuvenation', 'Increases Spirit by 1 per rank.', 0, 5, STAT('wisdom')),
      n('druid.resto.natures_focus', "Nature's Focus", 'Increases Intellect by 1 per rank.', 0, 5, STAT('intelligence')),
      n('druid.resto.gift_of_nature', 'Gift of Nature', D.hp, 5, 5, TAG('hp_minor')),
      n('druid.resto.tranquil_spirit', 'Tranquil Spirit', D.crit, 10, 5, TAG('crit_minor')),
      n('druid.resto.natures_swiftness', "Nature's Swiftness", D.haste, 15, 3, TAG('haste_minor')),
      n('druid.resto.empowered_touch', 'Empowered Touch', 'Increases Intellect by 1 per rank.', 20, 5, STAT('intelligence')),
      n('druid.resto.living_spirit', 'Living Spirit', 'Increases Spirit by 1 per rank.', 25, 3, STAT('wisdom')),
      n('druid.resto.improved_regrowth', 'Improved Regrowth', D.crit, 25, 2, TAG('crit_minor')),
      n('druid.resto.tranquility', 'Tranquility', "Channels nature's tranquility, restoring 300% of your healing power to a wounded ally.", 28, 1, TAG('tranquility')),
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

/** Maximální počet bodů, který lze utratit v jednom stromě (kapacita stromu). */
export function treeCapacity(tree: TalentTree): number {
  return tree.nodes.reduce((sum, node) => sum + node.maxRanks, 0);
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

/** Combat tag s počtem alokovaných ranků (pro combat engine M5). */
export interface TalentTag {
  tag: string;
  ranks: number;
}

/**
 * Agregovaný dopad alokovaných talentů: přímé stat bonusy (M4) + HP bonus +
 * seznam combat tagů s ranky (M5). Jediný zdroj pravdy pro „jak talenty mění
 * postavu" — používá character sheet i combat engine.
 */
export interface AggregatedTalentEffects {
  statBonus: Partial<Record<AbilityScore, number>>;
  healthBonus: number;
  tags: TalentTag[];
}

/** Sečte efekty všech alokovaných talentů postavy (talentId → ranks). */
export function aggregateTalentEffects(
  classId: ClassId,
  allocations: Record<string, number>,
): AggregatedTalentEffects {
  const statBonus: AggregatedTalentEffects['statBonus'] = {};
  let healthBonus = 0;
  const tagRanks = new Map<string, number>();

  for (const tree of CLASS_TALENTS[classId]) {
    for (const node of tree.nodes) {
      const ranks = allocations[node.id] ?? 0;
      if (ranks <= 0) continue;
      const { statPerRank, healthPerRank, combatTags } = node.effect;
      if (statPerRank) {
        for (const [stat, val] of Object.entries(statPerRank) as [
          keyof AggregatedTalentEffects['statBonus'],
          number,
        ][]) {
          statBonus[stat] = (statBonus[stat] ?? 0) + val * ranks;
        }
      }
      if (healthPerRank) healthBonus += healthPerRank * ranks;
      if (combatTags) {
        for (const tag of combatTags) tagRanks.set(tag, (tagRanks.get(tag) ?? 0) + ranks);
      }
    }
  }

  return {
    statBonus,
    healthBonus,
    tags: [...tagRanks.entries()].map(([tag, ranks]) => ({ tag, ranks })),
  };
}
