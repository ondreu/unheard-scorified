/**
 * D&D bestiář (MR-7). Jediný zdroj pravdy pro katalog nestvůr: creature type,
 * Challenge Rating, damage typ útoku, **resistance / vulnerability / immunity** a
 * unikátní ability. Rozšiřuje dice-roll combat z MR-5 (`combat.ts`) o typové
 * poškození a obrany.
 *
 * Čistá data + builder (`buildBestiaryEnemy`) → `EnemyStats`; herní logika žije
 * v `combat.ts`. Konkrétní staty se odvozují z CR (DMG, `crStatGuide`) a smí je
 * šablona přepsat. Balanc (přiřazení CR existujícímu obsahu) = MR-10.
 *
 * Type-only import `EnemyStats` z `../combat` → žádný runtime cyklus (combat.ts
 * z bestiáře importuje jen za běhu, my z něj jen typ).
 */
import type { AbilityScore } from '../character';
import type { EnemyStats } from '../combat';
import type { ConditionRider } from '../conditions';
import type { DiceSpec } from '../dice';
import type { AbilityKind, SignatureAbility } from './abilities';
import {
  crStatGuide,
  type ChallengeRating,
  type CreatureType,
  type DamageType,
} from './damage';

// ── Ability nestvůry ─────────────────────────────────────────────────────────

/** Speciální útok / schopnost nestvůry (idle: cooldown-based, flavor + damage). */
export interface EnemyAbility {
  id: string;
  /** Anglický název (game language = EN). */
  name: string;
  /** Násobek poškození vůči základnímu útoku nestvůry. */
  damageMult: number;
  /** Typ poškození této ability (může se lišit od základního útoku). */
  damageType: DamageType;
  /** Cooldown ve vteřinách (idle recharge). */
  cooldownSec: number;
  /** Hráči viditelný popis (anglicky). */
  description: string;
  /** Volitelný saving throw efekt (cíl si hází proti save DC nestvůry). */
  save?: { ability: AbilityScore; description: string };
  /**
   * Condition rider (Slice 2a) — na **neúspěšný `save`** uvalí na hráče status
   * efekt (stun/prone/restrained/frightened/slowed/poisoned/charmed/blinded).
   * Vyžaduje `save`. Propisuje se přes `enemyAbilityToSignature` do bojového aktéra.
   */
  condition?: ConditionRider;
  /**
   * Druh ability (Slice 2d) — `strike` (default, přímý úder), `drain` (úder +
   * self-heal nestvůry) nebo `dot` (úder + krvácení/jed v čase). `undefined` =
   * `strike`. Propisuje se do `SignatureAbility.kind`.
   */
  kind?: Extract<AbilityKind, 'strike' | 'drain' | 'dot'>;
  /** Drain (`kind: 'drain'`): podíl uděleného poškození, který nestvůru vyléčí. */
  drainHealFraction?: number;
  /** DoT (`kind: 'dot'`): celková doba krvácení/jedu ve vteřinách. */
  dotDurationSec?: number;
  /** DoT: počet tiků rozložených přes `dotDurationSec`. */
  dotTicks?: number;
  /** DoT: násobek poškození jednoho tiku (z attack power nestvůry). */
  dotTickMult?: number;
  /** DoT: literal kostky jednoho tiku (přebijí `dotTickMult`, pokud je vyplněno). */
  dotDice?: DiceSpec;
}

// ── Šablona nestvůry ─────────────────────────────────────────────────────────

/** Statická šablona nestvůry v bestiáři. */
export interface EnemyTemplate {
  id: string;
  /** Anglický název (game language = EN). */
  name: string;
  /** Flavor popis (anglicky). */
  description: string;
  /** Rodina nestvůry (D&D creature type). */
  creatureType: CreatureType;
  /** Challenge Rating (řídí doporučené staty + XP). */
  cr: ChallengeRating;
  /** Typ poškození základního útoku. */
  attackType: DamageType;
  /** Resistance (poloviční poškození). */
  resistances?: readonly DamageType[];
  /** Vulnerability (dvojnásobné poškození). */
  vulnerabilities?: readonly DamageType[];
  /** Immunity (nulové poškození). */
  immunities?: readonly DamageType[];
  /** Unikátní ability nestvůry. */
  abilities?: readonly EnemyAbility[];
  /** Boss flag (epické nestvůry). */
  isBoss?: boolean;
  /** Přepis doporučeného HP (jinak ze CR). */
  maxHealth?: number;
  /** Přepis doporučeného poškození na úder (jinak ze CR `damagePerRound`). */
  attackPower?: number;
  /** Přepis swing intervalu (vteřiny). Default 2.4. */
  swingInterval?: number;
}

/** Default swing interval nestvůry (vteřiny), sjednocený s player baseline. */
const DEFAULT_SWING = 2.4;

// ── Katalog ──────────────────────────────────────────────────────────────────

/**
 * Bestiář — reprezentativní D&D nestvůry napříč creature typy a CR. Demonstruje
 * resistance/vulnerability/immunity a unikátní ability. Existující dungeon/raid
 * obsah ho zatím nepoužívá (přemapování = MR-10); slouží jako znovupoužitelná
 * datová vrstva combat enginu a budoucího content authoringu.
 */
const TEMPLATES: readonly EnemyTemplate[] = [
  // ── Undead ─────────────────────────────────────────────────────────────────
  {
    id: 'skeleton_warrior',
    name: 'Skeleton Warrior',
    description: 'Animated bones held together by dark magic, brittle but tireless.',
    creatureType: 'undead',
    cr: 0.25,
    attackType: 'slashing',
    vulnerabilities: ['bludgeoning'],
    immunities: ['poison'],
    resistances: ['necrotic'],
  },
  {
    id: 'rotting_zombie',
    name: 'Rotting Zombie',
    description: 'A shambling corpse that keeps coming long after it should fall.',
    creatureType: 'undead',
    cr: 0.25,
    attackType: 'bludgeoning',
    immunities: ['poison'],
    resistances: ['necrotic'],
    vulnerabilities: ['radiant'],
  },
  {
    id: 'grave_wraith',
    name: 'Grave Wraith',
    description: 'A malevolent spirit that drains the life from the living.',
    creatureType: 'undead',
    cr: 5,
    attackType: 'necrotic',
    resistances: ['cold', 'lightning', 'bludgeoning', 'piercing', 'slashing'],
    immunities: ['necrotic', 'poison'],
    vulnerabilities: ['radiant'],
    abilities: [
      {
        id: 'life_drain',
        name: 'Life Drain',
        kind: 'drain',
        damageMult: 1.8,
        damageType: 'necrotic',
        cooldownSec: 12,
        drainHealFraction: 0.5,
        description: 'Drains vitality, healing the wraith for half the damage dealt.',
        save: { ability: 'constitution', description: 'CON save for half damage.' },
      },
    ],
  },

  // ── Humanoid ───────────────────────────────────────────────────────────────
  {
    id: 'goblin_cutter',
    name: 'Goblin Cutter',
    description: 'A small, vicious raider that strikes from the shadows.',
    creatureType: 'humanoid',
    cr: 0.25,
    attackType: 'slashing',
    abilities: [
      {
        id: 'nasty_jab',
        name: 'Nasty Jab',
        damageMult: 1.5,
        damageType: 'piercing',
        cooldownSec: 8,
        description: 'A sudden stab aimed at a weak point.',
      },
    ],
  },
  {
    id: 'cultist_pyromancer',
    name: 'Cultist Pyromancer',
    description: 'A robed zealot channeling profane flame.',
    creatureType: 'humanoid',
    cr: 2,
    attackType: 'fire',
    resistances: ['fire'],
    abilities: [
      {
        id: 'scorching_ray',
        name: 'Scorching Ray',
        damageMult: 1.7,
        damageType: 'fire',
        cooldownSec: 10,
        description: 'Hurls searing bolts of flame.',
        save: { ability: 'dexterity', description: 'DEX save for half damage.' },
      },
    ],
  },

  // ── Beast ──────────────────────────────────────────────────────────────────
  {
    id: 'dire_wolf',
    name: 'Dire Wolf',
    description: 'An enormous pack hunter with bone-crushing jaws.',
    creatureType: 'beast',
    cr: 1,
    attackType: 'piercing',
    abilities: [
      {
        id: 'pack_takedown',
        name: 'Pack Takedown',
        damageMult: 1.6,
        damageType: 'piercing',
        cooldownSec: 9,
        description: 'Lunges to knock the target prone.',
        save: { ability: 'strength', description: 'STR save or be knocked prone.' },
        condition: { type: 'prone', durationTurns: 1 },
      },
    ],
  },
  {
    id: 'giant_spider',
    name: 'Giant Spider',
    description: 'A monstrous arachnid whose bite floods the veins with venom.',
    creatureType: 'beast',
    cr: 1,
    attackType: 'piercing',
    abilities: [
      {
        id: 'venomous_bite',
        name: 'Venomous Bite',
        kind: 'dot',
        damageMult: 1.2,
        damageType: 'poison',
        cooldownSec: 10,
        dotDurationSec: 9,
        dotTicks: 3,
        dotTickMult: 0.5,
        description: 'A venom-dripping bite that sickens the target over time.',
        save: { ability: 'constitution', description: 'CON save for half damage, or be poisoned.' },
        condition: { type: 'poisoned', durationTurns: 2 },
      },
    ],
  },

  // ── Giant ──────────────────────────────────────────────────────────────────
  {
    id: 'hill_ogre',
    name: 'Hill Ogre',
    description: 'A hulking brute swinging a tree-trunk club.',
    creatureType: 'giant',
    cr: 2,
    attackType: 'bludgeoning',
    abilities: [
      {
        id: 'crushing_swing',
        name: 'Crushing Swing',
        damageMult: 2,
        damageType: 'bludgeoning',
        cooldownSec: 11,
        description: 'A wide, devastating club swing.',
      },
    ],
  },

  // ── Elemental ──────────────────────────────────────────────────────────────
  {
    id: 'fire_elemental',
    name: 'Fire Elemental',
    description: 'A roaring vortex of living flame.',
    creatureType: 'elemental',
    cr: 5,
    attackType: 'fire',
    immunities: ['fire', 'poison'],
    vulnerabilities: ['cold'],
    resistances: ['bludgeoning', 'piercing', 'slashing'],
    abilities: [
      {
        id: 'fire_burst',
        name: 'Fire Burst',
        damageMult: 1.8,
        damageType: 'fire',
        cooldownSec: 10,
        description: 'Erupts in a burst of flame, igniting everything nearby.',
        save: { ability: 'dexterity', description: 'DEX save for half damage.' },
      },
    ],
  },
  {
    id: 'frost_elemental',
    name: 'Frost Elemental',
    description: 'A shard-bodied creature radiating numbing cold.',
    creatureType: 'elemental',
    cr: 5,
    attackType: 'cold',
    immunities: ['cold', 'poison'],
    vulnerabilities: ['fire'],
    resistances: ['bludgeoning', 'piercing', 'slashing'],
    abilities: [
      {
        id: 'frost_nova',
        name: 'Frost Nova',
        damageMult: 1.6,
        damageType: 'cold',
        cooldownSec: 10,
        description: 'A wave of frost that slows everything it touches.',
        save: { ability: 'constitution', description: 'CON save or be slowed.' },
        condition: { type: 'slowed', durationTurns: 2 },
      },
    ],
  },

  // ── Construct ──────────────────────────────────────────────────────────────
  {
    id: 'stone_golem',
    name: 'Stone Golem',
    description: 'A massive automaton of carved granite.',
    creatureType: 'construct',
    cr: 10,
    attackType: 'bludgeoning',
    immunities: ['poison', 'psychic'],
    resistances: ['necrotic'],
    abilities: [
      {
        id: 'slam',
        name: 'Earthshaking Slam',
        damageMult: 2,
        damageType: 'bludgeoning',
        cooldownSec: 12,
        description: 'A ground-pounding slam that staggers all nearby.',
        save: { ability: 'strength', description: 'STR save or be knocked prone.' },
        condition: { type: 'prone', durationTurns: 1 },
      },
    ],
  },

  // ── Plant ──────────────────────────────────────────────────────────────────
  {
    id: 'ancient_treant',
    name: 'Ancient Treant',
    description: 'A towering, wrathful tree-guardian of the deep wood.',
    creatureType: 'plant',
    cr: 9,
    attackType: 'bludgeoning',
    resistances: ['bludgeoning', 'piercing'],
    vulnerabilities: ['fire'],
    abilities: [
      {
        id: 'rooting_grasp',
        name: 'Rooting Grasp',
        damageMult: 1.5,
        damageType: 'bludgeoning',
        cooldownSec: 13,
        description: 'Roots erupt to ensnare the target.',
        save: { ability: 'strength', description: 'STR save or be restrained.' },
        condition: { type: 'restrained', durationTurns: 2 },
      },
    ],
  },

  // ── Fiend ──────────────────────────────────────────────────────────────────
  {
    id: 'pit_fiend_spawn',
    name: 'Abyssal Marauder',
    description: 'A lesser fiend wreathed in hellish fire.',
    creatureType: 'fiend',
    cr: 6,
    attackType: 'slashing',
    resistances: ['cold', 'lightning', 'bludgeoning', 'piercing', 'slashing'],
    immunities: ['fire', 'poison'],
    abilities: [
      {
        id: 'hellfire_lash',
        name: 'Hellfire Lash',
        damageMult: 1.9,
        damageType: 'fire',
        cooldownSec: 11,
        description: 'A whip of fire that sears flesh and soul alike.',
        save: { ability: 'dexterity', description: 'DEX save for half damage.' },
      },
    ],
  },

  // ── Dragon (boss) ──────────────────────────────────────────────────────────
  {
    id: 'young_red_dragon',
    name: 'Young Red Dragon',
    description: 'A prideful wyrm whose breath turns stone to slag.',
    creatureType: 'dragon',
    cr: 10,
    attackType: 'piercing',
    immunities: ['fire'],
    isBoss: true,
    abilities: [
      {
        id: 'fire_breath',
        name: 'Fire Breath',
        damageMult: 2.6,
        damageType: 'fire',
        cooldownSec: 16,
        description: 'A cone of roaring flame engulfing all before it.',
        save: { ability: 'dexterity', description: 'DEX save for half damage, or be frightened.' },
        condition: { type: 'frightened', durationTurns: 2 },
      },
    ],
  },

  // ── Aberration (boss) ──────────────────────────────────────────────────────
  {
    id: 'mind_devourer',
    name: 'Mind Devourer',
    description: 'A floating horror of tentacles and psychic hunger.',
    creatureType: 'aberration',
    cr: 8,
    attackType: 'psychic',
    resistances: ['psychic'],
    abilities: [
      {
        id: 'mind_blast',
        name: 'Mind Blast',
        damageMult: 2,
        damageType: 'psychic',
        cooldownSec: 14,
        description: 'A cone of psychic energy that stuns the weak-willed.',
        save: { ability: 'intelligence', description: 'INT save or be stunned.' },
        condition: { type: 'stunned', durationTurns: 1 },
      },
    ],
  },

  // ── Fey ──────────────────────────────────────────────────────────────────────
  {
    id: 'forest_satyr',
    name: 'Forest Satyr',
    description: 'A horned trickster whose enchanted pipes bewitch the unwary.',
    creatureType: 'fey',
    cr: 1,
    attackType: 'piercing',
    abilities: [
      {
        id: 'beguiling_pipes',
        name: 'Beguiling Pipes',
        damageMult: 0,
        damageType: 'psychic',
        cooldownSec: 14,
        description: 'A hypnotic melody that charms the target into lowering its guard.',
        save: { ability: 'wisdom', description: 'WIS save or be charmed.' },
        condition: { type: 'charmed', durationTurns: 1 },
      },
    ],
  },
  {
    id: 'will_o_wisp',
    name: "Will-o'-Wisp",
    description: 'A drifting mote of cold light that lures travellers to their doom.',
    creatureType: 'undead',
    cr: 2,
    attackType: 'radiant',
    immunities: ['poison', 'necrotic'],
    resistances: ['bludgeoning', 'piercing', 'slashing'],
    abilities: [
      {
        id: 'blinding_flare',
        name: 'Blinding Flare',
        damageMult: 1.4,
        damageType: 'radiant',
        cooldownSec: 11,
        description: 'A sudden burst of searing light that sears the eyes.',
        save: { ability: 'constitution', description: 'CON save for half damage, or be blinded.' },
        condition: { type: 'blinded', durationTurns: 2 },
      },
    ],
  },

  // ════════════════════════════════════════════════════════════════════════════
  // Dungeon nestvůry (sjednocení enemy modelu, ADR 0043) — dříve inline v
  // `dungeons.ts`. Identita (creatureType / attackType / obrany) žije ZDE; dungeon
  // je referencuje a dodá jen kontext (level/swing/armor/isBoss). CR je referenční
  // (pro bestiář); v dungeonu se magnituda odvozuje z content levelu (group.ts).
  // Typy/obrany jsou převzaty 1:1 z původních inline dat → balanc beze změny
  // (dosud netypovaní dostali *fyzický* attackType = mechanicky inertní vůči
  // default 'bludgeoning'; viz `attackDamageType` v combat.ts).
  // ════════════════════════════════════════════════════════════════════════════

  // ── Emberfire Chasm (3–5) ────────────────────────────────────────────────────
  {
    id: 'rfc_cultist',
    name: 'Ember Cultist',
    description: 'A robed Ember Cult initiate wielding a ritual blade.',
    creatureType: 'humanoid',
    cr: 1,
    attackType: 'slashing',
  },
  {
    id: 'rfc_warlock',
    name: 'Earthborer Warlock',
    description: 'A cult spellweaver channeling the heat of the deep earth.',
    creatureType: 'humanoid',
    cr: 1,
    attackType: 'bludgeoning',
    abilities: [
      {
        id: 'rfc_warlock_grasp',
        name: 'Earthen Grasp',
        damageMult: 1.4,
        damageType: 'bludgeoning',
        cooldownSec: 12,
        description: 'Stone hands erupt from the floor to clamp the target in place.',
        save: { ability: 'strength', description: 'STR save for half damage, or be restrained.' },
        condition: { type: 'restrained', durationTurns: 2 },
      },
    ],
  },
  {
    id: 'rfc_taragaman',
    name: 'Tarrakal the Hungerer',
    description: 'A bloated fiend summoned to gorge on the warren below Karngar.',
    creatureType: 'fiend',
    cr: 3,
    attackType: 'slashing',
    abilities: [
      {
        id: 'rfc_taragaman_inferno',
        name: 'Gorging Inferno',
        damageMult: 1.7,
        damageType: 'fire',
        cooldownSec: 11,
        description: 'Belches a gout of hungry flame that sears the soul.',
        save: { ability: 'dexterity', description: 'DEX save for half damage, or be frightened.' },
        condition: { type: 'frightened', durationTurns: 2 },
      },
    ],
  },

  // ── The Drowned Mines (6–7) ──────────────────────────────────────────────────
  {
    id: 'dm_miner',
    name: 'Ashen Hand Overseer',
    description: 'A brutal taskmaster driving the shipyard work crews.',
    creatureType: 'humanoid',
    cr: 2,
    attackType: 'slashing',
  },
  {
    id: 'dm_evoker',
    name: 'Ashen Hand Evoker',
    description: 'A goblin technician crackling with unstable energy.',
    creatureType: 'humanoid',
    cr: 2,
    attackType: 'bludgeoning',
  },
  {
    id: 'dm_rhahkzor',
    name: 'Rahkzor',
    description: 'A hulking ogre foreman swinging a stone maul.',
    creatureType: 'giant',
    cr: 3,
    attackType: 'bludgeoning',
    abilities: [
      {
        id: 'dm_rhahkzor_smash',
        name: 'Maul Smash',
        damageMult: 1.5,
        damageType: 'bludgeoning',
        cooldownSec: 11,
        description: 'An overhead maul blow that hammers the target to the ground.',
        save: { ability: 'strength', description: 'STR save for half damage, or be knocked prone.' },
        condition: { type: 'prone', durationTurns: 1 },
      },
    ],
  },
  {
    id: 'dm_vancleef',
    name: 'Edmund Vance',
    description: 'The exiled architect turned brigand-lord of the Ashen Hand.',
    creatureType: 'humanoid',
    cr: 4,
    attackType: 'slashing',
    abilities: [
      {
        id: 'dm_vancleef_backhand',
        name: 'Brutal Backhand',
        damageMult: 1.6,
        damageType: 'bludgeoning',
        cooldownSec: 10,
        description: 'A crushing pommel strike that sends the target sprawling.',
        save: { ability: 'strength', description: 'STR save or be knocked prone.' },
        condition: { type: 'prone', durationTurns: 1 },
      },
    ],
  },

  // ── Wailing Hollows (6–8) ────────────────────────────────────────────────────
  {
    id: 'wc_adder',
    name: 'Deviate Adder',
    description: 'A mutated serpent warped by the nightmare seeping through the caverns.',
    creatureType: 'beast',
    cr: 2,
    attackType: 'piercing',
  },
  {
    id: 'wc_druid',
    name: 'Fang Warden',
    description: 'A fallen druid bound to the nightmare-dreaming Naralen.',
    creatureType: 'humanoid',
    cr: 2,
    attackType: 'bludgeoning',
  },
  {
    id: 'wc_serpent',
    name: 'Deviate Ravager',
    description: 'A monstrous serpent grown vast on tainted prey.',
    creatureType: 'beast',
    cr: 3,
    attackType: 'piercing',
    abilities: [
      {
        id: 'wc_serpent_spray',
        name: 'Venom Spray',
        damageMult: 1.4,
        damageType: 'poison',
        cooldownSec: 11,
        description: 'A spray of tainted venom that burns and sickens.',
        save: { ability: 'constitution', description: 'CON save for half damage, or be poisoned.' },
        condition: { type: 'poisoned', durationTurns: 2 },
      },
    ],
  },
  {
    id: 'wc_mutanus',
    name: 'Mutanis the Devourer',
    description: 'The nightmare made flesh, a ravenous murloc horror.',
    creatureType: 'aberration',
    cr: 4,
    attackType: 'bludgeoning',
    abilities: [
      {
        id: 'wc_mutanus_shriek',
        name: 'Nightmare Shriek',
        damageMult: 1.6,
        damageType: 'psychic',
        cooldownSec: 12,
        description: 'A mind-rending scream dredged from the deep nightmare.',
        save: { ability: 'wisdom', description: 'WIS save for half damage, or be frightened.' },
        condition: { type: 'frightened', durationTurns: 2 },
      },
    ],
  },

  // ── Shadowmaw Keep (7–9) ─────────────────────────────────────────────────────
  {
    id: 'sfk_worgen',
    name: 'Shadowmaw Moonwalker',
    description: 'A cursed lycan prowling the moonlit halls.',
    creatureType: 'monstrosity',
    cr: 3,
    attackType: 'slashing',
  },
  {
    id: 'sfk_ghost',
    name: 'Tormented Officer',
    description: 'The restless spirit of a slain garrison officer.',
    creatureType: 'undead',
    cr: 3,
    attackType: 'slashing',
    abilities: [
      {
        id: 'sfk_ghost_wail',
        name: 'Mournful Wail',
        damageMult: 1.3,
        damageType: 'psychic',
        cooldownSec: 12,
        description: 'A grief-stricken howl that fills the heart with dread.',
        save: { ability: 'wisdom', description: 'WIS save for half damage, or be frightened.' },
        condition: { type: 'frightened', durationTurns: 2 },
      },
    ],
  },
  {
    id: 'sfk_fenrus',
    name: 'Fenris the Devourer',
    description: "Archmage Argol's monstrous lycan champion.",
    creatureType: 'monstrosity',
    cr: 4,
    attackType: 'piercing',
  },
  {
    id: 'sfk_arugal',
    name: 'Archmage Argol',
    description: 'The mad archmage who loosed the curse upon the keep.',
    creatureType: 'humanoid',
    cr: 5,
    attackType: 'bludgeoning',
    abilities: [
      {
        id: 'sfk_arugal_shadowbolt',
        name: 'Shadow Bolt',
        damageMult: 1.7,
        damageType: 'necrotic',
        cooldownSec: 11,
        description: 'A bolt of clinging shadow that saps the limbs.',
        save: { ability: 'constitution', description: 'CON save for half damage, or be slowed.' },
        condition: { type: 'slowed', durationTurns: 2 },
      },
    ],
  },

  // ── Drownfathom Deeps (8–10) ─────────────────────────────────────────────────
  {
    id: 'bfd_acolyte',
    name: 'Dusk Acolyte',
    description: 'A devotee of the drowned moon temple.',
    creatureType: 'humanoid',
    cr: 3,
    attackType: 'bludgeoning',
  },
  {
    id: 'bfd_naga',
    name: 'Akhumai Servant',
    description: 'A naga thrall guarding the flooded sanctum.',
    creatureType: 'monstrosity',
    cr: 3,
    attackType: 'piercing',
  },
  {
    id: 'bfd_priestess',
    name: 'Dusk Priestess',
    description: 'A high priestess channeling the drowned goddess.',
    creatureType: 'humanoid',
    cr: 4,
    attackType: 'bludgeoning',
    abilities: [
      {
        id: 'bfd_priestess_grasp',
        name: 'Drowning Grasp',
        damageMult: 1.4,
        damageType: 'cold',
        cooldownSec: 12,
        description: 'Spectral tides coil around the target and drag them under.',
        save: { ability: 'constitution', description: 'CON save for half damage, or be restrained.' },
        condition: { type: 'restrained', durationTurns: 2 },
      },
    ],
  },
  {
    id: 'bfd_akumai',
    name: 'Akhumai',
    description: 'The slumbering beast roused beneath the temple.',
    creatureType: 'monstrosity',
    cr: 5,
    attackType: 'bludgeoning',
    abilities: [
      {
        id: 'bfd_akumai_tail',
        name: 'Crushing Tail',
        damageMult: 1.6,
        damageType: 'bludgeoning',
        cooldownSec: 10,
        description: 'A sweeping tail-slam that bowls the target over.',
        save: { ability: 'strength', description: 'STR save or be knocked prone.' },
        condition: { type: 'prone', durationTurns: 1 },
      },
    ],
  },

  // ── Crimson Cloister (10–13) ─────────────────────────────────────────────────
  {
    id: 'sm_zealot',
    name: 'Crimson Zealot',
    description: 'A fanatic of the Crimson Tribunal, sworn to purge the unclean.',
    creatureType: 'humanoid',
    cr: 4,
    attackType: 'slashing',
  },
  {
    id: 'sm_monk',
    name: 'Crimson Monk',
    description: 'A martial ascetic of the Tribunal cloister.',
    creatureType: 'humanoid',
    cr: 4,
    attackType: 'bludgeoning',
    abilities: [
      {
        id: 'sm_monk_palm',
        name: 'Stunning Palm',
        damageMult: 1.4,
        damageType: 'bludgeoning',
        cooldownSec: 13,
        description: 'A precise strike to a pressure point that locks the body rigid.',
        save: { ability: 'constitution', description: 'CON save for half damage, or be stunned.' },
        condition: { type: 'stunned', durationTurns: 1 },
      },
    ],
  },
  {
    id: 'sm_herod',
    name: 'Herrod the Champion',
    description: 'The Tribunal\'s armored champion-at-arms.',
    creatureType: 'humanoid',
    cr: 5,
    attackType: 'slashing',
  },
  {
    id: 'sm_whitemane',
    name: 'High Inquisitor Palevane',
    description: 'The zealous inquisitor who leads the Crimson Tribunal.',
    creatureType: 'humanoid',
    cr: 6,
    attackType: 'bludgeoning',
    abilities: [
      {
        id: 'sm_whitemane_slumber',
        name: 'Deep Slumber',
        damageMult: 1.5,
        damageType: 'psychic',
        cooldownSec: 13,
        description: 'A word of binding sleep that locks the body rigid.',
        save: { ability: 'wisdom', description: 'WIS save for half damage, or be stunned.' },
        condition: { type: 'stunned', durationTurns: 1 },
      },
    ],
  },

  // ── Zarfarai (14–16) — typed (necrotic / poison / radiant) ───────────────────
  {
    id: 'zf_axethrower',
    name: 'Dunescale Axe Thrower',
    description: 'A Dunescale troll skirmisher hurling jagged axes.',
    creatureType: 'humanoid',
    cr: 7,
    attackType: 'slashing',
  },
  {
    id: 'zf_hoodoo',
    name: 'Dunescale Hoodoo Priest',
    description: 'A troll witch-doctor weaving necrotic hexes.',
    creatureType: 'humanoid',
    cr: 7,
    attackType: 'necrotic',
    resistances: ['necrotic'],
    abilities: [
      {
        id: 'zf_hoodoo_curse',
        name: 'Voodoo Curse',
        damageMult: 1.3,
        damageType: 'necrotic',
        cooldownSec: 13,
        description: "A hex that bends the target's will to the witch-doctor.",
        save: { ability: 'wisdom', description: 'WIS save for half damage, or be charmed.' },
        condition: { type: 'charmed', durationTurns: 1 },
      },
    ],
  },
  {
    id: 'zf_gahzrilla',
    name: 'Gazrilla',
    description: 'A colossal venomous serpent worshipped as a god.',
    creatureType: 'monstrosity',
    cr: 8,
    attackType: 'poison',
    resistances: ['poison'],
  },
  {
    id: 'zf_ukorz',
    name: 'Chief Ukor Dunescalp',
    description: 'The blood-soaked warchief of the Dunescale trolls.',
    creatureType: 'humanoid',
    cr: 9,
    attackType: 'slashing',
    vulnerabilities: ['radiant'],
    abilities: [
      {
        id: 'zf_ukorz_hamstring',
        name: 'Hamstring',
        damageMult: 1.6,
        damageType: 'slashing',
        cooldownSec: 10,
        description: 'A vicious low cut that leaves the target unable to move.',
        save: { ability: 'strength', description: 'STR save or be restrained.' },
        condition: { type: 'restrained', durationTurns: 2 },
      },
    ],
  },

  // ── Maradoth (15–17) — typed (nature: resist physical, vuln fire) ────────────
  {
    id: 'mar_noxxion',
    name: 'Noxxion Spawn',
    description: 'A toxic ooze-spawn of the poisoned demigod.',
    creatureType: 'ooze',
    cr: 8,
    attackType: 'poison',
    resistances: ['poison'],
    vulnerabilities: ['fire'],
  },
  {
    id: 'mar_treant',
    name: 'Corrupted Treant',
    description: 'A wrathful tree-guardian twisted by the cavern\'s poison.',
    creatureType: 'plant',
    cr: 8,
    attackType: 'bludgeoning',
    resistances: ['bludgeoning', 'piercing'],
    vulnerabilities: ['fire'],
  },
  {
    id: 'mar_landslide',
    name: 'Landslide',
    description: 'A churning elemental of stone and crystal.',
    creatureType: 'elemental',
    cr: 9,
    attackType: 'bludgeoning',
    resistances: ['slashing', 'piercing', 'bludgeoning'],
    abilities: [
      {
        id: 'mar_landslide_quake',
        name: 'Grinding Quake',
        damageMult: 1.4,
        damageType: 'bludgeoning',
        cooldownSec: 12,
        description: 'The ground churns and buckles, miring the target in shifting rubble.',
        save: { ability: 'dexterity', description: 'DEX save for half damage, or be slowed.' },
        condition: { type: 'slowed', durationTurns: 2 },
      },
    ],
  },
  {
    id: 'mar_theradras',
    name: 'Princess Theradris',
    description: 'The crystalline daughter of an earth elemental and a demigod.',
    creatureType: 'elemental',
    cr: 10,
    attackType: 'poison',
    vulnerabilities: ['fire'],
    abilities: [
      {
        id: 'mar_theradras_spores',
        name: 'Noxious Spores',
        damageMult: 1.5,
        damageType: 'poison',
        cooldownSec: 12,
        description: 'A cloud of choking spores that dulls the senses.',
        save: { ability: 'constitution', description: 'CON save for half damage, or be slowed.' },
        condition: { type: 'slowed', durationTurns: 2 },
      },
    ],
  },

  // ── Cinderdeep Halls (17–19) — typed (fire dwellers: resist fire) ────────────
  {
    id: 'brd_guard',
    name: 'Anvilrage Guardsman',
    description: 'A Cinderforge dwarf soldier in blackened plate.',
    creatureType: 'humanoid',
    cr: 9,
    attackType: 'slashing',
  },
  {
    id: 'brd_geologist',
    name: 'Cinderforge Geologist',
    description: 'A dwarf delver hardened against the forge\'s heat.',
    creatureType: 'humanoid',
    cr: 9,
    attackType: 'bludgeoning',
    resistances: ['fire'],
  },
  {
    id: 'brd_angerforge',
    name: 'General Emberforge',
    description: 'The fire-wreathed war general of the Cinderforge legion.',
    creatureType: 'humanoid',
    cr: 10,
    attackType: 'fire',
    resistances: ['fire'],
    abilities: [
      {
        id: 'brd_angerforge_cinders',
        name: 'Searing Cinders',
        damageMult: 1.4,
        damageType: 'fire',
        cooldownSec: 12,
        description: 'A burst of scalding ash and sparks that sears the eyes.',
        save: { ability: 'dexterity', description: 'DEX save for half damage, or be blinded.' },
        condition: { type: 'blinded', durationTurns: 2 },
      },
    ],
  },
  {
    id: 'brd_thaurissan',
    name: 'Emperor Dagran Embermane',
    description: 'The emperor of the Cinderforge dwarves, lord of forge and flame.',
    creatureType: 'humanoid',
    cr: 12,
    attackType: 'fire',
    resistances: ['fire'],
    abilities: [
      {
        id: 'brd_thaurissan_eruption',
        name: 'Molten Eruption',
        damageMult: 1.8,
        damageType: 'fire',
        cooldownSec: 12,
        description: 'The floor bursts into molten rock, hurling the target down.',
        save: { ability: 'dexterity', description: 'DEX save for half damage, or be knocked prone.' },
        condition: { type: 'prone', durationTurns: 1 },
      },
    ],
  },

  // ── Pyrehold (19–20) — typed (undead: immune poison, resist necrotic, vuln radiant) ─
  {
    id: 'strat_zombie',
    name: 'Plagued Zombie',
    description: 'A shambling victim of the Pale Legion\'s plague.',
    creatureType: 'undead',
    cr: 10,
    attackType: 'necrotic',
    resistances: ['necrotic'],
    immunities: ['poison'],
    vulnerabilities: ['radiant'],
  },
  {
    id: 'strat_cryptfiend',
    name: 'Crypt Fiend',
    description: 'A skittering undead horror of barbed legs.',
    creatureType: 'undead',
    cr: 11,
    attackType: 'piercing',
    resistances: ['necrotic'],
    vulnerabilities: ['radiant'],
    abilities: [
      {
        id: 'strat_cryptfiend_web',
        name: 'Crypt Web',
        damageMult: 1.3,
        damageType: 'piercing',
        cooldownSec: 12,
        description: 'A spray of barbed webbing that pins the target fast.',
        save: { ability: 'dexterity', description: 'DEX save for half damage, or be restrained.' },
        condition: { type: 'restrained', durationTurns: 2 },
      },
    ],
  },
  {
    id: 'strat_ramstein',
    name: 'Ramstein the Gorger',
    description: 'A towering flesh-golem stitched from plague victims.',
    creatureType: 'undead',
    cr: 12,
    attackType: 'bludgeoning',
    resistances: ['necrotic'],
    vulnerabilities: ['radiant', 'fire'],
  },
  {
    id: 'strat_baron',
    name: 'Baron Ravendere',
    description: 'The dreadlord-served baron ruling the plagued city of Caldmoor.',
    creatureType: 'fiend',
    cr: 14,
    attackType: 'necrotic',
    resistances: ['necrotic', 'fire'],
    vulnerabilities: ['radiant'],
    abilities: [
      {
        id: 'strat_baron_deathcoil',
        name: 'Death Coil',
        damageMult: 1.7,
        damageType: 'necrotic',
        cooldownSec: 11,
        description: 'A whip of deathly energy that fills the heart with dread.',
        save: { ability: 'wisdom', description: 'WIS save for half damage, or be frightened.' },
        condition: { type: 'frightened', durationTurns: 2 },
      },
    ],
  },

  // ── Bestiary expansion — The Caldmoor Reaches (fills thin creature types) ────
  // Celestial — radiant servitors of the Dawnhollow light, bound or corrupted by
  // the blight that seeps across the Reaches.
  {
    id: 'votive_cherub',
    name: 'Votive Cherub',
    description: 'A minor celestial bound to a shrine-lantern, its light soured by the blight.',
    creatureType: 'celestial',
    cr: 2,
    attackType: 'radiant',
    resistances: ['radiant', 'fire'],
    vulnerabilities: ['necrotic'],
    abilities: [
      {
        id: 'votive_searing_glare',
        name: 'Searing Glare',
        damageMult: 1.5,
        damageType: 'radiant',
        cooldownSec: 9,
        description: 'A burst of holy light that sears the eyes.',
        save: { ability: 'dexterity', description: 'DEX save for half damage, or be blinded.' },
        condition: { type: 'blinded', durationTurns: 1 },
      },
    ],
  },
  {
    id: 'fallen_seraph',
    name: 'Fallen Seraph',
    description: 'A once-radiant guardian of the Vale, now a wrathful husk wreathed in cold fire.',
    creatureType: 'celestial',
    cr: 9,
    attackType: 'radiant',
    resistances: ['radiant', 'fire', 'cold'],
    vulnerabilities: ['necrotic'],
    abilities: [
      {
        id: 'fallen_judgment',
        name: 'Searing Judgment',
        damageMult: 1.7,
        damageType: 'radiant',
        cooldownSec: 11,
        description: 'A pillar of accusing light that withers the unworthy.',
        save: { ability: 'wisdom', description: 'WIS save for half damage, or be frightened.' },
        condition: { type: 'frightened', durationTurns: 2 },
      },
    ],
  },

  // Construct — clockwork wardens and blight-wrought golems of the deep workshops.
  {
    id: 'clockwork_sentinel',
    name: 'Clockwork Sentinel',
    description: 'A tireless brass automaton still guarding ruins its makers long abandoned.',
    creatureType: 'construct',
    cr: 2,
    attackType: 'bludgeoning',
    immunities: ['poison', 'psychic'],
    resistances: ['necrotic'],
    vulnerabilities: ['lightning'],
  },
  {
    id: 'blight_golem',
    name: 'Blight-Wrought Golem',
    description: 'A hulking effigy packed with rotting matter, leaking toxic sludge with every step.',
    creatureType: 'construct',
    cr: 6,
    attackType: 'bludgeoning',
    immunities: ['poison', 'necrotic'],
    vulnerabilities: ['fire'],
    abilities: [
      {
        id: 'blight_slam',
        name: 'Blight Slam',
        damageMult: 1.6,
        damageType: 'poison',
        cooldownSec: 10,
        description: 'A reeking fist that splatters caustic blight on impact.',
        save: { ability: 'constitution', description: 'CON save for half damage, or be poisoned.' },
        condition: { type: 'poisoned', durationTurns: 2 },
      },
    ],
  },

  // Dragon — a white wyrm denning in the frost-bitten northern Reaches.
  {
    id: 'young_white_dragon',
    name: 'Young White Dragon',
    description: 'A vicious frost wyrm that drags prey back to its glacial lair.',
    creatureType: 'dragon',
    cr: 6,
    attackType: 'piercing',
    immunities: ['cold'],
    vulnerabilities: ['fire'],
    isBoss: true,
    abilities: [
      {
        id: 'white_frost_breath',
        name: 'Cone of Frost',
        damageMult: 1.8,
        damageType: 'cold',
        cooldownSec: 12,
        description: 'A roaring exhalation of killing cold.',
        save: { ability: 'constitution', description: 'CON save for half damage, or be slowed.' },
        condition: { type: 'slowed', durationTurns: 2 },
      },
    ],
  },

  // Fey — capricious spirits of the bramble-choked wilds.
  {
    id: 'caldmoor_pixie',
    name: 'Caldmoor Pixie',
    description: 'A flickering wild fey that scatters beguiling dust to lead travellers astray.',
    creatureType: 'fey',
    cr: 0.5,
    attackType: 'psychic',
    abilities: [
      {
        id: 'beguiling_dust',
        name: 'Beguiling Dust',
        damageMult: 0,
        damageType: 'psychic',
        cooldownSec: 10,
        description: 'A puff of enchanted dust that bends the mind — no harm, but bewitching.',
        save: { ability: 'wisdom', description: 'WIS save or be charmed.' },
        condition: { type: 'charmed', durationTurns: 1 },
      },
    ],
  },
  {
    id: 'briar_hag',
    name: 'Briar Hag',
    description: 'A crone of the thornwood who lashes intruders with living bramble.',
    creatureType: 'fey',
    cr: 5,
    attackType: 'slashing',
    resistances: ['cold', 'poison'],
    abilities: [
      {
        id: 'briar_snare',
        name: 'Bramble Snare',
        damageMult: 1.5,
        damageType: 'piercing',
        cooldownSec: 10,
        description: 'Whipping thorns that bind and tear at the same time.',
        save: { ability: 'strength', description: 'STR save for half damage, or be restrained.' },
        condition: { type: 'restrained', durationTurns: 2 },
      },
    ],
  },

  // Ooze — a creeping acidic horror from the flooded undercity.
  {
    id: 'caustic_pudding',
    name: 'Caustic Pudding',
    description: 'A slick black ooze that dissolves whatever it engulfs.',
    creatureType: 'ooze',
    cr: 2,
    attackType: 'acid',
    immunities: ['acid'],
    resistances: ['lightning', 'slashing'],
    abilities: [
      {
        id: 'pudding_dissolve',
        name: 'Dissolving Engulf',
        kind: 'dot',
        damageMult: 1.3,
        damageType: 'acid',
        cooldownSec: 11,
        dotDurationSec: 8,
        dotTicks: 4,
        dotDice: { count: 1, sides: 6, bonus: 0 },
        description: 'Smothers its prey in acid that keeps eating away after contact.',
      },
    ],
  },

  // ── Bestiary expansion II — more Caldmoor Reaches creatures ──────────────────
  // Low-CR beasts of the blighted wilds (early-game variety).
  {
    id: 'carrion_crow_flock',
    name: 'Carrion Crow Flock',
    description: 'A shrieking murder of crows that descends on the wounded and the dead alike.',
    creatureType: 'beast',
    cr: 0.25,
    attackType: 'piercing',
  },
  {
    id: 'blightfen_rat_swarm',
    name: 'Blightfen Rat Swarm',
    description: 'A seething tide of plague-slick rats boiling out of the fen.',
    creatureType: 'beast',
    cr: 0.5,
    attackType: 'piercing',
    resistances: ['poison'],
    abilities: [
      {
        id: 'rat_plague_bite',
        name: 'Plague Bite',
        kind: 'dot',
        damageMult: 1.2,
        damageType: 'poison',
        cooldownSec: 9,
        dotDurationSec: 6,
        dotTicks: 3,
        dotDice: { count: 1, sides: 4, bonus: 0 },
        description: 'A filthy bite that festers with sickness.',
        save: { ability: 'constitution', description: 'CON save for half damage, or be poisoned.' },
        condition: { type: 'poisoned', durationTurns: 2 },
      },
    ],
  },
  {
    id: 'caldmoor_dire_bear',
    name: 'Caldmoor Dire Bear',
    description: 'A massive, scarred bruin driven to fury by the blight in its veins.',
    creatureType: 'beast',
    cr: 3,
    attackType: 'slashing',
  },

  // Construct — a lesser warden to pair with the deep-workshop golems.
  {
    id: 'animated_armor',
    name: 'Animated Armor',
    description: 'An empty suit of plate that clanks to life when its hall is disturbed.',
    creatureType: 'construct',
    cr: 1,
    attackType: 'slashing',
    immunities: ['poison', 'psychic'],
  },

  // Dragon — an acid wyrm lurking in the drowned undercity.
  {
    id: 'young_black_dragon',
    name: 'Young Black Dragon',
    description: 'A cruel reptile that lairs in flooded ruins, melting prey with caustic breath.',
    creatureType: 'dragon',
    cr: 7,
    attackType: 'piercing',
    immunities: ['acid'],
    isBoss: true,
    abilities: [
      {
        id: 'black_acid_breath',
        name: 'Acid Breath',
        damageMult: 1.8,
        damageType: 'acid',
        cooldownSec: 12,
        description: 'A line of hissing acid that blinds and burns.',
        save: { ability: 'dexterity', description: 'DEX save for half damage, or be blinded.' },
        condition: { type: 'blinded', durationTurns: 1 },
      },
    ],
  },

  // Elemental — storm and mire spirits stirred up by the blight.
  {
    id: 'storm_wisp',
    name: 'Storm Wisp',
    description: 'A crackling mote of living lightning that darts and stings.',
    creatureType: 'elemental',
    cr: 3,
    attackType: 'lightning',
    immunities: ['lightning'],
    resistances: ['thunder'],
    abilities: [
      {
        id: 'storm_arc',
        name: 'Stunning Arc',
        damageMult: 1.6,
        damageType: 'lightning',
        cooldownSec: 11,
        description: 'A forking jolt that locks the muscles.',
        save: { ability: 'constitution', description: 'CON save for half damage, or be stunned.' },
        condition: { type: 'stunned', durationTurns: 1 },
      },
    ],
  },
  {
    id: 'mire_elemental',
    name: 'Mire Elemental',
    description: 'A lumbering mass of animate bog that drags victims down into the muck.',
    creatureType: 'elemental',
    cr: 4,
    attackType: 'bludgeoning',
    resistances: ['acid', 'poison'],
    abilities: [
      {
        id: 'mire_engulf',
        name: 'Engulfing Mud',
        damageMult: 1.5,
        damageType: 'bludgeoning',
        cooldownSec: 10,
        description: 'A wave of clinging mud that pins the prey in place.',
        save: { ability: 'strength', description: 'STR save for half damage, or be restrained.' },
        condition: { type: 'restrained', durationTurns: 2 },
      },
    ],
  },

  // Fiend — a tormenting imp from the Baron's service.
  {
    id: 'imp_tormentor',
    name: 'Imp Tormentor',
    description: 'A spiteful little devil that flits about, jabbing with a fire-wreathed tail.',
    creatureType: 'fiend',
    cr: 2,
    attackType: 'fire',
    resistances: ['fire'],
    vulnerabilities: ['radiant'],
  },

  // Giant — a frost giant raider from the northern Reaches.
  {
    id: 'frost_giant_reaver',
    name: 'Frost Giant Reaver',
    description: 'A towering raider whose greataxe falls like an avalanche.',
    creatureType: 'giant',
    cr: 8,
    attackType: 'slashing',
    resistances: ['cold'],
    abilities: [
      {
        id: 'reaver_crushing_blow',
        name: 'Crushing Blow',
        damageMult: 1.7,
        damageType: 'bludgeoning',
        cooldownSec: 11,
        description: 'A two-handed smash that hammers the target to the ground.',
        save: { ability: 'strength', description: 'STR save for half damage, or be knocked prone.' },
        condition: { type: 'prone', durationTurns: 1 },
      },
    ],
  },

  // Monstrosity — a stone-skinned sentinel perched among the ruins.
  {
    id: 'gargoyle_sentinel',
    name: 'Gargoyle Sentinel',
    description: 'A leering stone watcher that holds perfectly still until prey draws near.',
    creatureType: 'monstrosity',
    cr: 2,
    attackType: 'slashing',
    resistances: ['bludgeoning', 'piercing', 'slashing'],
  },

  // Plant — a thorny horror of the strangling thornwood.
  {
    id: 'bramble_horror',
    name: 'Bramble Horror',
    description: 'A shambling knot of animate thorn-vine that drags itself toward warmth.',
    creatureType: 'plant',
    cr: 3,
    attackType: 'piercing',
    vulnerabilities: ['fire'],
    resistances: ['piercing'],
    abilities: [
      {
        id: 'bramble_lash',
        name: 'Thorn Lash',
        damageMult: 1.4,
        damageType: 'piercing',
        cooldownSec: 9,
        description: 'A whipping coil of thorns that wraps and holds.',
        save: { ability: 'strength', description: 'STR save for half damage, or be restrained.' },
        condition: { type: 'restrained', durationTurns: 2 },
      },
    ],
  },

  // Aberration — a creeping gloom that gnaws at the mind.
  {
    id: 'gloom_lurker',
    name: 'Gloom Lurker',
    description: 'A formless dark that whispers terrors into the minds of the living.',
    creatureType: 'aberration',
    cr: 4,
    attackType: 'psychic',
    resistances: ['cold', 'necrotic'],
    abilities: [
      {
        id: 'gloom_dread_whisper',
        name: 'Dread Whisper',
        damageMult: 1.5,
        damageType: 'psychic',
        cooldownSec: 10,
        description: 'A chorus of alien whispers that floods the heart with terror.',
        save: { ability: 'wisdom', description: 'WIS save for half damage, or be frightened.' },
        condition: { type: 'frightened', durationTurns: 2 },
      },
    ],
  },

  // Ooze — a transparent cube that engulfs whatever it drifts into.
  {
    id: 'gelatinous_cube',
    name: 'Gelatinous Cube',
    description: 'A near-invisible cube of acid that slides down corridors, dissolving all it meets.',
    creatureType: 'ooze',
    cr: 2,
    attackType: 'acid',
    immunities: ['acid'],
    abilities: [
      {
        id: 'cube_engulf',
        name: 'Engulf',
        damageMult: 1.5,
        damageType: 'acid',
        cooldownSec: 11,
        description: 'Slides over its prey and traps it in suffocating jelly.',
        save: { ability: 'dexterity', description: 'DEX save for half damage, or be restrained.' },
        condition: { type: 'restrained', durationTurns: 2 },
      },
    ],
  },
];

/** Bestiář indexovaný podle id. */
export const BESTIARY: Record<string, EnemyTemplate> = Object.fromEntries(
  TEMPLATES.map((t) => [t.id, t]),
);

export const BESTIARY_IDS: readonly string[] = TEMPLATES.map((t) => t.id);

/** Šablona nestvůry podle id (nebo `undefined`). */
export function getEnemyTemplate(id: string): EnemyTemplate | undefined {
  return BESTIARY[id];
}

/** Nestvůry daného creature typu. */
export function enemiesByCreatureType(type: CreatureType): EnemyTemplate[] {
  return TEMPLATES.filter((t) => t.creatureType === type);
}

/** Nestvůry daného CR. */
export function enemiesByChallengeRating(cr: ChallengeRating): EnemyTemplate[] {
  return TEMPLATES.filter((t) => t.cr === cr);
}

/**
 * Kandidátní šablony nestvůr nejblíže cílovému CR — pro **procedurální obsah**
 * (Gauntlet vlny, grind „Gone Questing"), který tahá nepřátele **z celého
 * katalogu automaticky dle CR** místo curated seznamů. Vrací `limit` id
 * seřazených dle vzdálenosti CR (shoda → dle id, determinismus). `includeBoss`
 * přidá i boss šablony (default vynechány — bossové nejsou běžný trash).
 *
 * Magnitudu (HP/dmg) si volající dál řídí sám (z vlny/levelu) — šablona dává jen
 * **identitu** (jméno, creature type, typové obrany, ability). CR tu slouží jen
 * k výběru tematicky/úrovňově vhodných nestvůr.
 */
export function enemyTemplatesNearCr(
  targetCr: number,
  opts: { includeBoss?: boolean; limit?: number } = {},
): string[] {
  const limit = Math.max(1, opts.limit ?? 8);
  const includeBoss = opts.includeBoss ?? false;
  return [...TEMPLATES]
    .filter((t) => includeBoss || !t.isBoss)
    .sort(
      (a, b) =>
        Math.abs(a.cr - targetCr) - Math.abs(b.cr - targetCr) || a.id.localeCompare(b.id),
    )
    .slice(0, limit)
    .map((t) => t.id);
}

// ── Builder → EnemyStats (combat) ────────────────────────────────────────────

/**
 * Převede katalogovou `EnemyAbility` na `SignatureAbility` (formát, který čte
 * combat engine) — „Enemy schopnosti", napojení do enginu. Enemy ability =
 * `kind: 'strike'` s `damageMult` (škáluje přes attackPower nepřítele) a
 * `damageType` (typové poškození → MR-7 obrany hráče); `save` se mapuje na
 * `effect: 'half'` (úspěch = poloviční poškození). `condition` (Slice 2a) se
 * propíše 1:1 → neúspěšný save uvalí status efekt (stun/prone/…).
 */
export function enemyAbilityToSignature(a: EnemyAbility): SignatureAbility {
  return {
    id: a.id,
    name: a.name,
    description: a.description,
    kind: a.kind ?? 'strike',
    cooldownSec: a.cooldownSec,
    damageMult: a.damageMult,
    damageType: a.damageType,
    ...(a.save ? { save: { ability: a.save.ability, effect: 'half' as const } } : {}),
    ...(a.condition ? { condition: a.condition } : {}),
    ...(a.drainHealFraction !== undefined ? { drainHealFraction: a.drainHealFraction } : {}),
    ...(a.dotDurationSec !== undefined ? { dotDurationSec: a.dotDurationSec } : {}),
    ...(a.dotTicks !== undefined ? { dotTicks: a.dotTicks } : {}),
    ...(a.dotTickMult !== undefined ? { dotTickMult: a.dotTickMult } : {}),
    ...(a.dotDice !== undefined ? { dotDice: a.dotDice } : {}),
  };
}

/** Volitelný přepis statů při instanciaci (např. scale pro idle balanc). */
export interface BestiaryEnemyOverrides {
  maxHealth?: number;
  attackPower?: number;
  swingInterval?: number;
  isBoss?: boolean;
}

/**
 * Postaví `EnemyStats` ze šablony bestiáře: HP/poškození z CR doporučení (DMG)
 * nebo z přepisu šablony, AC / attackBonus / spell save DC z `crStatGuide`,
 * damage typ + resistance/vulnerability/immunity propsané do combat aktéra.
 * Boss dostane +2 AC (drobné zpřísnění, plný balanc = MR-10).
 */
export function buildBestiaryEnemy(
  template: EnemyTemplate,
  overrides: BestiaryEnemyOverrides = {},
): EnemyStats & { id: string } {
  const guide = crStatGuide(template.cr);
  const isBoss = overrides.isBoss ?? template.isBoss ?? false;
  return {
    id: template.id,
    name: template.name,
    maxHealth: overrides.maxHealth ?? template.maxHealth ?? guide.hitPoints,
    attackPower: overrides.attackPower ?? template.attackPower ?? guide.damagePerRound,
    swingInterval: overrides.swingInterval ?? template.swingInterval ?? DEFAULT_SWING,
    isBoss,
    armorClass: guide.armorClass + (isBoss ? 2 : 0),
    attackBonus: guide.attackBonus,
    spellSaveDc: guide.saveDc,
    damageType: template.attackType,
    resistances: template.resistances,
    vulnerabilities: template.vulnerabilities,
    immunities: template.immunities,
    signatureAbilities: (template.abilities ?? []).map(enemyAbilityToSignature),
  };
}

/** Postaví `EnemyStats` přímo z id bestiáře (nebo `undefined`, když id neexistuje). */
export function bestiaryEnemyById(
  id: string,
  overrides?: BestiaryEnemyOverrides,
): (EnemyStats & { id: string }) | undefined {
  const template = BESTIARY[id];
  return template ? buildBestiaryEnemy(template, overrides) : undefined;
}

// ── Instancování nepřítele pro obsah (sjednocený resolver, ADR 0043) ──────────

/**
 * Kontextové přepisy při instancování nepřítele z katalogu do konkrétního obsahu
 * (dungeon encounter, quest foe, …). Identita (jméno, typ útoku, obrany,
 * creatureType) plyne ze šablony; tyto přepisy řeší **magnitudu a pacing**.
 */
export interface EnemyInstanceOverrides {
  /** Přepis id instance (default = id šablony). Pro variantní spawn-y (oslabení minioni). */
  id?: string;
  /** Kontextové přejmenování (např. „Ember Acolyte" = oslabená varianta „Ember Cultist"). */
  name?: string;
  /**
   * Úroveň obsahu → CR magnituda (přebíjí `template.cr`). Když je dána, HP/poškození
   * se NEpíšou (odvodí je `buildEnemyActor` z CR). Bez `level`/`challengeRating` se
   * `template.cr` ZÁMĚRNĚ nepřebírá do `EnemyStats` (zůstává jen pro bestiář referenci)
   * → dungeon spadne na svůj content level (group.ts default), balanc beze změny.
   */
  level?: number;
  /** Explicitní CR (přebíjí odvození z `level`). */
  challengeRating?: ChallengeRating;
  /** Swing interval (vteřiny). Default ze šablony, jinak globální default. */
  swingInterval?: number;
  /** Armor (AC nad rámec CR doporučení). */
  armor?: number;
  /** Boss flag (přebíjí `template.isBoss`). */
  isBoss?: boolean;
  /** Explicitní HP (jinak ze CR). */
  maxHealth?: number;
  /** Explicitní poškození na úder (jinak ze CR). */
  attackPower?: number;
}

/**
 * Instancuje nepřítele z katalogu pro konkrétní obsah: **identita** (jméno, typ
 * útoku, resistance/vulnerability/immunity) ze šablony, **magnituda/pacing** z
 * kontextu (`level`/`challengeRating`/`swingInterval`/`armor`/`isBoss`). Vrací
 * `EnemyStats & { id }` (= `EnemyDef`) — stejný tvar, jaký dosud autorovaly
 * dungeony inline, takže downstream (`buildEnemyActor`, group/dungeon-run/…)
 * zůstává beze změny. Jediný zdroj pravdy enemy identity = katalog (ADR 0043).
 *
 * Vyhodí, když `templateId` v katalogu neexistuje (chyba autora dat, ne runtime).
 */
export function instantiateEnemy(
  templateId: string,
  overrides: EnemyInstanceOverrides = {},
): EnemyStats & { id: string } {
  const t = BESTIARY[templateId];
  if (!t) throw new Error(`instantiateEnemy: unknown enemy template "${templateId}"`);
  const o = overrides;
  const isBoss = o.isBoss ?? t.isBoss ?? false;
  return {
    id: o.id ?? t.id,
    templateId: t.id,
    name: o.name ?? t.name,
    swingInterval: o.swingInterval ?? t.swingInterval ?? DEFAULT_SWING,
    ...(isBoss ? { isBoss: true } : {}),
    ...(o.armor != null ? { armor: o.armor } : {}),
    ...(o.level != null ? { level: o.level } : {}),
    ...(o.challengeRating != null ? { challengeRating: o.challengeRating } : {}),
    ...(o.maxHealth != null ? { maxHealth: o.maxHealth } : {}),
    ...(o.attackPower != null ? { attackPower: o.attackPower } : {}),
    creatureType: t.creatureType,
    damageType: t.attackType,
    ...(t.resistances ? { resistances: t.resistances } : {}),
    ...(t.vulnerabilities ? { vulnerabilities: t.vulnerabilities } : {}),
    ...(t.immunities ? { immunities: t.immunities } : {}),
    ...(t.abilities && t.abilities.length > 0
      ? { signatureAbilities: t.abilities.map(enemyAbilityToSignature) }
      : {}),
  };
}
