/**
 * Jemné, dlaždicovatelné procedurální pozadí celé appky (M14 increment 4).
 *
 * Vykreslí malou **opakovatelnou** texturu (rozptýlené tečky + drobné jiskry),
 * nacachuje jako data-URL a aplikuje přes CSS proměnnou
 * `--backdrop` (viz `.app-backdrop` v app.css). Velmi nízký kontrast → jen
 * oživí jinak plochou plochu za panely; bez animace (respektuje
 * `prefers-reduced-motion` triviálně, protože je statická).
 *
 * Dlaždicovatelnost: kreslíme jen jednotlivé pixely (a jiskry s okrajem od
 * hrany), takže textura navazuje beze švů. Deterministické (`SeededRng`),
 * čistě kosmetické.
 */
import { Painter, SeededRng, seedFromString, type RGB } from './core';

const T = 64;

/** Neutrální odstín tečkování (kosmetické; frakce odstraněny v MR deWoWčení). */
const TINT: RGB = 0x8a9ec0;

/** Vykreslí jednu dlaždici pozadí na 2D kontext (T×T, průhledné pozadí). */
export function drawBackdropTile(ctx: CanvasRenderingContext2D): void {
  const p = new Painter(ctx, T);
  const rng = new SeededRng(seedFromString('backdrop:neutral'));
  const tint = TINT;

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

let urlCache: string | null = null;

/** Vrátí (a nacachuje) data-URL dlaždice pozadí. Vyžaduje DOM. */
export function backdropDataUrl(): string {
  if (urlCache !== null) return urlCache;
  const canvas = document.createElement('canvas');
  canvas.width = T;
  canvas.height = T;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.imageSmoothingEnabled = false;
  drawBackdropTile(ctx);
  const url = canvas.toDataURL();
  urlCache = url;
  return url;
}

/** CSS pro `.app-backdrop`: nastaví `--backdrop`. Volej jen v prohlížeči. */
export function backdropStyle(): string {
  const url = backdropDataUrl();
  return url ? `--backdrop:url("${url}")` : '';
}
