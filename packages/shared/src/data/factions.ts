/**
 * Frakce reputace (M6). Pozn.: tyto frakce NEJSOU Aliance/Horda (ty zůstávají
 * kosmetické, viz ROADMAP). Jde o neutrální „guildy", u kterých postava stoupá
 * v reputaci skrz profese (gathering/crafting) → rep tiers → rep-gated recepty.
 *
 * Jediný zdroj pravdy pro API i web.
 */

export type FactionId = 'miners_league' | 'herbalist_circle' | 'explorers_guild';

export interface FactionDef {
  id: FactionId;
  name: string;
  description: string;
}

export const FACTIONS: Record<FactionId, FactionDef> = {
  miners_league: {
    id: 'miners_league',
    name: "The Miners' League",
    description: 'A guild of miners and smiths. Earn standing by mining ore and forging metal.',
  },
  herbalist_circle: {
    id: 'herbalist_circle',
    name: 'The Herbalist Circle',
    description: 'Keepers of herb and elixir lore. Earn standing by gathering herbs and brewing potions.',
  },
  explorers_guild: {
    id: 'explorers_guild',
    name: "The Explorers' Guild",
    description: 'Generalists who reward all honest labor. Every profession run earns a little standing.',
  },
};

/** Reputační stupně (vanilla-style, zjednodušeno na 5). */
export type RepTier = 'neutral' | 'friendly' | 'honored' | 'revered' | 'exalted';

export interface RepTierDef {
  tier: RepTier;
  name: string;
  /** Spodní hranice standingu pro tento tier (včetně). */
  min: number;
}

/** Tiery seřazené vzestupně dle prahu. */
export const REP_TIERS: readonly RepTierDef[] = [
  { tier: 'neutral', name: 'Neutral', min: 0 },
  { tier: 'friendly', name: 'Friendly', min: 500 },
  { tier: 'honored', name: 'Honored', min: 1500 },
  { tier: 'revered', name: 'Revered', min: 3000 },
  { tier: 'exalted', name: 'Exalted', min: 6000 },
] as const;

/** Maximální standing (strop „Exalted"). */
export const MAX_REPUTATION = 6000;

/** Pořadové číslo tieru (0 = neutral … 4 = exalted) — pro porovnání gatingu. */
export function repTierIndex(tier: RepTier): number {
  return REP_TIERS.findIndex((t) => t.tier === tier);
}

/** Vrátí tier pro daný standing. */
export function reputationTier(standing: number): RepTier {
  let result: RepTier = 'neutral';
  for (const t of REP_TIERS) {
    if (standing >= t.min) result = t.tier;
  }
  return result;
}

/**
 * Práh dalšího tieru a postup v rámci aktuálního tieru (pro UI progress bar).
 * Na nejvyšším tieru vrací `nextMin === null`.
 */
export function reputationProgress(standing: number): {
  tier: RepTier;
  tierName: string;
  currentMin: number;
  nextMin: number | null;
} {
  const clamped = Math.max(0, Math.min(MAX_REPUTATION, standing));
  const tier = reputationTier(clamped);
  const idx = repTierIndex(tier);
  const def = REP_TIERS[idx]!;
  const next = REP_TIERS[idx + 1];
  return {
    tier,
    tierName: def.name,
    currentMin: def.min,
    nextMin: next ? next.min : null,
  };
}

export function isFactionId(value: string): value is FactionId {
  return value in FACTIONS;
}
