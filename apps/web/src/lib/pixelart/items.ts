/**
 * Procedurální pixel-art ikony itemů (M14 increment 6).
 *
 * Deterministicky vykreslený glyf dle **slotu** (helm/chest/zbraň/prsten…),
 * obarvený dle **typu brnění** (cloth/leather/mail/plate) resp. materiálu slotu,
 * v **rámečku barvy rarity** (common→legendary) s glow/jiskrami u vyšších rarit.
 * Žádné PNG; cache jako data-URL (hojné výskyty: inventář, AH, vendor, loot).
 *
 * Čistě kosmetické (ROADMAP: cosmetic odděleno od statů), bez `Math.random`.
 */
import { ITEMS, type ArmorClass, type ItemRarity, type ItemSlotType } from '@game/shared';
import { Painter, mix, shade, type RGB } from './core';

/**
 * Metadata pro ikonu vybavitelného itemu podle id (AH/vendor mají často jen
 * `itemId`). Vrací `undefined` pro ne-equip položky (materiály/spotřebáky),
 * které slot/raritu nemají → volající ikonu prostě nevykreslí.
 */
export function itemIconMetaById(
  itemId: string,
): { slot: ItemSlotType; rarity: ItemRarity; armorClass?: ArmorClass } | undefined {
  const def = ITEMS[itemId];
  if (!def) return undefined;
  return { slot: def.slot, rarity: def.rarity, armorClass: def.armorClass };
}

const WHITE = 0xffffff;
const GOLD = 0xf0c860;

/** Barva rámečku dle rarity (ladí s --r-* tokeny). */
const RARITY_RGB: Record<ItemRarity, RGB> = {
  common: 0xc8c8c8,
  uncommon: 0x4ad14a,
  rare: 0x4a90d9,
  epic: 0xb860e0,
  legendary: 0xf0a020,
};

/** Barva glyfu dle typu brnění (vanilla materiály). */
const ARMOR_RGB: Record<ArmorClass, RGB> = {
  cloth: 0xc2a878,
  leather: 0x8a5a3a,
  mail: 0x8a93a0,
  plate: 0xc2c6cc,
};

/** Fallback barva glyfu dle slotu (když item nemá armorClass). */
function slotColor(slot: ItemSlotType, rarity: ItemRarity): RGB {
  switch (slot) {
    case 'main_hand':
      return 0xd6d2c8; // ocel
    case 'off_hand':
      return 0x9aa6b2;
    case 'neck':
    case 'finger':
      return GOLD;
    case 'trinket':
      return RARITY_RGB[rarity];
    case 'back':
      return 0x6a6f86;
    case 'bag':
      return 0x8a5a3a;
    default:
      return 0xb8b2a4;
  }
}

/** Tmavá zaoblená podložka s rámečkem barvy rarity. */
function drawFrame(p: Painter, rarity: ItemRarity): void {
  const D = p.dim;
  const r = RARITY_RGB[rarity];
  p.rect(0, 0, D, D, 0x16120e);
  const edge = rarity === 'common' ? shade(r, 0.6) : r;
  p.rect(0, 0, D, 1, edge);
  p.rect(0, D - 1, D, 1, edge);
  p.rect(0, 0, 1, D, edge);
  p.rect(D - 1, 0, 1, D, edge);
  p.ctx.clearRect(0, 0, 1, 1);
  p.ctx.clearRect(D - 1, 0, 1, 1);
  p.ctx.clearRect(0, D - 1, 1, 1);
  p.ctx.clearRect(D - 1, D - 1, 1, 1);
  // Glow rohy u vyšších rarit.
  if (rarity === 'epic' || rarity === 'legendary') {
    p.px(1, 1, mix(r, WHITE, 0.5));
    p.px(D - 2, 1, mix(r, WHITE, 0.5));
    p.px(1, D - 2, mix(r, WHITE, 0.5));
    p.px(D - 2, D - 2, mix(r, WHITE, 0.5));
  }
}

/** Vykreslí ikonu itemu na Painter (dim×dim). */
export function drawItemIcon(
  p: Painter,
  item: { slot: ItemSlotType; rarity: ItemRarity; armorClass?: ArmorClass },
): void {
  const D = p.dim;
  const m = D / 2;
  drawFrame(p, item.rarity);
  const c = item.armorClass ? ARMOR_RGB[item.armorClass] : slotColor(item.slot, item.rarity);
  const gem = RARITY_RGB[item.rarity];
  const dark = shade(c, 0.6);

  switch (item.slot) {
    case 'head':
      p.disc(m, D * 0.46, D * 0.3, c);
      p.rect(D * 0.3, D * 0.46, D * 0.4, D * 0.22, c);
      p.rect(D * 0.38, D * 0.54, D * 0.24, 2, dark);
      break;
    case 'chest':
      p.rect(D * 0.22, D * 0.3, D * 0.12, D * 0.18, c);
      p.rect(D * 0.66, D * 0.3, D * 0.12, D * 0.18, c);
      p.rect(D * 0.32, D * 0.3, D * 0.36, D * 0.4, c);
      p.rect(m - 1, D * 0.3, 2, D * 0.4, dark);
      break;
    case 'legs':
      p.rect(D * 0.3, D * 0.26, D * 0.4, D * 0.14, c);
      p.rect(D * 0.32, D * 0.4, D * 0.13, D * 0.34, c);
      p.rect(D * 0.55, D * 0.4, D * 0.13, D * 0.34, c);
      break;
    case 'feet':
      p.rect(D * 0.36, D * 0.22, D * 0.16, D * 0.42, c);
      p.rect(D * 0.36, D * 0.62, D * 0.34, D * 0.14, c);
      break;
    case 'hands':
      p.rect(D * 0.36, D * 0.38, D * 0.3, D * 0.32, c);
      p.rect(D * 0.3, D * 0.44, D * 0.1, D * 0.16, c);
      for (let i = 0; i < 3; i++) p.rect(D * 0.38 + i * D * 0.1, D * 0.3, D * 0.06, D * 0.1, c);
      break;
    case 'wrist':
      p.rect(D * 0.3, D * 0.42, D * 0.4, D * 0.18, c);
      p.rect(D * 0.3, D * 0.42, D * 0.4, 2, mix(c, WHITE, 0.4));
      break;
    case 'waist':
      p.rect(D * 0.22, D * 0.44, D * 0.56, D * 0.14, c);
      p.rect(m - 2, D * 0.42, 4, D * 0.18, GOLD);
      break;
    case 'shoulder':
      p.disc(D * 0.36, D * 0.5, D * 0.17, c);
      p.disc(D * 0.64, D * 0.5, D * 0.17, c);
      p.disc(D * 0.36, D * 0.46, D * 0.08, mix(c, WHITE, 0.3));
      p.disc(D * 0.64, D * 0.46, D * 0.08, mix(c, WHITE, 0.3));
      break;
    case 'back':
      p.rect(D * 0.36, D * 0.22, D * 0.28, D * 0.08, mix(c, WHITE, 0.2));
      p.triangle(m, D * 0.28, D * 0.24, D * 0.8, D * 0.76, D * 0.8, c);
      break;
    case 'neck':
      p.line(D * 0.34, D * 0.28, m, D * 0.56, GOLD);
      p.line(D * 0.66, D * 0.28, m, D * 0.56, GOLD);
      p.disc(m, D * 0.62, D * 0.13, gem);
      p.px(m - 1, D * 0.58, mix(gem, WHITE, 0.6));
      break;
    case 'finger':
      p.disc(m, D * 0.56, D * 0.26, GOLD);
      p.disc(m, D * 0.56, D * 0.15, 0x16120e);
      p.disc(m, D * 0.3, D * 0.1, gem);
      break;
    case 'trinket':
      p.triangle(m, D * 0.2, D * 0.28, D * 0.5, D * 0.72, D * 0.5, gem);
      p.triangle(D * 0.28, D * 0.5, D * 0.72, D * 0.5, m, D * 0.82, gem);
      p.px(m - 1, D * 0.42, mix(gem, WHITE, 0.6));
      break;
    case 'main_hand':
      p.rect(m - 1, D * 0.16, 2, D * 0.46, c);
      p.triangle(m - 1, D * 0.16, m + 1, D * 0.16, m, D * 0.1, c);
      p.px(m, D * 0.2, WHITE);
      p.rect(D * 0.34, D * 0.62, D * 0.32, 2, GOLD);
      p.rect(m - 1, D * 0.66, 2, D * 0.16, shade(GOLD, 0.7));
      break;
    case 'off_hand': {
      const top = D * 0.2;
      const sh = D * 0.34;
      p.rect(D * 0.26, top, D * 0.48, sh, c);
      p.triangle(D * 0.26, top + sh, D * 0.74, top + sh, m, D * 0.84, c);
      p.rect(m - 1, top + 1, 2, sh, mix(c, WHITE, 0.4));
      break;
    }
    case 'bag':
      p.rect(D * 0.3, D * 0.4, D * 0.4, D * 0.34, c);
      p.rect(D * 0.34, D * 0.32, D * 0.32, D * 0.1, shade(c, 0.8));
      p.rect(m - 1, D * 0.3, 2, D * 0.1, shade(c, 0.6));
      break;
  }
}

// ── Cache data-URL ──────────────────────────────────────────────────────────

const urlCache = new Map<string, string>();

/** Vrátí (a nacachuje) data-URL ikony itemu. Vyžaduje DOM. */
export function itemIconDataUrl(
  slot: ItemSlotType,
  rarity: ItemRarity,
  armorClass: ArmorClass | undefined,
  dim = 16,
): string {
  const key = `${dim}:${slot}:${rarity}:${armorClass ?? '-'}`;
  const hit = urlCache.get(key);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = dim;
  canvas.height = dim;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.imageSmoothingEnabled = false;
  drawItemIcon(new Painter(ctx, dim), { slot, rarity, armorClass });
  const url = canvas.toDataURL();
  urlCache.set(key, url);
  return url;
}
