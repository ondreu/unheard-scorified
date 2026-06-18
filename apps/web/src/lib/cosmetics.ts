/**
 * Kosmetická vrstva pro UI (M9 refresh) — barvy, emblémy, procedurální avatary.
 * Oddělené od herní logiky; čistě vizuál. Jediný zdroj pravdy pro to, jak
 * vypadají rasy/classy/role/rarity napříč webem (avatary, chipy, rámečky).
 *
 * Profilové obrázky: default je **procedurální pixel-art portrét** (M14,
 * `$lib/pixelart/portrait` přes `PixelPortrait.svelte` v `Avatar.svelte`) —
 * deterministický dle rasy/classy/jména. `SHOWCASE_PORTRAITS` zůstává registrem,
 * kam lze kdykoli zapojit reálný malovaný art (má přednost před procedurálním).
 * Emoji `CLASS_EMBLEM` / `ROLE_META.icon` jsou fallback pro místa, kde ještě není
 * zapojený `PixelEmblem.svelte` (viz docs/systems/ui-art-assets.md).
 */
import { CLASSES, RACES, type Role } from '@game/shared';

export type FactionId = 'alliance' | 'horde';

export const FACTION_COLOR: Record<FactionId, string> = {
  alliance: 'var(--alliance)',
  horde: 'var(--horde)',
};

export function factionLabel(faction: string): string {
  return faction === 'horde' ? 'Horde' : 'Alliance';
}

/** Class emblem (placeholder, dokud nepřijde pixel art) — sjednocené napříč UI. */
export const CLASS_EMBLEM: Record<string, string> = {
  barbarian: '🪓',
  bard: '🎵',
  cleric: '✨',
  druid: '🐾',
  fighter: '⚔️',
  monk: '👊',
  paladin: '🔨',
  ranger: '🏹',
  rogue: '🗡️',
  sorcerer: '🔮',
  warlock: '☠️',
  wizard: '📖',
};

/** D&D class barvy (akcent v chipech/jménech). */
export const CLASS_COLOR: Record<string, string> = {
  barbarian: '#c79c6e',
  bard: '#ff7da6',
  cleric: '#ffffff',
  druid: '#ff7d0a',
  fighter: '#b5b5b5',
  monk: '#00ff96',
  paladin: '#f58cba',
  ranger: '#abd473',
  rogue: '#fff569',
  sorcerer: '#ff5a36',
  warlock: '#9482c9',
  wizard: '#69ccf0',
};

export const ROLE_META: Record<Role, { label: string; icon: string; color: string }> = {
  tank: { label: 'Tank', icon: '🛡️', color: '#6cb6e0' },
  healer: { label: 'Healer', icon: '➕', color: '#5fb87a' },
  dps: { label: 'DPS', icon: '⚔️', color: '#e0925a' },
};

export const RARITY_COLOR: Record<string, string> = {
  common: 'var(--r-common)',
  uncommon: 'var(--r-uncommon)',
  rare: 'var(--r-rare)',
  epic: 'var(--r-epic)',
  legendary: 'var(--r-legendary)',
};

/** Stabilní barva odvozená ze jména (do gradientu avataru). */
function hashHue(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) % 360;
  return h;
}

export interface AvatarLook {
  /** Reálný portrét (až bude k dispozici), jinak null → procedurální default. */
  src: string | null;
  /** CSS gradient pro default. */
  gradient: string;
  initial: string;
  emblem: string;
  faction: FactionId;
}

/**
 * Registr reálných showcase portrétů. Klíč = `${race}_${class}` nebo `race`.
 * Prázdné → použije se procedurální default. Malířka sem doplní cesty na art
 * (viz asset spec). Necháváme připravené pro pár ukázkových artů.
 */
export const SHOWCASE_PORTRAITS: Record<string, string> = {
  // 'human_warrior': '/portraits/human_warrior.png',  // ← doplní malířka
};

export function avatarLook(name: string, race: string, klass: string): AvatarLook {
  const faction = (RACES[race as keyof typeof RACES]?.faction ?? 'alliance') as FactionId;
  const hue = hashHue(name + race);
  const c2 = CLASS_COLOR[klass] ?? 'var(--gold)';
  const gradient = `linear-gradient(150deg, hsl(${hue} 45% 28%), hsl(${(hue + 40) % 360} 38% 16%))`;
  const src =
    SHOWCASE_PORTRAITS[`${race}_${klass}`] ?? SHOWCASE_PORTRAITS[race] ?? null;
  return {
    src,
    gradient: `${gradient}, ${c2}`,
    initial: (name[0] ?? '?').toUpperCase(),
    emblem: CLASS_EMBLEM[klass] ?? '🛡️',
    faction,
  };
}

export function raceName(id: string): string {
  return RACES[id as keyof typeof RACES]?.name ?? id;
}

export function className(id: string): string {
  return CLASSES[id as keyof typeof CLASSES]?.name ?? id;
}
