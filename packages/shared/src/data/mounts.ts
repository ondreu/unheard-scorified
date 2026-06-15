/**
 * Mounty (M10+ FEAT, 🧑‍💼) — vanilla-WoW styl: drahé, od vyššího levelu.
 *
 * Mechanický přínos = **speed**: zrychlují idle aktivity závislé na pohybu
 * (quest + gathering) → snižují jejich `durationSec`. Crafting (stacionární)
 * mount nezrychluje.
 *
 * **Kosmetika oddělená od bonusu** (průřezový princip projektu, viz ROADMAP
 * „Monetizace later"): v rámci jednoho tieru je víc vizuálních variant se
 * STEJNÝM `speedBonus`. Hráč si vybere „active" mount čistě kosmeticky; rychlost
 * je odvozená z nejlepšího VLASTNĚNÉHO mountu, nezávisle na zvoleném vizuálu →
 * pozdější prodej skinů (mount = skin) nikdy nedává power.
 *
 * Jediný zdroj pravdy pro API i web (`@game/shared`).
 */

/** Tier mountu — určuje level gate, cenu a speed bonus. */
export type MountTier = 'basic' | 'epic';

export interface MountDef {
  id: string;
  name: string;
  description: string;
  tier: MountTier;
  /** Minimální level postavy pro koupi. */
  requiredLevel: number;
  /** Cena ve zlatě (velký gold sink). */
  cost: number;
  /**
   * Redukce trvání pohybových aktivit v rozsahu 0..1 (např. 0.30 = o 30 %
   * kratší quest/gather běh). Sdílený napříč kosmetickými variantami téhož tieru.
   */
  speedBonus: number;
}

/** Speed bonus jednotně per tier (kosmetika nemění power). */
export const MOUNT_TIER_SPEED: Record<MountTier, number> = {
  basic: 0.3,
  epic: 0.5,
};

/** Level gate a cena jednotně per tier. */
export const MOUNT_TIER_REQUIRED_LEVEL: Record<MountTier, number> = {
  basic: 30,
  epic: 50,
};
export const MOUNT_TIER_COST: Record<MountTier, number> = {
  basic: 250,
  epic: 2500,
};

function mount(id: string, name: string, description: string, tier: MountTier): MountDef {
  return {
    id,
    name,
    description,
    tier,
    requiredLevel: MOUNT_TIER_REQUIRED_LEVEL[tier],
    cost: MOUNT_TIER_COST[tier],
    speedBonus: MOUNT_TIER_SPEED[tier],
  };
}

/**
 * Katalog mountů. Každý tier má víc kosmetických variant se stejným bonusem
 * (demonstruje oddělení vizuálu od power → monetizace skinů bez refaktoru).
 */
export const MOUNTS: Record<string, MountDef> = {
  brown_horse: mount(
    'brown_horse',
    'Brown Riding Horse',
    'A sturdy, even-tempered horse. Reliable on any road.',
    'basic',
  ),
  dire_wolf: mount(
    'dire_wolf',
    'Timber Dire Wolf',
    'A trained dire wolf, loyal once fed enough.',
    'basic',
  ),
  striped_nightsaber: mount(
    'striped_nightsaber',
    'Striped Nightsaber',
    'A silent feline prowler from the deep forests.',
    'basic',
  ),
  swift_palomino: mount(
    'swift_palomino',
    'Swift Palomino',
    'A golden steed bred for blazing speed.',
    'epic',
  ),
  swift_gray_wolf: mount(
    'swift_gray_wolf',
    'Swift Gray Wolf',
    'A battle-scarred alpha that runs like the wind.',
    'epic',
  ),
  ebon_gryphon: mount(
    'ebon_gryphon',
    'Ebon Gryphon',
    'A majestic gryphon, fastest of the skies.',
    'epic',
  ),
};

export const MOUNT_LIST: MountDef[] = Object.values(MOUNTS);

export type MountId = keyof typeof MOUNTS;

export function isMountId(id: string): id is MountId {
  return id in MOUNTS;
}

/**
 * Efektivní speed bonus postavy = nejlepší bonus z VLASTNĚNÝCH mountů.
 * Nezávisí na zvoleném „active" (kosmetickém) mountu.
 */
export function mountSpeedBonus(ownedMountIds: readonly string[]): number {
  let best = 0;
  for (const id of ownedMountIds) {
    const m = MOUNTS[id];
    if (m && m.speedBonus > best) best = m.speedBonus;
  }
  return best;
}

/**
 * Aplikuje speed bonus na trvání pohybové aktivity (quest/gather). Vrací
 * zkrácené trvání (min. 1 s). Deterministické — vstupuje do server-authoritative
 * `durationSec` při startu aktivity.
 */
export function applyMountSpeed(durationSec: number, speedBonus: number): number {
  if (speedBonus <= 0) return durationSec;
  return Math.max(1, Math.round(durationSec * (1 - speedBonus)));
}
