/**
 * Navigace postavy — jediný zdroj pravdy pro shell (horní lišta = kategorie),
 * kategorie-stránky (`/hub/[group]`, velké karty) i overview (rychlé akce).
 *
 * Dvě úrovně: 4 kategorie (`NAV_CATEGORIES`) v horní liště → každá rozbalí svůj
 * seznam leaf-sekcí (`NAV_SECTIONS`, filtrovaný přes `group`) na kategorie-stránce.
 * Trade tu schválně NENÍ: obchod se zahajuje kliknutím přímo na hráče (inspect
 * profil), ne solo tlačítkem.
 */
export type NavGroup = 'play' | 'character' | 'social' | 'economy';

export interface NavSection {
  /** Cesta relativně k /characters/[id]. */
  path: string;
  icon: string;
  title: string;
  sub: string;
  accent: string;
  /** Kategorie, do které sekce patří. */
  group: NavGroup;
}

export interface NavCategory {
  group: NavGroup;
  icon: string;
  title: string;
  /** Krátký popis pro kartu na overview / hlavičku kategorie-stránky. */
  sub: string;
  accent: string;
}

/** Horní lišta: 4 kategorie + Overview. Pořadí = priorita. */
export const NAV_CATEGORIES: NavCategory[] = [
  {
    group: 'play',
    icon: '⚔️',
    title: 'Play',
    sub: 'Quests, dungeons, raids & arena',
    accent: 'var(--horde)',
  },
  {
    group: 'character',
    icon: '🧙',
    title: 'Character',
    sub: 'Gear, talents, professions & more',
    accent: 'var(--r-uncommon)',
  },
  {
    group: 'social',
    icon: '💬',
    title: 'Social',
    sub: 'Group, friends, guild & mail',
    accent: 'var(--info)',
  },
  {
    group: 'economy',
    icon: '💰',
    title: 'Economy',
    sub: 'Auction house & vendor',
    accent: 'var(--gold-bright)',
  },
];

export const NAV_SECTIONS: NavSection[] = [
  {
    path: 'quests',
    icon: '📜',
    title: 'Quests',
    sub: 'Send out & earn XP',
    accent: 'var(--gold)',
    group: 'play',
  },
  {
    path: 'dungeons',
    icon: '🗝️',
    title: 'Dungeons',
    sub: 'Idle PVE runs',
    accent: '#9b7bd4',
    group: 'play',
  },
  {
    path: 'raids',
    icon: '🐉',
    title: 'Raids',
    sub: 'Group PVE bosses',
    accent: 'var(--horde)',
    group: 'play',
  },
  {
    path: 'arena',
    icon: '⚔️',
    title: 'Arena',
    sub: 'Rated PVP ladder',
    accent: '#e0925a',
    group: 'play',
  },
  {
    path: 'gauntlet',
    icon: '🔥',
    title: 'The Gauntlet',
    sub: 'Active survival arena',
    accent: 'var(--danger)',
    group: 'play',
  },

  {
    path: 'inventory',
    icon: '🎒',
    title: 'Inventory',
    sub: 'Gear & equipment',
    accent: 'var(--gold)',
    group: 'character',
  },
  {
    path: 'talents',
    icon: '🌳',
    title: 'Talents',
    sub: 'Spend talent points',
    accent: 'var(--r-uncommon)',
    group: 'character',
  },
  {
    path: 'rotation',
    icon: '🎯',
    title: 'Rotation',
    sub: 'Combat spell priority',
    accent: 'var(--info)',
    group: 'character',
  },
  {
    path: 'professions',
    icon: '⚒️',
    title: 'Professions',
    sub: 'Gather & craft',
    accent: '#c79c6e',
    group: 'character',
  },
  {
    path: 'achievements',
    icon: '🏆',
    title: 'Achievements',
    sub: 'Goals & rewards',
    accent: 'var(--gold-bright)',
    group: 'character',
  },
  {
    path: 'mounts',
    icon: '🐎',
    title: 'Mounts',
    sub: 'Travel speed',
    accent: 'var(--r-uncommon)',
    group: 'character',
  },
  {
    path: 'history',
    icon: '📖',
    title: 'History',
    sub: 'Recent activity results',
    accent: 'var(--text-dim)',
    group: 'character',
  },
  {
    path: 'consumables',
    icon: '🧪',
    title: 'Consumables',
    sub: 'Use potions & elixirs',
    accent: 'var(--r-rare)',
    group: 'character',
  },
  {
    path: 'bank',
    icon: '🏦',
    title: 'Bank',
    sub: 'Store items off your bags',
    accent: 'var(--gold)',
    group: 'character',
  },

  {
    path: 'group',
    icon: '👥',
    title: 'Group',
    sub: 'Party up',
    accent: 'var(--info)',
    group: 'social',
  },
  {
    path: 'social',
    icon: '💬',
    title: 'Friends & Chat',
    sub: 'Social & global chat',
    accent: 'var(--info)',
    group: 'social',
  },
  {
    path: 'mail',
    icon: '✉️',
    title: 'Mail',
    sub: 'Offline messages & items',
    accent: 'var(--gold)',
    group: 'social',
  },
  {
    path: 'guild',
    icon: '🏰',
    title: 'Guild',
    sub: 'Your guild',
    accent: '#9482c9',
    group: 'social',
  },

  {
    path: 'auctions',
    icon: '💰',
    title: 'Auction House',
    sub: 'Buy & sell',
    accent: 'var(--gold-bright)',
    group: 'economy',
  },
  {
    path: 'vendor',
    icon: '🏪',
    title: 'Vendor',
    sub: 'NPC buy & sell',
    accent: 'var(--gold)',
    group: 'economy',
  },
];

/**
 * Nejčastější akce — zobrazené přímo na overview jako "jump back in" řádek,
 * aby je hráč nemusel hledat přes kategorie. Drženo malé (3).
 */
export const QUICK_ACTION_PATHS = ['quests', 'dungeons', 'inventory'] as const;

const SECTION_BY_PATH = new Map(NAV_SECTIONS.map((s) => [s.path, s]));

export function sectionByPath(path: string): NavSection | undefined {
  return SECTION_BY_PATH.get(path);
}

export function sectionsInGroup(group: NavGroup): NavSection[] {
  return NAV_SECTIONS.filter((s) => s.group === group);
}

export function categoryByGroup(group: string): NavCategory | undefined {
  return NAV_CATEGORIES.find((c) => c.group === group);
}

export const QUICK_ACTIONS: NavSection[] = QUICK_ACTION_PATHS.map((p) =>
  SECTION_BY_PATH.get(p),
).filter((s): s is NavSection => s !== undefined);
