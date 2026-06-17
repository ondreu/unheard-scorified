/**
 * Procedurální pixel-art ikony mountů (M14 increment 7) — vizuální varianty.
 *
 * Side-profil silueta odvozená z **druhu** mountu (horse/wolf/cat/gryphon) z id,
 * obarvená seedovaně dle id (různé „skiny" téhož druhu mají různý odstín) a
 * orámovaná dle **tieru** (epic = zlatý rámeček + jiskry). Demonstruje princip
 * ROADMAP: kosmetika (skin) oddělená od power (speed) → monetizace bez refaktoru.
 *
 * Žádné PNG, bez `Math.random` (variace přes `SeededRng`). Cache jako data-URL.
 */
import { Painter, SeededRng, seedFromString, mix, shade, type RGB } from './core';

const GOLD = 0xf0c860;

type MountKind = 'horse' | 'wolf' | 'cat' | 'gryphon';

/** Odvodí druh mountu z id/jména (kurátorovaná klíčová slova). */
function mountKind(id: string): MountKind {
  const s = id.toLowerCase();
  if (/(wolf|worg)/.test(s)) return 'wolf';
  if (/(saber|cat|tiger|panther|nightsaber)/.test(s)) return 'cat';
  if (/(gryphon|griffin|wyvern|drake|bat|hawk)/.test(s)) return 'gryphon';
  return 'horse';
}

const KIND_COLOR: Record<MountKind, RGB> = {
  horse: 0x8a5a3a,
  wolf: 0x7a7a82,
  cat: 0x6a5a8a,
  gryphon: 0xb09060,
};

function drawFrame(p: Painter, epic: boolean): void {
  const D = p.dim;
  p.rect(0, 0, D, D, 0x14110f);
  const edge = epic ? GOLD : 0x4a4038;
  p.rect(0, 0, D, 1, edge);
  p.rect(0, D - 1, D, 1, edge);
  p.rect(0, 0, 1, D, edge);
  p.rect(D - 1, 0, 1, D, edge);
  p.ctx.clearRect(0, 0, 1, 1);
  p.ctx.clearRect(D - 1, 0, 1, 1);
  p.ctx.clearRect(0, D - 1, 1, 1);
  p.ctx.clearRect(D - 1, D - 1, 1, 1);
  if (epic) {
    p.px(1, 1, mix(GOLD, 0xffffff, 0.5));
    p.px(D - 2, 1, mix(GOLD, 0xffffff, 0.5));
  }
}

/** Vykreslí mount (side profil čelem vpravo) na Painter (dim×dim). */
export function drawMount(p: Painter, opts: { id: string; tier: string }): void {
  const D = p.dim;
  const kind = mountKind(opts.id);
  const epic = opts.tier === 'epic';
  const rng = new SeededRng(seedFromString(`mount:${opts.id}`));
  // Skin tint: odstín se mění per id (kosmetická varianta).
  const base = mix(KIND_COLOR[kind], rng.next() < 0.5 ? 0x000000 : 0xffffff, rng.next() * 0.22);
  const dark = shade(base, 0.7);
  const light = shade(base, 1.2);
  drawFrame(p, epic);

  const groundY = D * 0.82;
  const bodyCx = D * 0.46;
  const bodyCy = D * 0.56;

  const legColor = dark;
  function leg(x: number): void {
    p.rect(x, groundY - D * 0.22, D * 0.07, D * 0.22, legColor);
  }

  switch (kind) {
    case 'horse': {
      p.ellipse(bodyCx, bodyCy, D * 0.3, D * 0.15, base);
      leg(D * 0.3);
      leg(D * 0.42);
      leg(D * 0.56);
      leg(D * 0.66);
      // krk + hlava
      p.triangle(D * 0.66, bodyCy - D * 0.1, D * 0.78, bodyCy - D * 0.05, D * 0.74, D * 0.26, base);
      p.disc(D * 0.8, D * 0.3, D * 0.09, base);
      p.rect(D * 0.86, D * 0.3, D * 0.06, D * 0.05, base); // čenich
      // hříva
      p.line(D * 0.7, D * 0.3, D * 0.66, bodyCy - D * 0.08, dark);
      // ocas
      p.line(D * 0.16, bodyCy - D * 0.04, D * 0.06, groundY - D * 0.04, dark);
      p.px(D * 0.82, D * 0.29, 0x16100a); // oko
      break;
    }
    case 'wolf': {
      p.ellipse(bodyCx, bodyCy + D * 0.03, D * 0.31, D * 0.13, base);
      leg(D * 0.3);
      leg(D * 0.42);
      leg(D * 0.56);
      leg(D * 0.66);
      // hlava níž + čenich
      p.disc(D * 0.78, D * 0.44, D * 0.1, base);
      p.rect(D * 0.86, D * 0.46, D * 0.08, D * 0.05, base);
      // špičaté uši
      p.triangle(D * 0.74, D * 0.36, D * 0.8, D * 0.36, D * 0.76, D * 0.28, base);
      // huňatý ocas
      p.disc(D * 0.16, bodyCy, D * 0.09, base);
      p.px(D * 0.8, D * 0.43, 0xd86a2a); // oko
      break;
    }
    case 'cat': {
      p.ellipse(bodyCx, bodyCy + D * 0.02, D * 0.32, D * 0.11, base);
      leg(D * 0.3);
      leg(D * 0.42);
      leg(D * 0.56);
      leg(D * 0.66);
      p.disc(D * 0.78, D * 0.46, D * 0.085, base);
      // uši
      p.triangle(D * 0.72, D * 0.4, D * 0.77, D * 0.4, D * 0.74, D * 0.33, base);
      p.triangle(D * 0.79, D * 0.4, D * 0.84, D * 0.4, D * 0.81, D * 0.33, base);
      // dlouhý zahnutý ocas
      p.line(D * 0.16, bodyCy, D * 0.08, bodyCy - D * 0.12, base);
      p.line(D * 0.08, bodyCy - D * 0.12, D * 0.14, D * 0.3, base);
      // pruhy
      p.line(D * 0.4, bodyCy - D * 0.08, D * 0.4, bodyCy + D * 0.08, dark);
      p.line(D * 0.5, bodyCy - D * 0.08, D * 0.5, bodyCy + D * 0.08, dark);
      p.px(D * 0.8, D * 0.45, 0xf0d030);
      break;
    }
    case 'gryphon': {
      p.ellipse(bodyCx, bodyCy, D * 0.27, D * 0.14, base);
      leg(D * 0.34);
      leg(D * 0.58);
      // křídla nad tělem
      p.triangle(D * 0.34, bodyCy - D * 0.05, D * 0.6, bodyCy - D * 0.05, D * 0.4, D * 0.18, light);
      p.triangle(
        D * 0.38,
        bodyCy - D * 0.05,
        D * 0.64,
        bodyCy - D * 0.05,
        D * 0.56,
        D * 0.22,
        base,
      );
      // orlí hlava + zobák
      p.disc(D * 0.78, D * 0.36, D * 0.085, mix(base, 0xffffff, 0.25));
      p.triangle(D * 0.85, D * 0.36, D * 0.85, D * 0.42, D * 0.93, D * 0.39, GOLD);
      // ocas
      p.line(D * 0.18, bodyCy, D * 0.08, groundY - D * 0.06, dark);
      p.px(D * 0.8, D * 0.35, 0x16100a);
      break;
    }
  }
}

const urlCache = new Map<string, string>();

/** Vrátí (a nacachuje) data-URL ikony mountu. Vyžaduje DOM. */
export function mountIconDataUrl(id: string, tier: string, dim = 28): string {
  const key = `${dim}:${id}:${tier}`;
  const hit = urlCache.get(key);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = dim;
  canvas.height = dim;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.imageSmoothingEnabled = false;
  drawMount(new Painter(ctx, dim), { id, tier });
  const url = canvas.toDataURL();
  urlCache.set(key, url);
  return url;
}
