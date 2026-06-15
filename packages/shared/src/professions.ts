/**
 * Vzorce profesí (M6) — deterministické přes SeededRng (jediný zdroj náhody).
 * Data (nody, recepty, materiály) žijí v `data/professions.ts` a `data/materials.ts`.
 */
import { SeededRng } from './rng';
import type { MaterialId } from './data/materials';
import { MAX_PROFESSION_SKILL, type GatheringNodeDef } from './data/professions';

/**
 * Skill-up za jeden běh: +1, dokud je node/recept „zelený"
 * (`currentSkill < skillUpTo`) a nedosáhli jsme stropu; jinak 0.
 * Deterministické (bez RNG) — jednoduchý, testovatelný model pro MVP.
 */
export function professionSkillUp(currentSkill: number, skillUpTo: number): number {
  if (currentSkill >= MAX_PROFESSION_SKILL) return 0;
  return currentSkill < skillUpTo ? 1 : 0;
}

/**
 * Deterministicky rolne materiálový výnos gathering nodu. Vrací pole `MaterialId`
 * (každý kus = jedna položka, kompatibilní s `ActivityReward.items: string[]`).
 */
export function rollGatherYield(node: GatheringNodeDef, rng: SeededRng): MaterialId[] {
  const out: MaterialId[] = [];
  for (const y of node.yields) {
    if (y.chance < 1 && !rng.chance(y.chance)) continue;
    const qty = y.minQty === y.maxQty ? y.minQty : rng.int(y.minQty, y.maxQty);
    for (let i = 0; i < qty; i++) out.push(y.materialId);
  }
  return out;
}
