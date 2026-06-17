/**
 * Procedurální pixel-art ikony combat abilit (M14 increment 2).
 *
 * Deterministicky vykreslené glyfy podle **druhu** ability (`AbilityKind`:
 * strike / dot / drain / heal / shield / mitigation) obarvené **živlem**
 * odvozeným z názvu (fire/frost/shadow/holy/nature/arcane/lightning/blood/…),
 * s fallbackem na barvu druhu. Žádné PNG, žádný `Math.random` (drobná variace
 * jde přes `SeededRng` seedovaný jménem) → stejná ability = vždy stejná ikona.
 *
 * Čistě kosmetické (ROADMAP: cosmetic odděleno od statů). Pro hojné výskyty
 * (combat log) se ikona cachuje jako data-URL a renderuje jako `<img>`, takže
 * stránka s desítkami řádků logu nedrží desítky canvasů.
 */
import type { AbilityKind } from '@game/shared';
import { Painter, SeededRng, seedFromString, shade, mix, type RGB } from './core';

const WHITE = 0xffffff;

/** Fallback barva podle druhu ability (když z názvu nepoznáme živel). */
const KIND_COLOR: Record<AbilityKind, RGB> = {
  strike: 0xd6d2c8, // steel
  dot: 0xff6a2c, // ember
  drain: 0xc0392b, // blood
  heal: 0x5fb87a, // life
  shield: 0x6cb6e0, // ward
  mitigation: 0x9aa6b2, // iron
};

/** Klíčové slovo v názvu → barva živlu (pořadí = priorita, specifické první). */
const ELEMENT_KEYWORDS: [string, RGB][] = [
  ['frostfire', 0xb98cf0],
  ['frost', 0x69ccf0],
  ['ice', 0x69ccf0],
  ['chill', 0x69ccf0],
  ['fire', 0xff6a2c],
  ['flame', 0xff6a2c],
  ['pyro', 0xff6a2c],
  ['scorch', 0xff6a2c],
  ['immolat', 0xff6a2c],
  ['burn', 0xff6a2c],
  ['shadow', 0x9482c9],
  ['mind', 0x9482c9],
  ['arcane', 0x9bb0ff],
  ['starfall', 0x9bb0ff],
  ['moonfire', 0x9bb0ff],
  ['holy', 0xf3df9b],
  ['smite', 0xf3df9b],
  ['light', 0xf3df9b],
  ['consecr', 0xf3df9b],
  ['repent', 0xf3df9b],
  ['avenger', 0xf3df9b],
  ['penance', 0xf3df9b],
  ['guardian', 0xf3df9b],
  ['crusader', 0xf3df9b],
  ['lightning', 0x6cb6e0],
  ['thunder', 0x6cb6e0],
  ['storm', 0x6cb6e0],
  ['demon', 0xabd473],
  ['chaos', 0xabd473],
  ['fel', 0xabd473],
  ['nature', 0x8fd45f],
  ['wrath', 0x8fd45f],
  ['tranquil', 0x8fd45f],
  ['rejuven', 0x8fd45f],
  ['blood', 0xc0392b],
  ['rend', 0xc0392b],
  ['rupture', 0xc0392b],
  ['mutilate', 0xc0392b],
];

/** Odvodí barvu ikony z názvu (živel), s fallbackem na barvu druhu. */
export function abilityColor(name: string, kind: AbilityKind): RGB {
  const n = name.toLowerCase();
  for (const [kw, col] of ELEMENT_KEYWORDS) {
    if (n.includes(kw)) return col;
  }
  return KIND_COLOR[kind];
}

/** Tmavá zaoblená podložka (rámeček) — ikona čitelná na libovolném pozadí. */
function drawFrame(p: Painter, accent: RGB): void {
  const D = p.dim;
  p.rect(0, 0, D, D, 0x14110f);
  // okraj v tmavém odstínu akcentu
  const edge = shade(accent, 0.45);
  p.rect(0, 0, D, 1, edge);
  p.rect(0, D - 1, D, 1, edge);
  p.rect(0, 0, 1, D, edge);
  p.rect(D - 1, 0, 1, D, edge);
  // zaoblené rohy (smaž 4 krajní pixely)
  p.ctx.clearRect(0, 0, 1, 1);
  p.ctx.clearRect(D - 1, 0, 1, 1);
  p.ctx.clearRect(0, D - 1, 1, 1);
  p.ctx.clearRect(D - 1, D - 1, 1, 1);
}

/** Plamínek/kapka (sdílí dot i drain). */
function drawFlame(p: Painter, cx: number, cy: number, c: RGB): void {
  p.disc(cx, cy + 2, 3, c);
  p.triangle(cx - 3, cy + 1, cx + 3, cy + 1, cx, cy - 4, c);
  p.triangle(cx - 1.5, cy + 1, cx + 1.5, cy + 1, cx, cy - 1, mix(c, WHITE, 0.55));
}

/** Vykreslí ikonu ability na Painter (dim×dim). */
export function drawAbilityIcon(p: Painter, ability: { name: string; kind: AbilityKind }): void {
  const D = p.dim;
  const m = D / 2;
  const c = abilityColor(ability.name, ability.kind);
  const rng = new SeededRng(seedFromString(`${ability.kind}:${ability.name}`));
  drawFrame(p, c);

  switch (ability.kind) {
    case 'strike': {
      // Šikmá čepel zleva-dolů → vpravo-nahoru + jílec.
      p.line(3, D - 4, D - 4, 3, c);
      p.line(3, D - 5, D - 5, 3, shade(c, 0.7));
      p.px(D - 4, 3, WHITE);
      p.px(D - 5, 3, WHITE);
      // jílec dole vlevo + záštita
      p.line(2, D - 2, 5, D - 5, 0xc79c6e);
      p.line(3, D - 5, 6, D - 4, shade(0xc79c6e, 0.8));
      break;
    }
    case 'dot': {
      drawFlame(p, m, m, c);
      // tiky v čase (3 ubývající jiskry vpravo)
      for (let i = 0; i < 3; i++) {
        const yy = 4 + i * 3 + Math.floor(rng.next() * 1.5);
        p.px(D - 3, yy, mix(c, WHITE, 0.3), 1 - i * 0.25);
      }
      break;
    }
    case 'drain': {
      // Kapka + nasávací šipka vzhůru (siphon).
      drawFlame(p, m - 1, m + 1, c);
      const a = 0xe0d8c0;
      p.line(D - 4, D - 3, D - 4, 4, a);
      p.line(D - 4, 4, D - 6, 6, a);
      p.line(D - 4, 4, D - 2, 6, a);
      break;
    }
    case 'heal': {
      // Kříž + jiskry.
      p.rect(m - 1, 3, 2, D - 6, c);
      p.rect(3, m - 1, D - 6, 2, c);
      p.rect(m - 1, m - 1, 2, 2, mix(c, WHITE, 0.6));
      p.px(D - 4, 4, WHITE);
      p.px(4, D - 4, WHITE, 0.8);
      break;
    }
    case 'shield':
    case 'mitigation': {
      // Štít.
      const top = 3;
      const shoulderH = Math.round((D - 6) * 0.42);
      p.rect(3, top, D - 6, shoulderH, c);
      p.triangle(3, top + shoulderH, D - 3, top + shoulderH, m, D - 3, c);
      // okraj
      p.line(3, top, 3, top + shoulderH, shade(c, 0.65));
      p.line(D - 4, top, D - 4, top + shoulderH, shade(c, 0.65));
      if (ability.kind === 'mitigation') {
        // příčný pás (obranné okno)
        p.rect(3, m - 1, D - 6, 2, mix(c, WHITE, 0.55));
      } else {
        // svislý hřeben
        p.rect(m - 1, top + 1, 2, shoulderH + 2, mix(c, WHITE, 0.45));
      }
      break;
    }
  }
}

// ── Cache data-URL (pro hojné výskyty: combat log) ──────────────────────────

const urlCache = new Map<string, string>();

/**
 * Vrátí (a nacachuje) data-URL ikony ability. Vyžaduje DOM (`document`).
 * Stejný klíč = jeden render → vhodné pro logy s mnoha řádky.
 */
export function abilityIconDataUrl(name: string, kind: AbilityKind, dim = 16): string {
  const key = `${dim}:${kind}:${name}`;
  const hit = urlCache.get(key);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = dim;
  canvas.height = dim;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.imageSmoothingEnabled = false;
  drawAbilityIcon(new Painter(ctx, dim), { name, kind });
  const url = canvas.toDataURL();
  urlCache.set(key, url);
  return url;
}
