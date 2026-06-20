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
import type { SignatureAbility } from './abilities';
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
   * efekt (stun/prone/restrained/frightened/slowed). Vyžaduje `save`. Propisuje
   * se přes `enemyAbilityToSignature` do bojového aktéra.
   */
  condition?: ConditionRider;
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
        damageMult: 1.8,
        damageType: 'necrotic',
        cooldownSec: 12,
        description: 'Drains vitality, healing the wraith for the damage dealt.',
        save: { ability: 'constitution', description: 'CON save or max HP is reduced.' },
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
  },
  {
    id: 'rfc_taragaman',
    name: 'Tarrakal the Hungerer',
    description: 'A bloated fiend summoned to gorge on the warren below Karngar.',
    creatureType: 'fiend',
    cr: 3,
    attackType: 'slashing',
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
  },
  {
    id: 'dm_vancleef',
    name: 'Edmund Vance',
    description: 'The exiled architect turned brigand-lord of the Ashen Hand.',
    creatureType: 'humanoid',
    cr: 4,
    attackType: 'slashing',
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
  },
  {
    id: 'wc_mutanus',
    name: 'Mutanis the Devourer',
    description: 'The nightmare made flesh, a ravenous murloc horror.',
    creatureType: 'aberration',
    cr: 4,
    attackType: 'bludgeoning',
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
  },
  {
    id: 'bfd_akumai',
    name: 'Akhumai',
    description: 'The slumbering beast roused beneath the temple.',
    creatureType: 'monstrosity',
    cr: 5,
    attackType: 'bludgeoning',
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
  },
  {
    id: 'mar_theradras',
    name: 'Princess Theradris',
    description: 'The crystalline daughter of an earth elemental and a demigod.',
    creatureType: 'elemental',
    cr: 10,
    attackType: 'poison',
    vulnerabilities: ['fire'],
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
  },
  {
    id: 'brd_thaurissan',
    name: 'Emperor Dagran Embermane',
    description: 'The emperor of the Cinderforge dwarves, lord of forge and flame.',
    creatureType: 'humanoid',
    cr: 12,
    attackType: 'fire',
    resistances: ['fire'],
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
    kind: 'strike',
    cooldownSec: a.cooldownSec,
    damageMult: a.damageMult,
    damageType: a.damageType,
    ...(a.save ? { save: { ability: a.save.ability, effect: 'half' as const } } : {}),
    ...(a.condition ? { condition: a.condition } : {}),
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
    name: o.name ?? t.name,
    swingInterval: o.swingInterval ?? t.swingInterval ?? DEFAULT_SWING,
    ...(isBoss ? { isBoss: true } : {}),
    ...(o.armor != null ? { armor: o.armor } : {}),
    ...(o.level != null ? { level: o.level } : {}),
    ...(o.challengeRating != null ? { challengeRating: o.challengeRating } : {}),
    ...(o.maxHealth != null ? { maxHealth: o.maxHealth } : {}),
    ...(o.attackPower != null ? { attackPower: o.attackPower } : {}),
    damageType: t.attackType,
    ...(t.resistances ? { resistances: t.resistances } : {}),
    ...(t.vulnerabilities ? { vulnerabilities: t.vulnerabilities } : {}),
    ...(t.immunities ? { immunities: t.immunities } : {}),
    ...(t.abilities && t.abilities.length > 0
      ? { signatureAbilities: t.abilities.map(enemyAbilityToSignature) }
      : {}),
  };
}
