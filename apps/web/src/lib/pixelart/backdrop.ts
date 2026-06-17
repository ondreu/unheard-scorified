/**
 * Jemné, dlaždicovatelné procedurální pozadí celé appky (M14 increment 4).
 *
 * Vykreslí malou **opakovatelnou** texturu (rozptýlené tečky + drobné jiskry)
 * laděnou dle frakce, nacachuje jako data-URL a aplikuje přes CSS proměnnou
 * `--backdrop` (viz `.app-backdrop` v app.css). Velmi nízký kontrast → jen
 * oživí jinak plochou plochu za panely; bez animace (respektuje
 * `prefers-reduced-motion` triviálně, protože je statická).
 *
 * Dlaždicovatelnost: kreslíme jen jednotlivé pixely (a jiskry s okrajem od
 * hrany), takže textura navazuje beze švů. Deterministické (`SeededRng`),
 * čistě kosmetické.
 */
import type { Faction } from '@game/shared';
import { Painter, SeededRng, seedFromString, type RGB } from './core';

const T = 64;

/** Odstín tečkování dle frakce (kosmetické). */
const TINT: Record<Faction, RGB> = {
  alliance: 0x6ea8e0,
  horde: 0xe07a5a,
};

/** Vykreslí jednu dlaždici pozadí na 2D kontext (T×T, průhledné pozadí). */
export function drawBackdropTile(ctx: CanvasRenderingContext2D, faction: Faction): void {
  const p = new Painter(ctx, T);
  const rng = new SeededRng(seedFromString(`backdrop:${faction}`));
  const tint = TINT[faction] ?? TINT.alliance;

  // Rozptýlené slabé tečky.
  for (let i = 0; i < 70; i++) {
    const x = Math.floor(rng.next() * T);
    const y = Math.floor(rng.next() * T);
    const a = 0.04 + rng.next() * 0.06;
    p.px(x, y, tint, a);
  }

  // Pár drobných jisker („+"), s okrajem od hrany kvůli dlaždicování.
  for (let i = 0; i < 5; i++) {
    const x = 3 + Math.floor(rng.next() * (T - 6));
    const y = 3 + Math.floor(rng.next() * (T - 6));
    const a = 0.1 + rng.next() * 0.08;
    p.px(x, y, tint, a);
    p.px(x - 1, y, tint, a * 0.6);
    p.px(x + 1, y, tint, a * 0.6);
    p.px(x, y - 1, tint, a * 0.6);
    p.px(x, y + 1, tint, a * 0.6);
  }
}

const urlCache = new Map<string, string>();

/** Vrátí (a nacachuje) data-URL dlaždice pozadí pro frakci. Vyžaduje DOM. */
export function backdropDataUrl(faction: Faction = 'alliance'): string {
  const hit = urlCache.get(faction);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = T;
  canvas.height = T;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.imageSmoothingEnabled = false;
  drawBackdropTile(ctx, faction);
  const url = canvas.toDataURL();
  urlCache.set(faction, url);
  return url;
}

/** CSS pro `.app-backdrop`: nastaví `--backdrop`. Volej jen v prohlížeči. */
export function backdropStyle(faction: Faction = 'alliance'): string {
  const url = backdropDataUrl(faction);
  return url ? `--backdrop:url("${url}")` : '';
}
