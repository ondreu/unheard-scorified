/**
 * „Živá" aukce — seedované NPC nabídky (M10+ FEAT). Auction House doplňuje o
 * deterministicky generované **NPC listingy**, aby působil obydleně i při malém
 * počtu hráčů. Jediný zdroj pravdy pro API i web (žádná duplikace, viz CLAUDE.md).
 *
 * Model:
 *  - NPC listingy se **nepersistují** — počítají se on-the-fly z aktuálního
 *    časového okna (rotace dle UTC) přes `SeededRng` (anti-cheat, reprodukovatelné).
 *  - Jen **buyout** (NPC nesmlouvá) → nákup = čistý gold sink, NPC nezasahují do
 *    reálných hráčských aukcí.
 *  - Hráč může každý listing koupit jednou; nákupy se evidují kvůli deduplikaci
 *    (API), listing pak z jeho výpisu zmizí.
 *  - Při rotaci okna se vygeneruje nová sada (stará id se přestanou tvořit).
 */
import { SeededRng, seedFromString } from './rng';
import { itemDisplayName, itemVendorValue, isAuctionable } from './auction';

/** Délka okna, po které se NPC nabídky rotují (UTC). */
export const NPC_AUCTION_WINDOW_HOURS = 6;
const WINDOW_MS = NPC_AUCTION_WINDOW_HOURS * 3600 * 1000;

/** Počet NPC listingů na jedno okno. */
export const NPC_AUCTION_COUNT = 10;

/** Prefix id NPC listingu (odlišení od reálných hráčských aukcí). */
const NPC_ID_PREFIX = 'npc:';

/** Začátek aktuálního NPC okna (UTC, zarovnáno na `WINDOW_MS`). */
export function npcAuctionWindowStart(now: number): number {
  return Math.floor(now / WINDOW_MS) * WINDOW_MS;
}

/** Konec aktuálního NPC okna (= začátek + délka okna). */
export function npcAuctionWindowEnd(now: number): number {
  return npcAuctionWindowStart(now) + WINDOW_MS;
}

/** Stabilní identifikátor aktuálního okna (pro seed i dedup nákupů). */
export function npcAuctionWindowId(now: number): string {
  return String(npcAuctionWindowStart(now));
}

/** Je to id NPC listingu (ne reálná hráčská aukce)? */
export function isNpcListingId(id: string): boolean {
  return id.startsWith(NPC_ID_PREFIX);
}

/** Fantasy jména NPC obchodníků (rotují per listing). */
export const NPC_SELLER_NAMES = [
  'Gazlowe',
  'Auctioneer Beardo',
  'Madam Goya',
  'Trader Jin',
  'Wenna Silkbeard',
  'Khazgorm',
  'Sila Hollowglen',
  'Provisioner Anson',
  'Yaelika Farclaw',
  'Bursar Brisbane',
  'Old Man Heming',
  'Merchant Aubrey',
] as const;

export interface NpcAuctionPoolEntry {
  itemId: string;
  /** Rozsah množství v jednom listingu (deterministicky vybráno). */
  minQty: number;
  maxQty: number;
}

/**
 * Sortiment, který NPC „prodávají" na AH — obchodní zboží (materiály, byliny,
 * spotřebáky) + batohy. Vše musí být `isAuctionable` (kontrolováno testem) — žádné
 * soulbound itemy.
 */
export const NPC_AUCTION_POOL: NpcAuctionPoolEntry[] = [
  // Ores (mining)
  { itemId: 'copper_ore', minQty: 5, maxQty: 20 },
  { itemId: 'iron_ore', minQty: 5, maxQty: 20 },
  { itemId: 'mithril_ore', minQty: 4, maxQty: 12 },
  { itemId: 'silver_ore', minQty: 2, maxQty: 8 },
  // Herbs (herbalism)
  { itemId: 'peacebloom', minQty: 5, maxQty: 20 },
  { itemId: 'briarthorn', minQty: 5, maxQty: 20 },
  { itemId: 'goldthorn', minQty: 4, maxQty: 12 },
  { itemId: 'swiftthistle', minQty: 2, maxQty: 8 },
  // Consumables (alchemy)
  { itemId: 'minor_healing_potion', minQty: 1, maxQty: 5 },
  { itemId: 'healing_potion', minQty: 1, maxQty: 5 },
  { itemId: 'superior_healing_potion', minQty: 1, maxQty: 3 },
  { itemId: 'elixir_of_strength', minQty: 1, maxQty: 2 },
  // Bags
  { itemId: 'small_pouch', minQty: 1, maxQty: 1 },
  { itemId: 'traveler_backpack', minQty: 1, maxQty: 1 },
  { itemId: 'reinforced_pack', minQty: 1, maxQty: 1 },
];

/** Násobek vendor hodnoty → tržní cena NPC listingu (gold sink). */
const PRICE_PREMIUM_MIN = 3;
const PRICE_PREMIUM_MAX = 7;

export interface NpcListing {
  /** `npc:<windowId>:<index>` — stabilní v rámci okna. */
  id: string;
  itemId: string;
  itemName: string;
  quantity: number;
  /** Pevná buyout cena (NPC nesmlouvá). */
  buyout: number;
  sellerName: string;
  /** Konec okna (epoch ms) — kdy listing „vyprší" a rotuje. */
  endsAt: number;
}

/**
 * Vygeneruje NPC listingy pro okno obsahující `now`. Deterministické: stejné okno
 * → stejná sada (seed z window id). Pořadí kreslení (item → qty → cena → jméno)
 * drží stabilitu i při změně `count`.
 */
export function generateNpcListings(now: number, count = NPC_AUCTION_COUNT): NpcListing[] {
  const windowId = npcAuctionWindowId(now);
  const endsAt = npcAuctionWindowEnd(now);
  const rng = new SeededRng(seedFromString(`npc-ah:${windowId}`));
  const listings: NpcListing[] = [];
  for (let i = 0; i < count; i++) {
    const entry = NPC_AUCTION_POOL[rng.int(0, NPC_AUCTION_POOL.length - 1)]!;
    const quantity = rng.int(entry.minQty, entry.maxQty);
    const unit = Math.max(1, itemVendorValue(entry.itemId));
    const premium = PRICE_PREMIUM_MIN + rng.next() * (PRICE_PREMIUM_MAX - PRICE_PREMIUM_MIN);
    const buyout = Math.max(1, Math.round(unit * premium * quantity));
    const sellerName = NPC_SELLER_NAMES[rng.int(0, NPC_SELLER_NAMES.length - 1)]!;
    listings.push({
      id: `${NPC_ID_PREFIX}${windowId}:${i}`,
      itemId: entry.itemId,
      itemName: itemDisplayName(entry.itemId),
      quantity,
      buyout,
      sellerName,
      endsAt,
    });
  }
  return listings;
}

/** Najde konkrétní NPC listing v aktuálním okně dle id (nebo undefined). */
export function findNpcListing(now: number, id: string): NpcListing | undefined {
  if (!isNpcListingId(id)) return undefined;
  return generateNpcListings(now).find((l) => l.id === id);
}

/** Platí dané id v aktuálním okně? (ochrana proti starému/cizímu id). */
export function isCurrentNpcListing(now: number, id: string): boolean {
  return findNpcListing(now, id) !== undefined;
}

/** Sanity helper pro testy: jsou všechny pool itemy obchodovatelné na AH? */
export function npcPoolIsAuctionable(): boolean {
  return NPC_AUCTION_POOL.every((e) => isAuctionable(e.itemId));
}
