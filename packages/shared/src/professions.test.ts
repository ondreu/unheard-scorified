import { describe, expect, it } from 'vitest';
import { SeededRng } from './rng';
import {
  professionSkillUp,
  rollGatherYield,
} from './professions';
import {
  GATHERING_NODES,
  MAX_PROFESSION_SKILL,
  RECIPES,
  professionReputationGains,
} from './data/professions';
import {
  MAX_REPUTATION,
  REP_TIERS,
  reputationProgress,
  reputationTier,
  repTierIndex,
} from './data/factions';
import { computeCraftReward, computeGatherReward } from './activity';
import { isMaterialId } from './data/materials';

describe('professionSkillUp', () => {
  it('dává +1, dokud je node zelený (current < skillUpTo)', () => {
    expect(professionSkillUp(1, 50)).toBe(1);
    expect(professionSkillUp(49, 50)).toBe(1);
  });

  it('zešedne na hranici skillUpTo (žádný skill)', () => {
    expect(professionSkillUp(50, 50)).toBe(0);
    expect(professionSkillUp(80, 50)).toBe(0);
  });

  it('nikdy nepřeleze strop', () => {
    expect(professionSkillUp(MAX_PROFESSION_SKILL, 150)).toBe(0);
  });
});

describe('rollGatherYield', () => {
  it('je deterministický pro stejný seed', () => {
    const node = GATHERING_NODES.copper_vein!;
    const a = rollGatherYield(node, new SeededRng(12345));
    const b = rollGatherYield(node, new SeededRng(12345));
    expect(a).toEqual(b);
  });

  it('vždy dropne primární materiál (chance 1) a jen platné materiály', () => {
    const node = GATHERING_NODES.copper_vein!;
    const items = rollGatherYield(node, new SeededRng(7));
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((id) => isMaterialId(id))).toBe(true);
    expect(items).toContain('copper_ore');
  });
});

describe('reputationTier', () => {
  it('mapuje standing na správný tier', () => {
    expect(reputationTier(0)).toBe('neutral');
    expect(reputationTier(499)).toBe('neutral');
    expect(reputationTier(500)).toBe('friendly');
    expect(reputationTier(1500)).toBe('honored');
    expect(reputationTier(3000)).toBe('revered');
    expect(reputationTier(MAX_REPUTATION)).toBe('exalted');
  });

  it('tiery jsou seřazené vzestupně', () => {
    for (let i = 1; i < REP_TIERS.length; i++) {
      expect(REP_TIERS[i]!.min).toBeGreaterThan(REP_TIERS[i - 1]!.min);
    }
  });

  it('repTierIndex umožní porovnání gatingu', () => {
    expect(repTierIndex('honored')).toBeGreaterThan(repTierIndex('friendly'));
  });

  it('reputationProgress vrací null nextMin na exalted', () => {
    expect(reputationProgress(MAX_REPUTATION).nextMin).toBeNull();
    expect(reputationProgress(0).nextMin).toBe(500);
  });
});

describe('professionReputationGains', () => {
  it('gathering dává primární frakci + podíl Explorers Guild', () => {
    const gains = professionReputationGains(GATHERING_NODES.copper_vein!);
    expect(gains.find((g) => g.factionId === 'miners_league')?.amount).toBe(20);
    expect(gains.find((g) => g.factionId === 'explorers_guild')?.amount).toBe(10);
  });
});

describe('computeGatherReward / computeCraftReward', () => {
  it('gather vrací XP + materiály', () => {
    const reward = computeGatherReward({ nodeId: 'copper_vein' }, 42);
    expect(reward.xp).toBe(GATHERING_NODES.copper_vein!.baseXp);
    expect(reward.gold).toBe(0);
    expect(reward.items.length).toBeGreaterThan(0);
  });

  it('craft vrací deterministický output item', () => {
    const reward = computeCraftReward({ recipeId: 'craft_copper_dagger' });
    expect(reward.xp).toBe(RECIPES.craft_copper_dagger!.baseXp);
    expect(reward.items).toEqual(['copper_dagger']);
  });

  it('neznámý node/recept = prázdná odměna', () => {
    expect(computeGatherReward({ nodeId: 'nope' }, 1).items).toEqual([]);
    expect(computeCraftReward({ recipeId: 'nope' }).items).toEqual([]);
  });
});
