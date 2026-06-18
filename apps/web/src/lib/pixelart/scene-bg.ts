/**
 * Statická pixel-art miniatura scény pro **pozadí karet** (M14 increment 3).
 *
 * Lehká, deterministická varianta velkých PixiJS scén (`PixiScene.svelte`):
 * malou scenérii vykreslíme jednou na 2D canvas, **nacachujeme jako data-URL**
 * a aplikujeme přes CSS proměnnou `--scene-bg` (viz `.scene-card` v app.css).
 * Díky cache sdílí všechny karty téhož tématu jeden dekódovaný obrázek →
 * žádné canvasy/WebGL kontexty per karta, škáluje i na seznam o desítkách
 * položek. Recykluje katalog témat `scenes.ts` (jediný zdroj pravdy).
 *
 * Čistě kosmetické (ROADMAP: cosmetic odděleno od statů), bez `Math.random`
 * (variace přes `SeededRng` seedovaný id scény).
 */
import { SCENE_THEMES, themeForScene, type PropKind, type SceneTheme } from '$lib/scenes';
import { Painter, SeededRng, seedFromString, mix, shade } from './core';

const W = 96;
const H = 54;

/** Jednoduchá blokově kreslená silueta propu posazená na linii země. */
function drawProp(
  p: Painter,
  kind: PropKind,
  x: number,
  groundY: number,
  theme: SceneTheme,
  rng: SeededRng,
): void {
  const foliage = theme.foliage || 0x2a3a26;
  const stone = theme.stone;
  const glow = theme.glow ?? 0xff7a30;
  const jitter = Math.floor(rng.next() * 3) - 1;
  const bx = x + jitter;
  switch (kind) {
    case 'tree':
      p.rect(bx - 1, groundY - 8, 2, 8, shade(foliage, 0.5));
      p.disc(bx, groundY - 11, 5, foliage);
      break;
    case 'pine':
      p.rect(bx - 1, groundY - 6, 2, 6, shade(foliage, 0.5));
      p.triangle(bx - 5, groundY - 6, bx + 5, groundY - 6, bx, groundY - 18, foliage);
      break;
    case 'deadtree':
      p.line(bx, groundY, bx, groundY - 12, shade(stone, 0.7));
      p.line(bx, groundY - 8, bx - 4, groundY - 12, shade(stone, 0.7));
      p.line(bx, groundY - 6, bx + 4, groundY - 11, shade(stone, 0.7));
      break;
    case 'cactus':
      p.rect(bx - 1, groundY - 12, 3, 12, foliage);
      p.rect(bx - 4, groundY - 8, 3, 2, foliage);
      p.rect(bx - 4, groundY - 10, 2, 3, foliage);
      p.rect(bx + 2, groundY - 9, 3, 2, foliage);
      p.rect(bx + 4, groundY - 12, 2, 4, foliage);
      break;
    case 'ruin':
      p.rect(bx - 6, groundY - 9, 3, 9, stone);
      p.rect(bx + 2, groundY - 6, 3, 6, stone);
      p.rect(bx - 6, groundY - 9, 11, 2, shade(stone, 0.8));
      break;
    case 'tower':
      p.rect(bx - 3, groundY - 18, 6, 18, stone);
      p.rect(bx - 4, groundY - 18, 8, 3, shade(stone, 1.1));
      p.rect(bx - 1, groundY - 13, 2, 3, 0x14110f);
      break;
    case 'crystal':
      p.triangle(bx - 3, groundY, bx + 3, groundY, bx, groundY - 13, glow);
      p.triangle(bx - 1, groundY, bx + 2, groundY, bx + 1, groundY - 9, mix(glow, 0xffffff, 0.4));
      break;
    case 'stalactite':
      // Visí ze stropu (od y=0).
      p.triangle(bx - 3, 0, bx + 3, 0, bx, 14, shade(stone, 0.8));
      break;
    case 'lavapool':
      p.rect(bx - 6, groundY - 1, 12, 2, glow);
      p.rect(bx - 4, groundY, 8, 1, mix(glow, 0xffffff, 0.4));
      break;
    case 'gravestone':
      p.rect(bx - 2, groundY - 6, 4, 6, stone);
      p.rect(bx - 2, groundY - 7, 4, 2, shade(stone, 1.1));
      break;
    case 'mushroom':
      p.rect(bx - 1, groundY - 4, 2, 4, shade(foliage, 1.3));
      p.disc(bx, groundY - 5, 3, glow);
      break;
  }
}

/** Vykreslí miniaturu scény na daný 2D kontext (W×H). */
export function drawSceneThumb(
  ctx: CanvasRenderingContext2D,
  theme: SceneTheme,
  key: string,
): void {
  const p = new Painter(ctx, W);
  const rng = new SeededRng(seedFromString(key));
  const groundY = Math.round(H * 0.66);

  // Obloha (vertikální přechod).
  for (let y = 0; y < groundY; y++) {
    const t = y / groundY;
    p.rect(0, y, W, 1, mix(theme.skyTop, theme.skyBottom, t));
  }

  // Nebeské těleso.
  if (theme.celestial !== 'none') {
    const r = theme.celestial === 'sun' ? 6 : 5;
    p.disc(W - 18, 13, r, theme.celestialColor);
  }

  // Hřebeny siluet (daleko → blízko) s drobnými hrboly na crestu.
  for (const ridge of theme.ridges) {
    const cy = Math.round(ridge.rel * H);
    p.rect(0, cy, W, groundY - cy + 2, ridge.color);
    for (let x = 0; x < W; x += 8) {
      const h = 2 + Math.floor(rng.next() * 4);
      p.triangle(x, cy, x + 8, cy, x + 4, cy - h, ridge.color);
    }
  }

  // Země + struktura.
  p.rect(0, groundY, W, H - groundY, theme.ground);
  for (let i = 0; i < 40; i++) {
    const x = Math.floor(rng.next() * W);
    const y = groundY + Math.floor(rng.next() * (H - groundY));
    p.px(x, y, theme.groundAccent);
  }

  // Propy rozprostřené po šířce.
  const xs = [W * 0.2, W * 0.5, W * 0.8];
  theme.props.slice(0, 3).forEach((kind, i) => {
    drawProp(p, kind, Math.round(xs[i] ?? W * 0.5), groundY, theme, rng);
  });

  // Ambientní glow u země.
  if (theme.glow) {
    for (let i = 0; i < 3; i++) {
      p.disc(Math.floor(rng.next() * W), groundY - 2, 7, theme.glow, 0.12);
    }
  }
}

// ── Cache data-URL per téma ─────────────────────────────────────────────────

const urlCache = new Map<string, string>();

/** Vrátí (a nacachuje) data-URL miniatury scény pro dané id. Vyžaduje DOM. */
export function sceneCardUrl(id: string | null | undefined): string {
  // Známé id sdílí cache pod id; neznámé id sdílí neutrální fallback.
  const key = id && id in SCENE_THEMES ? id : '__fallback';
  const hit = urlCache.get(key);
  if (hit) return hit;
  const theme = themeForScene(id);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.imageSmoothingEnabled = false;
  drawSceneThumb(ctx, theme, key);
  const url = canvas.toDataURL();
  urlCache.set(key, url);
  return url;
}

/**
 * CSS pro `.scene-card`: nastaví `--scene-bg` na data-URL scény. Volej jen v
 * prohlížeči (vyžaduje DOM). Prázdné id → neutrální fallback.
 */
export function sceneCardStyle(id: string | null | undefined): string {
  const url = sceneCardUrl(id);
  return url ? `--scene-bg:url("${url}")` : '';
}
