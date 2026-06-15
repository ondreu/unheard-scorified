/**
 * Auction House (M8, ekonomika). Vzorce a konstanty pro hráčský obchod — jediný
 * zdroj pravdy pro API i web (žádná duplikace, viz CLAUDE.md). Model (rozhodnutí
 * PM): buyout + bidding s **depositem** (gold sink při výpisu) a **AH cut**
 * (procento z prodeje, gold sink) + expirace. Viz ADR 0012.
 *
 * Gold tok:
 *  - Při výpisu se strhne deposit (sink; vrací se jen při úspěšném prodeji).
 *  - Bid escrowuje zlato kupce (strhne se hned, při přehození se vrátí).
 *  - Při prodeji dostane prodejce `cena − cut` + zpět deposit; item jde kupci.
 *  - Při expiraci bez nabídky se item vrátí prodejci, deposit propadá (sink).
 */
import { ITEMS, isSoulbound } from './data/items';
import { MATERIALS, CONSUMABLES, type ConsumableId, type MaterialId } from './data/materials';

/** Povolené délky aukce (idle hra → delší okna). */
export interface AuctionDurationDef {
  id: AuctionDurationId;
  hours: number;
  /** Násobek depositu (delší okno = vyšší deposit). */
  depositFactor: number;
}
export type AuctionDurationId = 'short' | 'medium' | 'long';

/** Stav aukce. `active` → `sold` | `expired` | `cancelled` (terminální). */
export type AuctionStatus = 'active' | 'sold' | 'expired' | 'cancelled';

export const AUCTION_DURATIONS: Record<AuctionDurationId, AuctionDurationDef> = {
  short: { id: 'short', hours: 12, depositFactor: 1 },
  medium: { id: 'medium', hours: 24, depositFactor: 2 },
  long: { id: 'long', hours: 48, depositFactor: 4 },
};

export function isAuctionDurationId(value: string): value is AuctionDurationId {
  return value in AUCTION_DURATIONS;
}

/** Podíl AH cut z prodejní ceny (gold sink). */
export const AUCTION_CUT_RATE = 0.05;
/** Základní podíl deposit z vendor hodnoty (per kus, per `short` okno). */
export const AUCTION_DEPOSIT_RATE = 0.15;
/** Minimální přihození jako podíl aktuální nabídky. */
export const AUCTION_BID_INCREMENT_RATE = 0.05;

/** Vendor hodnota itemu (gear / materiál / spotřebák); 0 pro neznámý. */
export function itemVendorValue(itemId: string): number {
  return (
    ITEMS[itemId]?.vendorGold ??
    MATERIALS[itemId as MaterialId]?.vendorGold ??
    CONSUMABLES[itemId as ConsumableId]?.vendorGold ??
    0
  );
}

/** Zobrazované jméno itemu (gear / materiál / spotřebák); fallback = id. */
export function itemDisplayName(itemId: string): string {
  return (
    ITEMS[itemId]?.name ??
    MATERIALS[itemId as MaterialId]?.name ??
    CONSUMABLES[itemId as ConsumableId]?.name ??
    itemId
  );
}

/** Je item znám (existuje v některém katalogu)? */
export function isTradeableItem(itemId: string): boolean {
  return (
    itemId in ITEMS ||
    itemId in MATERIALS ||
    itemId in CONSUMABLES
  );
}

/**
 * Smí se item vůbec vypsat na Auction House (M8.6)? Musí být známý a **ne
 * soulbound** (BoP). Materiály a spotřebáky soulbound nejsou. Jediný zdroj
 * pravdy pro AH filtr/validaci (API i web).
 */
export function isAuctionable(itemId: string): boolean {
  return isTradeableItem(itemId) && !isSoulbound(itemId);
}

/** Deposit za výpis (gold sink). Závisí na vendor hodnotě, množství a délce. */
export function auctionDeposit(itemId: string, quantity: number, duration: AuctionDurationId): number {
  const unit = itemVendorValue(itemId);
  const factor = AUCTION_DURATIONS[duration].depositFactor;
  return Math.max(1, Math.round(unit * quantity * AUCTION_DEPOSIT_RATE * factor));
}

/** AH cut z prodejní ceny (gold sink), který si AH nechá. */
export function auctionCut(price: number): number {
  return Math.max(0, Math.round(price * AUCTION_CUT_RATE));
}

/** Kolik prodejce čistě dostane za prodej za danou cenu (cena − cut). */
export function sellerProceeds(price: number): number {
  return price - auctionCut(price);
}

/** Minimální přípustná příští nabídka (start bid, nebo aktuální + inkrement). */
export function minNextBid(startBid: number, currentBid: number | null): number {
  if (currentBid === null) return startBid;
  return currentBid + Math.max(1, Math.round(currentBid * AUCTION_BID_INCREMENT_RATE));
}
