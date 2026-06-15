/**
 * Profese (M6): gathering (mining, herbalism) → materiály; crafting
 * (blacksmithing, alchemy) → spotřeba materiálů → itemy/spotřebáky.
 *
 * Každá profese má vlastní skill (1..MAX_PROFESSION_SKILL). Gathering nody a
 * crafting recepty jsou gatované `requiredSkill`; skill roste, dokud je
 * node/recept „zelený" (current < skillUpTo) — pak „zešedne" a skill už nedává.
 *
 * Reputace: každý běh dává standing primární frakci profese + menší podíl
 * Explorers' Guild (generalisté). Některé recepty jsou rep-gated.
 *
 * Jediný zdroj pravdy pro API i web.
 */
import type { FactionId, RepTier } from './factions';
import type { MaterialId } from './materials';

export type ProfessionId = 'mining' | 'herbalism' | 'blacksmithing' | 'alchemy';
export type ProfessionKind = 'gathering' | 'crafting';

/** Strop profession skillu pro MVP (3 tiery × 50). */
export const MAX_PROFESSION_SKILL = 150;

/** Frakce, která dostává „přidružený" podíl reputace z každého profession běhu. */
export const GENERALIST_FACTION: FactionId = 'explorers_guild';

export interface ProfessionDef {
  id: ProfessionId;
  name: string;
  kind: ProfessionKind;
  description: string;
  /** Primární frakce, u které profese sbírá reputaci. */
  factionId: FactionId;
}

export const PROFESSIONS: Record<ProfessionId, ProfessionDef> = {
  mining: {
    id: 'mining', name: 'Mining', kind: 'gathering', factionId: 'miners_league',
    description: 'Mine ore from veins across the world.',
  },
  herbalism: {
    id: 'herbalism', name: 'Herbalism', kind: 'gathering', factionId: 'herbalist_circle',
    description: 'Gather herbs from the wilds.',
  },
  blacksmithing: {
    id: 'blacksmithing', name: 'Blacksmithing', kind: 'crafting', factionId: 'miners_league',
    description: 'Forge ore into weapons and armor.',
  },
  alchemy: {
    id: 'alchemy', name: 'Alchemy', kind: 'crafting', factionId: 'herbalist_circle',
    description: 'Brew herbs into potions and elixirs.',
  },
};

export interface ReputationGain {
  factionId: FactionId;
  amount: number;
}

/** Jeden materiálový výnos gathering nodu (deterministicky rollnutý). */
export interface MaterialYield {
  materialId: MaterialId;
  minQty: number;
  maxQty: number;
  /** Šance, že tento materiál v běhu padne (0–1). Primární výnos má 1. */
  chance: number;
}

export interface GatheringNodeDef {
  id: string;
  /** Gathering profese, ke které node patří. */
  professionId: ProfessionId;
  name: string;
  description: string;
  requiredSkill: number;
  /** Skill, do kterého node ještě dává skill-up (pak zešedne). */
  skillUpTo: number;
  durationSec: number;
  /** Character XP za dokončení (profese přispívají i k levelingu). */
  baseXp: number;
  /** Reputace primární frakci profese za dokončení. */
  repReward: number;
  yields: MaterialYield[];
}

export const GATHERING_NODES: Record<string, GatheringNodeDef> = {
  // --- Mining ---
  copper_vein: {
    id: 'copper_vein', professionId: 'mining', name: 'Copper Vein',
    description: 'A vein of soft copper ore. Good for beginners.',
    requiredSkill: 1, skillUpTo: 50, durationSec: 600, baseXp: 40, repReward: 20,
    yields: [
      { materialId: 'copper_ore', minQty: 2, maxQty: 4, chance: 1 },
      { materialId: 'silver_ore', minQty: 1, maxQty: 1, chance: 0.05 },
    ],
  },
  iron_deposit: {
    id: 'iron_deposit', professionId: 'mining', name: 'Iron Deposit',
    description: 'A rich deposit of iron ore.',
    requiredSkill: 50, skillUpTo: 100, durationSec: 1200, baseXp: 90, repReward: 30,
    yields: [
      { materialId: 'iron_ore', minQty: 2, maxQty: 4, chance: 1 },
      { materialId: 'silver_ore', minQty: 1, maxQty: 1, chance: 0.08 },
    ],
  },
  mithril_deposit: {
    id: 'mithril_deposit', professionId: 'mining', name: 'Mithril Deposit',
    description: 'A seam of precious mithril.',
    requiredSkill: 100, skillUpTo: 150, durationSec: 2400, baseXp: 180, repReward: 45,
    yields: [
      { materialId: 'mithril_ore', minQty: 2, maxQty: 3, chance: 1 },
      { materialId: 'silver_ore', minQty: 1, maxQty: 1, chance: 0.12 },
    ],
  },
  // --- Herbalism ---
  peacebloom_patch: {
    id: 'peacebloom_patch', professionId: 'herbalism', name: 'Peacebloom Patch',
    description: 'A patch of common peacebloom.',
    requiredSkill: 1, skillUpTo: 50, durationSec: 600, baseXp: 40, repReward: 20,
    yields: [
      { materialId: 'peacebloom', minQty: 2, maxQty: 4, chance: 1 },
      { materialId: 'swiftthistle', minQty: 1, maxQty: 1, chance: 0.05 },
    ],
  },
  briarthorn_thicket: {
    id: 'briarthorn_thicket', professionId: 'herbalism', name: 'Briarthorn Thicket',
    description: 'A thorny thicket rich with briarthorn.',
    requiredSkill: 50, skillUpTo: 100, durationSec: 1200, baseXp: 90, repReward: 30,
    yields: [
      { materialId: 'briarthorn', minQty: 2, maxQty: 4, chance: 1 },
      { materialId: 'swiftthistle', minQty: 1, maxQty: 1, chance: 0.08 },
    ],
  },
  goldthorn_growth: {
    id: 'goldthorn_growth', professionId: 'herbalism', name: 'Goldthorn Growth',
    description: 'A rare growth of golden goldthorn.',
    requiredSkill: 100, skillUpTo: 150, durationSec: 2400, baseXp: 180, repReward: 45,
    yields: [
      { materialId: 'goldthorn', minQty: 2, maxQty: 3, chance: 1 },
      { materialId: 'swiftthistle', minQty: 1, maxQty: 1, chance: 0.12 },
    ],
  },
};

export interface RecipeInput {
  materialId: MaterialId;
  quantity: number;
}

export interface RecipeDef {
  id: string;
  /** Crafting profese, ke které recept patří. */
  professionId: ProfessionId;
  name: string;
  description: string;
  requiredSkill: number;
  skillUpTo: number;
  durationSec: number;
  baseXp: number;
  repReward: number;
  inputs: RecipeInput[];
  /** Vyrobený item — equipment (`ITEMS`) nebo spotřebák (`CONSUMABLES`). */
  outputItemId: string;
  outputQuantity: number;
  /** Rep-gated recept: vyžaduje daný tier u dané frakce (rep-gated odměna). */
  requiredReputation?: { factionId: FactionId; tier: RepTier };
}

export const RECIPES: Record<string, RecipeDef> = {
  // --- Blacksmithing ---
  craft_copper_dagger: {
    id: 'craft_copper_dagger', professionId: 'blacksmithing', name: 'Copper Dagger',
    description: 'Forge a simple copper dagger.',
    requiredSkill: 1, skillUpTo: 50, durationSec: 300, baseXp: 30, repReward: 25,
    inputs: [{ materialId: 'copper_ore', quantity: 3 }],
    outputItemId: 'copper_dagger', outputQuantity: 1,
  },
  craft_iron_warhammer: {
    id: 'craft_iron_warhammer', professionId: 'blacksmithing', name: 'Iron Warhammer',
    description: 'Forge a heavy iron warhammer.',
    requiredSkill: 50, skillUpTo: 100, durationSec: 600, baseXp: 70, repReward: 35,
    inputs: [{ materialId: 'iron_ore', quantity: 4 }],
    outputItemId: 'iron_warhammer', outputQuantity: 1,
  },
  craft_mithril_breastplate: {
    id: 'craft_mithril_breastplate', professionId: 'blacksmithing', name: 'Mithril Breastplate',
    description: 'Forge a sturdy mithril breastplate.',
    requiredSkill: 100, skillUpTo: 150, durationSec: 1200, baseXp: 140, repReward: 50,
    inputs: [{ materialId: 'mithril_ore', quantity: 6 }],
    outputItemId: 'mithril_breastplate', outputQuantity: 1,
  },
  craft_masterwork_blade: {
    id: 'craft_masterwork_blade', professionId: 'blacksmithing', name: 'Masterwork Blade',
    description: "A guild-secret recipe. Requires Honored standing with the Miners' League.",
    requiredSkill: 120, skillUpTo: 150, durationSec: 1800, baseXp: 200, repReward: 80,
    inputs: [
      { materialId: 'mithril_ore', quantity: 8 },
      { materialId: 'silver_ore', quantity: 2 },
    ],
    outputItemId: 'masterwork_blade', outputQuantity: 1,
    requiredReputation: { factionId: 'miners_league', tier: 'honored' },
  },
  // --- Alchemy ---
  craft_minor_healing_potion: {
    id: 'craft_minor_healing_potion', professionId: 'alchemy', name: 'Minor Healing Potion',
    description: 'Brew a minor healing potion.',
    requiredSkill: 1, skillUpTo: 50, durationSec: 300, baseXp: 30, repReward: 25,
    inputs: [{ materialId: 'peacebloom', quantity: 2 }],
    outputItemId: 'minor_healing_potion', outputQuantity: 1,
  },
  craft_healing_potion: {
    id: 'craft_healing_potion', professionId: 'alchemy', name: 'Healing Potion',
    description: 'Brew a healing potion.',
    requiredSkill: 50, skillUpTo: 100, durationSec: 600, baseXp: 70, repReward: 35,
    inputs: [{ materialId: 'briarthorn', quantity: 3 }],
    outputItemId: 'healing_potion', outputQuantity: 1,
  },
  craft_superior_healing_potion: {
    id: 'craft_superior_healing_potion', professionId: 'alchemy', name: 'Superior Healing Potion',
    description: 'Brew a superior healing potion.',
    requiredSkill: 100, skillUpTo: 150, durationSec: 1200, baseXp: 140, repReward: 50,
    inputs: [{ materialId: 'goldthorn', quantity: 4 }],
    outputItemId: 'superior_healing_potion', outputQuantity: 1,
  },
  craft_elixir_of_strength: {
    id: 'craft_elixir_of_strength', professionId: 'alchemy', name: 'Elixir of Strength',
    description: 'A circle-secret recipe. Requires Honored standing with the Herbalist Circle.',
    requiredSkill: 120, skillUpTo: 150, durationSec: 1800, baseXp: 200, repReward: 80,
    inputs: [
      { materialId: 'goldthorn', quantity: 5 },
      { materialId: 'swiftthistle', quantity: 2 },
    ],
    outputItemId: 'elixir_of_strength', outputQuantity: 1,
    requiredReputation: { factionId: 'herbalist_circle', tier: 'honored' },
  },
};

/** Reputace získaná za jeden profession běh: primární frakce + podíl Explorers'. */
export function professionReputationGains(
  def: GatheringNodeDef | RecipeDef,
): ReputationGain[] {
  const primary = PROFESSIONS[def.professionId].factionId;
  const generalist = Math.round(def.repReward * 0.5);
  const gains: ReputationGain[] = [{ factionId: primary, amount: def.repReward }];
  if (primary !== GENERALIST_FACTION && generalist > 0) {
    gains.push({ factionId: GENERALIST_FACTION, amount: generalist });
  }
  return gains;
}

export function isProfessionId(value: string): value is ProfessionId {
  return value in PROFESSIONS;
}

export function isGatheringNodeId(value: string): value is string {
  return value in GATHERING_NODES;
}

export function isRecipeId(value: string): value is string {
  return value in RECIPES;
}

export function gatheringNodesFor(professionId: ProfessionId): GatheringNodeDef[] {
  return Object.values(GATHERING_NODES)
    .filter((n) => n.professionId === professionId)
    .sort((a, b) => a.requiredSkill - b.requiredSkill);
}

export function recipesFor(professionId: ProfessionId): RecipeDef[] {
  return Object.values(RECIPES)
    .filter((r) => r.professionId === professionId)
    .sort((a, b) => a.requiredSkill - b.requiredSkill);
}
