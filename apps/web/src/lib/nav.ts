/**
 * Navigační sekce postavy — jediný zdroj pravdy pro shell (kompaktní nav) i
 * overview hub (velké karty). Pořadí = priorita. Trade tu schválně NENÍ:
 * obchod se zahajuje kliknutím přímo na hráče (inspect profil), ne solo tlačítkem.
 */
export interface NavSection {
  /** Cesta relativně k /characters/[id] (prázdná = overview). */
  path: string;
  icon: string;
  title: string;
  sub: string;
  accent: string;
  /** Logické seskupení pro overview hub. */
  group: 'play' | 'progress' | 'social' | 'economy';
}

export const NAV_SECTIONS: NavSection[] = [
  { path: 'quests', icon: '📜', title: 'Quests', sub: 'Send out & earn XP', accent: 'var(--gold)', group: 'play' },
  { path: 'dungeons', icon: '🗝️', title: 'Dungeons', sub: 'Idle PVE runs', accent: '#9b7bd4', group: 'play' },
  { path: 'raids', icon: '🐉', title: 'Raids', sub: 'Group PVE bosses', accent: 'var(--horde)', group: 'play' },
  { path: 'arena', icon: '⚔️', title: 'Arena', sub: 'Rated PVP ladder', accent: '#e0925a', group: 'play' },

  { path: 'inventory', icon: '🎒', title: 'Inventory', sub: 'Gear & equipment', accent: 'var(--gold)', group: 'progress' },
  { path: 'talents', icon: '🌳', title: 'Talents', sub: 'Spend talent points', accent: 'var(--r-uncommon)', group: 'progress' },
  { path: 'professions', icon: '⚒️', title: 'Professions', sub: 'Gather & craft', accent: '#c79c6e', group: 'progress' },
  { path: 'achievements', icon: '🏆', title: 'Achievements', sub: 'Goals & rewards', accent: 'var(--gold-bright)', group: 'progress' },
  { path: 'mounts', icon: '🐎', title: 'Mounts', sub: 'Travel speed', accent: 'var(--r-uncommon)', group: 'progress' },
  { path: 'consumables', icon: '🧪', title: 'Consumables', sub: 'Use potions & elixirs', accent: 'var(--r-rare)', group: 'progress' },

  { path: 'group', icon: '👥', title: 'Group', sub: 'Party up', accent: 'var(--info)', group: 'social' },
  { path: 'social', icon: '💬', title: 'Friends & Chat', sub: 'Social & global chat', accent: 'var(--info)', group: 'social' },
  { path: 'mail', icon: '✉️', title: 'Mail', sub: 'Offline messages & items', accent: 'var(--gold)', group: 'social' },
  { path: 'guild', icon: '🏰', title: 'Guild', sub: 'Your guild', accent: '#9482c9', group: 'social' },

  { path: 'auctions', icon: '💰', title: 'Auction House', sub: 'Buy & sell', accent: 'var(--gold-bright)', group: 'economy' },
  { path: 'vendor', icon: '🏪', title: 'Vendor', sub: 'NPC buy & sell', accent: 'var(--gold)', group: 'economy' },
];

export const GROUP_LABELS: Record<NavSection['group'], string> = {
  play: 'Play',
  progress: 'Progression',
  social: 'Social',
  economy: 'Economy',
};
