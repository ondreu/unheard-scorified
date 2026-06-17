/**
 * Jádro procedurální pixel-art vrstvy (M14 — kosmetické, deterministické).
 *
 * Kreslí na 2D `<canvas>` (záměrně NE PixiJS/WebGL): avatarů a emblémů bývá na
 * stránce mnoho (top bar, group strip, chat, profily…) a počet WebGL kontextů
 * je v prohlížeči omezený → canvas2d je tu výrazně levnější a bezpečně škáluje.
 * PixiJS zůstává pro velké/animované scénky (`PixiScene.svelte`, banner zón).
 *
 * Determinismus zajišťuje `SeededRng` seedovaný z klíče (jméno/rasa/class) →
 * stejný vstup = vždy stejný obraz (viz CLAUDE.md: žádný `Math.random`).
 *
 * Čistě kosmatická vrstva (ROADMAP princip „cosmetic odděleno od statů").
 */
import { SeededRng, seedFromString } from '@game/shared';

export { SeededRng, seedFromString };

/** Barva jako 0xRRGGBB. */
export type RGB = number;

export function hex(c: RGB): string {
  return '#' + (c & 0xffffff).toString(16).padStart(6, '0');
}

/** Ztmaví/zesvětlí barvu násobkem (f<1 tmavší, f>1 světlejší), s clampem. */
export function shade(c: RGB, f: number): RGB {
  const r = Math.max(0, Math.min(255, Math.round(((c >> 16) & 0xff) * f)));
  const g = Math.max(0, Math.min(255, Math.round(((c >> 8) & 0xff) * f)));
  const b = Math.max(0, Math.min(255, Math.round((c & 0xff) * f)));
  return (r << 16) | (g << 8) | b;
}

/** Lineární mix dvou barev (t=0 → a, t=1 → b). */
export function mix(a: RGB, b: RGB, t: number): RGB {
  const ar = (a >> 16) & 0xff,
    ag = (a >> 8) & 0xff,
    ab = a & 0xff;
  const br = (b >> 16) & 0xff,
    bg = (b >> 8) & 0xff,
    bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

/**
 * Tenký wrapper nad 2D kontextem — kreslí v logických pixelech (canvas má
 * rozměr `dim`×`dim`, CSS ho upscaluje s `image-rendering: pixelated`).
 */
export class Painter {
  constructor(
    public readonly ctx: CanvasRenderingContext2D,
    public readonly dim: number,
  ) {}

  clear(): void {
    this.ctx.clearRect(0, 0, this.dim, this.dim);
  }

  px(x: number, y: number, c: RGB, a = 1): void {
    if (a <= 0) return;
    this.ctx.globalAlpha = a;
    this.ctx.fillStyle = hex(c);
    this.ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
    this.ctx.globalAlpha = 1;
  }

  rect(x: number, y: number, w: number, h: number, c: RGB, a = 1): void {
    if (a <= 0 || w <= 0 || h <= 0) return;
    this.ctx.globalAlpha = a;
    this.ctx.fillStyle = hex(c);
    this.ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
    this.ctx.globalAlpha = 1;
  }

  /** Symetrický pixel (zrcadlí kolem svislé osy `dim/2`). */
  sym(x: number, y: number, c: RGB, a = 1): void {
    this.px(x, y, c, a);
    this.px(this.dim - 1 - x, y, c, a);
  }

  /** Blokový disk (vyplněný kruh). */
  disc(cx: number, cy: number, r: number, c: RGB, a = 1): void {
    for (let y = -Math.ceil(r); y <= Math.ceil(r); y++) {
      const w = Math.floor(Math.sqrt(Math.max(0, r * r - y * y)));
      if (w < 0) continue;
      this.rect(cx - w, cy + y, w * 2 + 1, 1, c, a);
    }
  }

  /** Vyplněná elipsa se středem (cx,cy) a poloosami rx,ry. */
  ellipse(cx: number, cy: number, rx: number, ry: number, c: RGB, a = 1): void {
    for (let y = -Math.ceil(ry); y <= Math.ceil(ry); y++) {
      const t = y / ry;
      if (Math.abs(t) > 1) continue;
      const w = Math.floor(rx * Math.sqrt(Math.max(0, 1 - t * t)));
      this.rect(cx - w, cy + y, w * 2 + 1, 1, c, a);
    }
  }

  /** Úsečka (Bresenham) tloušťky 1 px. */
  line(x0: number, y0: number, x1: number, y1: number, c: RGB, a = 1): void {
    let x = Math.round(x0);
    let y = Math.round(y0);
    const ex = Math.round(x1);
    const ey = Math.round(y1);
    const dx = Math.abs(ex - x);
    const dy = -Math.abs(ey - y);
    const sx = x < ex ? 1 : -1;
    const sy = y < ey ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.px(x, y, c, a);
      if (x === ex && y === ey) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y += sy;
      }
    }
  }

  /** Vyplněný trojúhelník (skenovací řádky). */
  triangle(
    ax: number,
    ay: number,
    bx: number,
    by: number,
    cx: number,
    cy: number,
    col: RGB,
    a = 1,
  ): void {
    const minY = Math.floor(Math.min(ay, by, cy));
    const maxY = Math.ceil(Math.max(ay, by, cy));
    const edges: [number, number, number, number][] = [
      [ax, ay, bx, by],
      [bx, by, cx, cy],
      [cx, cy, ax, ay],
    ];
    for (let y = minY; y <= maxY; y++) {
      const xs: number[] = [];
      for (const [x0, y0, x1, y1] of edges) {
        if ((y0 <= y && y1 > y) || (y1 <= y && y0 > y)) {
          xs.push(x0 + ((y - y0) / (y1 - y0)) * (x1 - x0));
        }
      }
      if (xs.length >= 2) {
        xs.sort((p, q) => p - q);
        const lx = xs[0] as number;
        const rx = xs[xs.length - 1] as number;
        this.rect(lx, y, rx - lx + 1, 1, col, a);
      }
    }
  }
}
