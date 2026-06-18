/**
 * Procedurální pixel-art emblémy (M14): class crest, role ikona.
 * Deterministické geometrické glyfy kreslené v kódu (žádné PNG, žádná náhoda) —
 * nahrazují emoji v `cosmetics.ts`. Čistě kosmetické. (Frakční znak odstraněn
 * v MR deWoWčení.)
 *
 * Glyfy se kreslí na malý čtverec (dim ~ 16) a CSS se upscaluje (pixel-art look).
 */
import { Painter, shade, type RGB } from './core';

/** Barva glyfu per class (vanilla-style akcenty). */
export const CLASS_GLYPH_COLOR: Record<string, RGB> = {
  barbarian: 0xc79c6e,
  bard: 0xff7da6,
  cleric: 0xf0f0f0,
  druid: 0xff7d0a,
  fighter: 0xb5b5b5,
  monk: 0x35e0a0,
  paladin: 0xf58cba,
  ranger: 0xabd473,
  rogue: 0xfff569,
  sorcerer: 0xff5a36,
  warlock: 0x9482c9,
  wizard: 0x69ccf0,
};

/** Vykreslí class crest na Painter (dim×dim). */
export function drawClassEmblem(p: Painter, classId: string): void {
  const D = p.dim;
  const c = CLASS_GLYPH_COLOR[classId] ?? 0xd4a04c;
  const dark = shade(c, 0.6);
  const gold = 0xf0c860;
  const steel = 0xc8ccd4;
  const m = D / 2;

  switch (classId) {
    case 'fighter':
    case 'barbarian': {
      // Zkřížené meče (barbarian = širší, ale stejný glyf).
      p.line(D * 0.18, D * 0.82, D * 0.82, D * 0.18, steel);
      p.line(D * 0.82, D * 0.82, D * 0.18, D * 0.18, steel);
      p.rect(D * 0.12, D * 0.78, D * 0.18, 2, gold);
      p.rect(D * 0.7, D * 0.78, D * 0.18, 2, gold);
      break;
    }
    case 'paladin': {
      // Kladivo.
      p.rect(m - 1, D * 0.32, 2, D * 0.5, shade(gold, 0.7));
      p.rect(D * 0.28, D * 0.2, D * 0.44, D * 0.16, gold);
      break;
    }
    case 'ranger': {
      // Luk + šíp.
      for (let y = D * 0.2; y <= D * 0.8; y++) {
        const t = (y - m) / (D * 0.32);
        const x = D * 0.34 + Math.abs(t) * D * 0.14;
        p.px(x, y, c);
      }
      p.line(D * 0.34, m, D * 0.84, m, steel);
      p.triangle(D * 0.84, m - 2, D * 0.84, m + 2, D * 0.94, m, steel);
      break;
    }
    case 'rogue': {
      // Dýka.
      p.triangle(m, D * 0.16, m - 2, D * 0.62, m + 2, D * 0.62, steel);
      p.rect(m - 3, D * 0.62, 6, 2, gold);
      p.rect(m - 1, D * 0.64, 2, D * 0.18, dark);
      break;
    }
    case 'monk': {
      // Pěst (sevřená — blok kostek).
      p.rect(D * 0.34, D * 0.4, D * 0.32, D * 0.28, c);
      p.rect(D * 0.34, D * 0.36, D * 0.07, 0.08 * D, shade(c, 0.8));
      p.rect(D * 0.44, D * 0.34, D * 0.07, 0.1 * D, shade(c, 0.8));
      p.rect(D * 0.54, D * 0.36, D * 0.07, 0.08 * D, shade(c, 0.8));
      break;
    }
    case 'cleric': {
      // Zářící kříž.
      p.rect(m - 1, D * 0.18, 2, D * 0.64, c);
      p.rect(D * 0.24, m - 1, D * 0.52, 2, c);
      p.disc(m, m, 1.4, gold);
      break;
    }
    case 'sorcerer': {
      // Blesk (vrozená magie).
      p.line(D * 0.6, D * 0.16, D * 0.34, m, c);
      p.line(D * 0.34, m, D * 0.56, m, c);
      p.line(D * 0.56, m, D * 0.36, D * 0.84, c);
      break;
    }
    case 'wizard': {
      // Hvězda / orb.
      p.line(m, D * 0.14, m, D * 0.86, c);
      p.line(D * 0.14, m, D * 0.86, m, c);
      p.line(D * 0.26, D * 0.26, D * 0.74, D * 0.74, shade(c, 0.8));
      p.line(D * 0.74, D * 0.26, D * 0.26, D * 0.74, shade(c, 0.8));
      p.disc(m, m, 2, 0xffffff);
      break;
    }
    case 'warlock': {
      // Lebka.
      p.disc(m, D * 0.42, D * 0.26, c);
      p.rect(m - 2, D * 0.58, 4, D * 0.14, c);
      p.rect(m - 3, D * 0.38, 2, 2, dark);
      p.rect(m + 1, D * 0.38, 2, 2, dark);
      break;
    }
    case 'druid': {
      // Tlapa.
      p.disc(m, D * 0.62, D * 0.2, c);
      p.disc(m - D * 0.18, D * 0.4, D * 0.07, c);
      p.disc(m - D * 0.06, D * 0.32, D * 0.07, c);
      p.disc(m + D * 0.06, D * 0.32, D * 0.07, c);
      p.disc(m + D * 0.18, D * 0.4, D * 0.07, c);
      break;
    }
    case 'bard': {
      // Nota (kruh + stopka).
      p.disc(D * 0.4, D * 0.66, D * 0.12, c);
      p.rect(D * 0.5, D * 0.28, 2, D * 0.4, c);
      p.rect(D * 0.5, D * 0.28, D * 0.18, 2, c);
      break;
    }
    default:
      p.disc(m, m, D * 0.28, c);
  }
}

const ROLE_GLYPH: Record<string, RGB> = {
  tank: 0x6cb6e0,
  healer: 0x5fb87a,
  dps: 0xe0925a,
};

/** Vykreslí role ikonu (tank=štít, healer=kříž, dps=meče). */
export function drawRoleEmblem(p: Painter, role: string): void {
  const D = p.dim;
  const c = ROLE_GLYPH[role] ?? 0xd4a04c;
  const m = D / 2;
  if (role === 'tank') {
    p.rect(D * 0.24, D * 0.16, D * 0.52, D * 0.42, c);
    p.triangle(D * 0.24, D * 0.56, D * 0.76, D * 0.56, m, D * 0.88, c);
    p.rect(m - 1, D * 0.22, 2, D * 0.5, shade(c, 0.7));
  } else if (role === 'healer') {
    p.rect(m - 2, D * 0.16, 4, D * 0.68, c);
    p.rect(D * 0.18, m - 2, D * 0.64, 4, c);
  } else {
    p.line(D * 0.2, D * 0.8, D * 0.8, D * 0.2, c);
    p.line(D * 0.8, D * 0.8, D * 0.2, D * 0.2, c);
  }
}
