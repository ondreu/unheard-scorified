/**
 * Scene theme catalog (M9 vizuální refresh — PixiJS pixel scénky).
 *
 * Čistě kosmetická vrstva (viz ROADMAP princip „cosmetic odděleno od statů"):
 * mapuje id zóny / dungeonu / raidu na DATOVÝ popis procedurální pixel-art
 * scénky (paleta + vrstvy + propy). Renderer (`PixiScene.svelte`) je generický
 * a data-driven — přidání další scény = jen záznam zde, žádná změna rendereru.
 *
 * Dokud malířka nedodá reálné bannery/scénky (viz docs/systems/ui-art-assets.md),
 * tohle je „mezikrok" zmíněný v asset specu: deterministicky generovaná pixel-art
 * scenérie místo plochého CSS placeholderu. Determinismus zajistí `SeededRng`
 * seedovaný z id scény (stejná scéna = vždy stejný obraz).
 */
import type { Faction } from '@game/shared';

/** Nebeské těleso ve scéně. */
export type Celestial = 'sun' | 'moon' | 'none';

/** Druhy midground propů (renderer je kreslí blokově). */
export type PropKind =
  | 'tree'
  | 'pine'
  | 'deadtree'
  | 'cactus'
  | 'ruin'
  | 'tower'
  | 'crystal'
  | 'stalactite'
  | 'lavapool'
  | 'gravestone'
  | 'mushroom';

/** Animované částice (respektují prefers-reduced-motion). */
export type Particle = 'none' | 'snow' | 'ember' | 'spore' | 'dust';

/** Jeden hřeben siluety (daleko → blízko); `rel` = výška hřebene jako podíl výšky scény. */
export interface Ridge {
  color: number;
  /** 0 = nahoře, 1 = dole. Crest siluety leží přibližně v `rel * height`. */
  rel: number;
}

/** Datový popis procedurální scénky (barvy jsou 0xRRGGBB). */
export interface SceneTheme {
  skyTop: number;
  skyBottom: number;
  celestial: Celestial;
  celestialColor: number;
  ridges: Ridge[];
  ground: number;
  /** Drobné tečky/struktura na zemi. */
  groundAccent: number;
  props: PropKind[];
  /** Listoví u stromů / přízvuk propů. */
  foliage: number;
  /** Kámen pro ruiny/věže. */
  stone: number;
  particle: Particle;
  /** Volitelný ambientní glow (láva/krystaly/oheň). */
  glow?: number;
}

// ── Sdílené palety (DRY) ───────────────────────────────────────────────────
const GROUND_GREEN = 0x4a7a3a;
const FOLIAGE_GREEN = 0x3c6b3a;

/**
 * Katalog scén. Klíč = id zóny (`data/zones.ts`), dungeonu (`data/dungeons.ts`)
 * nebo raidu (`data/raids.ts`). Chybějící id → fallback dle frakce (`themeForScene`).
 */
export const SCENE_THEMES: Record<string, SceneTheme> = {
  // ── Zóny: Aliance ──────────────────────────────────────────────────────
  northshire: {
    skyTop: 0x6fa8d8,
    skyBottom: 0xcfe3ef,
    celestial: 'sun',
    celestialColor: 0xfff2c0,
    ridges: [
      { color: 0x4a6b58, rel: 0.52 },
      { color: 0x3c6b3a, rel: 0.66 },
    ],
    ground: GROUND_GREEN,
    groundAccent: 0x3f6a32,
    props: ['tree', 'tree', 'pine', 'ruin'],
    foliage: FOLIAGE_GREEN,
    stone: 0x8a8475,
    particle: 'none',
  },
  westfall: {
    skyTop: 0x8bb0d0,
    skyBottom: 0xe7d9a8,
    celestial: 'sun',
    celestialColor: 0xfff0b8,
    ridges: [
      { color: 0xb89a55, rel: 0.6 },
      { color: 0x9c7f3e, rel: 0.72 },
    ],
    ground: 0xb59445,
    groundAccent: 0x9c7f3a,
    props: ['deadtree', 'ruin', 'tree'],
    foliage: 0x7e8a3e,
    stone: 0x9a8c6a,
    particle: 'dust',
  },
  duskwood: {
    skyTop: 0x2a2238,
    skyBottom: 0x49415a,
    celestial: 'moon',
    celestialColor: 0xc4c8e0,
    ridges: [
      { color: 0x2b2535, rel: 0.5 },
      { color: 0x1d2620, rel: 0.64 },
    ],
    ground: 0x23301f,
    groundAccent: 0x1b2618,
    props: ['deadtree', 'gravestone', 'deadtree'],
    foliage: 0x2a3a26,
    stone: 0x4a4a52,
    particle: 'spore',
    glow: 0x6b7ab0,
  },
  eastern_plaguelands: {
    skyTop: 0x3a3326,
    skyBottom: 0x6e6b3a,
    celestial: 'moon',
    celestialColor: 0xcdd07a,
    ridges: [
      { color: 0x4a4a32, rel: 0.54 },
      { color: 0x3a3a26, rel: 0.68 },
    ],
    ground: 0x55552f,
    groundAccent: 0x44441f,
    props: ['deadtree', 'gravestone', 'mushroom'],
    foliage: 0x6e7a32,
    stone: 0x5a5a48,
    particle: 'spore',
    glow: 0x9bd24a,
  },

  // ── Zóny: Horda ────────────────────────────────────────────────────────
  durotar: {
    skyTop: 0xc97a4a,
    skyBottom: 0xe6b878,
    celestial: 'sun',
    celestialColor: 0xfff0c0,
    ridges: [
      { color: 0x9c5230, rel: 0.58 },
      { color: 0x7a3e24, rel: 0.7 },
    ],
    ground: 0xb5623a,
    groundAccent: 0x97502e,
    props: ['cactus', 'ruin', 'cactus'],
    foliage: 0x6e7a3a,
    stone: 0x9a7050,
    particle: 'dust',
  },
  barrens: {
    skyTop: 0xd9a45a,
    skyBottom: 0xeccf8a,
    celestial: 'sun',
    celestialColor: 0xfff2c8,
    ridges: [
      { color: 0xa9863e, rel: 0.6 },
      { color: 0x8a6b2e, rel: 0.72 },
    ],
    ground: 0xbf9a4a,
    groundAccent: 0xa6823a,
    props: ['cactus', 'deadtree', 'cactus'],
    foliage: 0x8a7a32,
    stone: 0x9a865a,
    particle: 'dust',
  },
  thousand_needles: {
    skyTop: 0xd98a5a,
    skyBottom: 0xf0c87a,
    celestial: 'sun',
    celestialColor: 0xfff0b0,
    ridges: [
      { color: 0xb5623a, rel: 0.5 },
      { color: 0x8a4326, rel: 0.66 },
    ],
    ground: 0xd9a45a,
    groundAccent: 0xbf8a44,
    props: ['cactus', 'ruin'],
    foliage: 0x9a7a3a,
    stone: 0xb5895a,
    particle: 'dust',
  },
  felwood: {
    skyTop: 0x26323a,
    skyBottom: 0x2f4a3e,
    celestial: 'moon',
    celestialColor: 0x9be0b0,
    ridges: [
      { color: 0x2a3a30, rel: 0.5 },
      { color: 0x1e2a24, rel: 0.64 },
    ],
    ground: 0x24382a,
    groundAccent: 0x1a2c20,
    props: ['pine', 'mushroom', 'deadtree'],
    foliage: 0x2e5a3e,
    stone: 0x3a4a44,
    particle: 'spore',
    glow: 0x7be0a0,
  },

  // ── Dungeony ───────────────────────────────────────────────────────────
  ragefire_chasm: {
    skyTop: 0x2a1410,
    skyBottom: 0x3a1e14,
    celestial: 'none',
    celestialColor: 0x000000,
    ridges: [{ color: 0x3a201a, rel: 0.58 }],
    ground: 0x2a1610,
    groundAccent: 0x40201a,
    props: ['stalactite', 'lavapool', 'stalactite'],
    foliage: 0x000000,
    stone: 0x4a2a1f,
    particle: 'ember',
    glow: 0xff7a30,
  },
  deadmines: {
    skyTop: 0x1a2230,
    skyBottom: 0x24323f,
    celestial: 'none',
    celestialColor: 0x000000,
    ridges: [{ color: 0x223040, rel: 0.56 }],
    ground: 0x1e2a33,
    groundAccent: 0x182430,
    props: ['stalactite', 'crystal', 'tower'],
    foliage: 0x000000,
    stone: 0x4a4438,
    particle: 'none',
    glow: 0x4a90d9,
  },
  wailing_caverns: {
    skyTop: 0x142a24,
    skyBottom: 0x1e3a30,
    celestial: 'none',
    celestialColor: 0x000000,
    ridges: [{ color: 0x1e3328, rel: 0.56 }],
    ground: 0x183024,
    groundAccent: 0x122618,
    props: ['stalactite', 'mushroom', 'crystal'],
    foliage: 0x2e5a3e,
    stone: 0x2a4a3a,
    particle: 'spore',
    glow: 0x6be0a0,
  },
  shadowfang_keep: {
    skyTop: 0x1a1a2a,
    skyBottom: 0x2a2438,
    celestial: 'moon',
    celestialColor: 0xc0c4dc,
    ridges: [{ color: 0x20202e, rel: 0.5 }],
    ground: 0x1c1c26,
    groundAccent: 0x14141e,
    props: ['tower', 'deadtree', 'gravestone'],
    foliage: 0x222a26,
    stone: 0x44485a,
    particle: 'none',
    glow: 0xffb84a,
  },
  blackfathom_deeps: {
    skyTop: 0x0e2230,
    skyBottom: 0x163a4a,
    celestial: 'none',
    celestialColor: 0x000000,
    ridges: [{ color: 0x163040, rel: 0.54 }],
    ground: 0x123040,
    groundAccent: 0x0c2430,
    props: ['crystal', 'stalactite', 'crystal'],
    foliage: 0x000000,
    stone: 0x2a4a58,
    particle: 'none',
    glow: 0x3ad0e0,
  },
  scarlet_monastery: {
    skyTop: 0x3a1e1e,
    skyBottom: 0x6e3a2e,
    celestial: 'moon',
    celestialColor: 0xe0b0a0,
    ridges: [{ color: 0x4a2424, rel: 0.5 }],
    ground: 0x3a2620,
    groundAccent: 0x2c1c18,
    props: ['tower', 'ruin', 'gravestone'],
    foliage: 0x3a2a26,
    stone: 0x7a4a3e,
    particle: 'ember',
    glow: 0xc0392b,
  },
  zulfarrak: {
    skyTop: 0xd98a5a,
    skyBottom: 0xf0c87a,
    celestial: 'sun',
    celestialColor: 0xfff0b0,
    ridges: [
      { color: 0xb5623a, rel: 0.52 },
      { color: 0x8a4326, rel: 0.66 },
    ],
    ground: 0xd9a45a,
    groundAccent: 0xbf8a44,
    props: ['ruin', 'cactus', 'tower'],
    foliage: 0x9a7a3a,
    stone: 0xc29a6a,
    particle: 'dust',
  },
  maraudon: {
    skyTop: 0x1e1430,
    skyBottom: 0x2e1f4a,
    celestial: 'none',
    celestialColor: 0x000000,
    ridges: [{ color: 0x281f3a, rel: 0.56 }],
    ground: 0x221a34,
    groundAccent: 0x18122a,
    props: ['crystal', 'stalactite', 'mushroom'],
    foliage: 0x4a6b3a,
    stone: 0x3a2e52,
    particle: 'spore',
    glow: 0xb860e0,
  },
  blackrock_depths: {
    skyTop: 0x2a1410,
    skyBottom: 0x3a1c12,
    celestial: 'none',
    celestialColor: 0x000000,
    ridges: [{ color: 0x3a201a, rel: 0.56 }],
    ground: 0x281410,
    groundAccent: 0x3a1e16,
    props: ['lavapool', 'tower', 'stalactite'],
    foliage: 0x000000,
    stone: 0x4a3026,
    particle: 'ember',
    glow: 0xff7a30,
  },
  stratholme: {
    skyTop: 0x3a2418,
    skyBottom: 0x6e4a2a,
    celestial: 'moon',
    celestialColor: 0xe0c090,
    ridges: [{ color: 0x4a3020, rel: 0.5 }],
    ground: 0x33261c,
    groundAccent: 0x281c14,
    props: ['tower', 'ruin', 'gravestone'],
    foliage: 0x3a2e22,
    stone: 0x6a5238,
    particle: 'ember',
    glow: 0xff8a40,
  },

  // ── Raidy ──────────────────────────────────────────────────────────────
  molten_core: {
    skyTop: 0x2a0e08,
    skyBottom: 0x5a1e0e,
    celestial: 'none',
    celestialColor: 0x000000,
    ridges: [{ color: 0x3a140c, rel: 0.54 }],
    ground: 0x2a0e08,
    groundAccent: 0x3e160c,
    props: ['lavapool', 'stalactite', 'lavapool'],
    foliage: 0x000000,
    stone: 0x4a221a,
    particle: 'ember',
    glow: 0xff5a20,
  },
  blackwing_lair: {
    skyTop: 0x1e0e0e,
    skyBottom: 0x3a1414,
    celestial: 'none',
    celestialColor: 0x000000,
    ridges: [{ color: 0x2a1212, rel: 0.56 }],
    ground: 0x1e0e0e,
    groundAccent: 0x2c1212,
    props: ['crystal', 'tower', 'stalactite'],
    foliage: 0x000000,
    stone: 0x4a2424,
    particle: 'ember',
    glow: 0xe04030,
  },
  zulgurub: {
    skyTop: 0x1e3320,
    skyBottom: 0x3a5a2e,
    celestial: 'sun',
    celestialColor: 0xe8f0a0,
    ridges: [
      { color: 0x244026, rel: 0.5 },
      { color: 0x1a3020, rel: 0.64 },
    ],
    ground: 0x2a4a26,
    groundAccent: 0x1e3a1c,
    props: ['tree', 'ruin', 'mushroom'],
    foliage: 0x3c7a3a,
    stone: 0x6a7a4a,
    particle: 'spore',
    glow: 0x8ad24a,
  },
  ahnqiraj: {
    skyTop: 0xc98a4a,
    skyBottom: 0xe6c060,
    celestial: 'sun',
    celestialColor: 0xfff0c0,
    ridges: [
      { color: 0xa97a3e, rel: 0.52 },
      { color: 0x8a5e2e, rel: 0.66 },
    ],
    ground: 0xc99a4a,
    groundAccent: 0xab8038,
    props: ['ruin', 'tower', 'ruin'],
    foliage: 0x9a7a3a,
    stone: 0xc8a868,
    particle: 'dust',
    glow: 0xf0c870,
  },
};

/** Fallback scéna dle frakce (kosmetické), když id není v katalogu. */
const FALLBACK: Record<Faction, SceneTheme> = {
  alliance: SCENE_THEMES.northshire as SceneTheme,
  horde: SCENE_THEMES.durotar as SceneTheme,
};

/**
 * Vrátí téma scény pro dané id (zóna/dungeon/raid). Neznámé id → fallback dle
 * frakce (default alliance). Frakce je jen kosmetická volba fallbacku.
 */
export function themeForScene(
  id: string | null | undefined,
  faction: Faction = 'alliance',
): SceneTheme {
  if (id && SCENE_THEMES[id]) return SCENE_THEMES[id] as SceneTheme;
  return FALLBACK[faction] ?? (SCENE_THEMES.northshire as SceneTheme);
}

/** Akcentová barva scény (glow → nebeské těleso → zlatá) pro hover efekty. */
export function sceneAccentColor(
  id: string | null | undefined,
  faction: Faction = 'alliance',
): number {
  const t = themeForScene(id, faction);
  return t.glow ?? (t.celestial !== 'none' ? t.celestialColor : 0xf0c870);
}

/** CSS gradient z palety scény (SSR/fallback placeholder pod canvasem). */
export function sceneCssGradient(theme: SceneTheme): string {
  const top = `#${theme.skyTop.toString(16).padStart(6, '0')}`;
  const bottom = `#${theme.ground.toString(16).padStart(6, '0')}`;
  return `linear-gradient(180deg, ${top}, ${bottom})`;
}
