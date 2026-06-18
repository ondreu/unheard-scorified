/**
 * Procedurální pixel-art portréty (M14). Deterministicky vykreslí bystu hrdiny
 * podle rasy (silueta/kůže/uši/rohy/kly), classy (barva brnění) a frakce (tón
 * pozadí). Čistě kosmetické — žádná herní logika, žádné staty.
 *
 * Katalogy `RACE_LOOK` / `CLASS_LOOK` jsou jediný zdroj pravdy vzhledu; přidání
 * varianty = úprava dat, ne rendereru.
 */
import type { Faction } from '@game/shared';
import { Painter, SeededRng, mix, seedFromString, shade, type RGB } from './core';

interface RaceLook {
  skin: RGB;
  hair: RGB[];
  eye: RGB;
  eyeGlow: boolean;
  ears: 'short' | 'long';
  horns: boolean;
  tusks: boolean;
  /** Šířkový faktor hlavy (×base). */
  headW: number;
  /** Výškový faktor hlavy (×base). */
  headH: number;
  beard: 'always' | 'maybe' | 'none';
}

/** Vzhled per rasa (barvy 0xRRGGBB). */
export const RACE_LOOK: Record<string, RaceLook> = {
  human: {
    skin: 0xd8a878,
    hair: [0x3a2a18, 0x6b4a28, 0x231a12, 0xc8a04a],
    eye: 0x5a3a1a,
    eyeGlow: false,
    ears: 'short',
    horns: false,
    tusks: false,
    headW: 1,
    headH: 1,
    beard: 'maybe',
  },
  dwarf: {
    skin: 0xd49a6a,
    hair: [0x8a3a1a, 0x6b4a28, 0xb0b0b0, 0xc8a04a],
    eye: 0x4a6a2a,
    eyeGlow: false,
    ears: 'short',
    horns: false,
    tusks: false,
    headW: 1.12,
    headH: 0.96,
    beard: 'always',
  },
  nightelf: {
    skin: 0x9a7ac0,
    hair: [0x2a4a6a, 0x6a2a6a, 0xb0b0d0, 0x3a6a5a],
    eye: 0xeae0a0,
    eyeGlow: true,
    ears: 'long',
    horns: false,
    tusks: false,
    headW: 0.96,
    headH: 1.08,
    beard: 'none',
  },
  gnome: {
    skin: 0xe8b890,
    hair: [0xff6a3a, 0x3a8a6a, 0x6a3a9a, 0xf0c84a],
    eye: 0x3a6a8a,
    eyeGlow: false,
    ears: 'short',
    horns: false,
    tusks: false,
    headW: 0.9,
    headH: 0.92,
    beard: 'none',
  },
  orc: {
    skin: 0x6a9a4a,
    hair: [0x231a12, 0x3a2a18, 0x6a3a2a, 0x111111],
    eye: 0xd86a2a,
    eyeGlow: false,
    ears: 'short',
    horns: false,
    tusks: true,
    headW: 1.16,
    headH: 1.02,
    beard: 'maybe',
  },
  tauren: {
    skin: 0x8a6a4a,
    hair: [0x3a2a18, 0x6b4a28, 0xddddcc, 0x231a12],
    eye: 0x201608,
    eyeGlow: false,
    ears: 'short',
    horns: true,
    tusks: false,
    headW: 1.22,
    headH: 1.04,
    beard: 'none',
  },
  troll: {
    skin: 0x4a8a8a,
    hair: [0xd83a3a, 0xf06a2a, 0x6a3a9a, 0x3a8a4a],
    eye: 0xf0d030,
    eyeGlow: false,
    ears: 'long',
    horns: false,
    tusks: true,
    headW: 0.98,
    headH: 1.1,
    beard: 'none',
  },
  undead: {
    skin: 0x9aa890,
    hair: [0x1a1a1a, 0x55555a, 0x6a3a3a, 0x2a3a2a],
    eye: 0x9af030,
    eyeGlow: true,
    ears: 'short',
    horns: false,
    tusks: false,
    headW: 0.96,
    headH: 1.02,
    beard: 'none',
  },
};

interface ClassLook {
  armor: RGB;
  trim: RGB;
}

/** Barvy brnění/ramen per class (tón odpovídá fantasy archetypu). */
export const CLASS_LOOK: Record<string, ClassLook> = {
  barbarian: { armor: 0x7a5a3a, trim: 0xc0b48a },
  bard: { armor: 0x7a3a5a, trim: 0xf0c860 },
  cleric: { armor: 0xe2e2ea, trim: 0xf0c860 },
  druid: { armor: 0x46582a, trim: 0x8a6a3a },
  fighter: { armor: 0x8a8478, trim: 0xc0b48a },
  monk: { armor: 0x2f6a5a, trim: 0xc0b48a },
  paladin: { armor: 0xc2c2cc, trim: 0xf0c860 },
  ranger: { armor: 0x4a6a3a, trim: 0x8a6a3a },
  rogue: { armor: 0x2a2a32, trim: 0x7a2a2a },
  sorcerer: { armor: 0x7a2a2a, trim: 0xf0a060 },
  warlock: { armor: 0x42284a, trim: 0x8aae3a },
  wizard: { armor: 0x3a3a8a, trim: 0x9a7ad0 },
};

const FACTION_BG: Record<Faction, [RGB, RGB]> = {
  alliance: [0x223a5a, 0x0e1626],
  horde: [0x4a1a1a, 0x180c0c],
};

function pick<T>(arr: T[], rng: SeededRng): T {
  return arr[rng.int(0, arr.length - 1)] as T;
}

/**
 * Vykreslí portrét na čtvercový Painter (dim×dim). Deterministicky dle `seedKey`.
 */
export function drawPortrait(
  p: Painter,
  opts: { race: string; klass: string; faction: Faction; seedKey: string },
): void {
  const D = p.dim;
  const race = RACE_LOOK[opts.race] ?? (RACE_LOOK.human as RaceLook);
  const klass = CLASS_LOOK[opts.klass] ?? (CLASS_LOOK.fighter as ClassLook);
  const rng = new SeededRng(seedFromString(`${opts.seedKey}:${opts.race}:${opts.klass}`));

  // 1) Pozadí (frakční vinětový gradient).
  const [bgTop, bgBot] = FACTION_BG[opts.faction];
  for (let y = 0; y < D; y++) {
    p.rect(0, y, D, 1, mix(bgTop, bgBot, y / D));
  }

  const cx = D / 2;
  const skin = race.skin;
  const skinShadow = shade(skin, 0.78);
  const skinLight = shade(skin, 1.16);

  // Geometrie hlavy.
  const rx = D * 0.2 * race.headW;
  const ry = D * 0.22 * race.headH;
  const headCy = D * 0.4;
  const jawY = headCy + ry;

  // 2) Ramena / brnění (spodní třetina, za krkem).
  const shoulderY = D * 0.74;
  p.ellipse(cx, D + D * 0.12, D * 0.52, D * 0.4, klass.armor);
  // Pauldrony.
  p.disc(cx - D * 0.34, shoulderY, D * 0.13, shade(klass.armor, 1.1));
  p.disc(cx + D * 0.34, shoulderY, D * 0.13, shade(klass.armor, 1.1));
  // Lem brnění.
  p.rect(cx - D * 0.22, shoulderY - 1, D * 0.44, 1, klass.trim);
  // Krk.
  p.rect(cx - rx * 0.42, jawY - 2, rx * 0.84, D * 0.12, skinShadow);

  // 3) Rohy (tauren) — za hlavu.
  if (race.horns) {
    const hcol = 0xe8e0c8;
    for (let i = 0; i < 5; i++) {
      p.rect(cx - rx - 1 - i, headCy - ry * 0.4 - i * 1.4, 2, 2, hcol);
      p.rect(cx + rx - 1 + i, headCy - ry * 0.4 - i * 1.4, 2, 2, hcol);
    }
  }

  // 4) Uši.
  if (race.ears === 'long') {
    p.triangle(cx - rx, headCy, cx - rx - D * 0.14, headCy - D * 0.16, cx - rx, headCy + ry * 0.4, skin);
    p.triangle(cx + rx, headCy, cx + rx + D * 0.14, headCy - D * 0.16, cx + rx, headCy + ry * 0.4, skin);
  } else {
    p.disc(cx - rx + 1, headCy + ry * 0.1, D * 0.045, skin);
    p.disc(cx + rx - 1, headCy + ry * 0.1, D * 0.045, skin);
  }

  // 5) Hlava (elipsa) + objemové stínování.
  p.ellipse(cx, headCy, rx, ry, skin);
  p.ellipse(cx - rx * 0.32, headCy - ry * 0.3, rx * 0.5, ry * 0.5, skinLight, 0.35);
  p.ellipse(cx + rx * 0.42, headCy + ry * 0.34, rx * 0.55, ry * 0.5, skinShadow, 0.45);

  // 6) Oči.
  const eyeY = headCy - ry * 0.06;
  const eyeDx = rx * 0.46;
  if (race.eyeGlow) {
    p.disc(cx - eyeDx, eyeY, 1.6, race.eye, 0.5);
    p.disc(cx + eyeDx, eyeY, 1.6, race.eye, 0.5);
    p.rect(cx - eyeDx - 0.5, eyeY - 0.5, 1.6, 1.6, 0xffffff);
    p.rect(cx + eyeDx - 0.5, eyeY - 0.5, 1.6, 1.6, 0xffffff);
  } else {
    p.rect(cx - eyeDx - 1, eyeY - 1, 2, 2, 0x16100a);
    p.rect(cx + eyeDx - 1, eyeY - 1, 2, 2, 0x16100a);
    p.px(cx - eyeDx, eyeY, race.eye);
    p.px(cx + eyeDx, eyeY, race.eye);
  }

  // 7) Kly (orc/troll).
  if (race.tusks) {
    const tcol = 0xe8e0c8;
    p.triangle(cx - rx * 0.5, jawY - ry * 0.42, cx - rx * 0.34, jawY - ry * 0.42, cx - rx * 0.42, jawY - ry * 0.05, tcol);
    p.triangle(cx + rx * 0.5, jawY - ry * 0.42, cx + rx * 0.34, jawY - ry * 0.42, cx + rx * 0.42, jawY - ry * 0.05, tcol);
  }

  // 8) Vlasy — temeno + skráně, barva ze seedovaného poolu.
  const hair = pick(race.hair, rng);
  const hairShade = shade(hair, 0.8);
  for (let y = headCy - ry - 1; y < headCy - ry * 0.25; y++) {
    const t = (y - headCy) / ry;
    const w = Math.floor(rx * 1.06 * Math.sqrt(Math.max(0, 1 - t * t)));
    if (w <= 0) continue;
    p.rect(cx - w, y, w * 2 + 1, 1, y < headCy - ry * 0.55 ? hair : hairShade);
  }
  // Skráně podél obličeje.
  for (let y = headCy - ry * 0.3; y < headCy + ry * 0.5; y++) {
    const t = (y - headCy) / ry;
    const w = Math.floor(rx * Math.sqrt(Math.max(0, 1 - t * t)));
    if (w <= 1) continue;
    p.rect(cx - w, y, 1.4, 1, hairShade);
    p.rect(cx + w - 0.4, y, 1.4, 1, hairShade);
  }

  // 9) Vousy.
  const wantBeard = race.beard === 'always' || (race.beard === 'maybe' && rng.next() < 0.5);
  if (wantBeard) {
    for (let y = headCy + ry * 0.28; y < jawY + 1; y++) {
      const t = (y - headCy) / ry;
      const w = Math.floor(rx * 0.92 * Math.sqrt(Math.max(0, 1 - t * t)));
      if (w <= 0) continue;
      p.rect(cx - w, y, w * 2 + 1, 1, hairShade);
    }
  }
}
