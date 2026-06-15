/**
 * P2P trade (M8.5-D): přímá výměna itemů + zlata mezi dvěma postavami. Sdílené
 * stavy a čisté helpery (shodné BE i FE). Stavová koordinace žije v `apps/api`.
 *
 * Soulbound (BoP) loot se přes běžný trade vyměnit nedá — trade-window pro BoP
 * (výměna jen mezi účastníky téhož runu v časovém okně) je samostatný follow-up.
 *
 * UI strings drž odděleně od logiky (i18n-ready).
 */
import { isAuctionable } from './auction';

/** Stav trade session: open (vyjednává se) → completed | cancelled. */
export const TRADE_STATUSES = ['open', 'completed', 'cancelled'] as const;
export type TradeStatus = (typeof TRADE_STATUSES)[number];

/** Strana trade: iniciátor (kdo otevřel) vs partner. */
export const TRADE_SIDES = ['initiator', 'partner'] as const;
export type TradeSide = (typeof TRADE_SIDES)[number];

/**
 * Lze item nabídnout v P2P trade? Stejné pravidlo jako AH: musí být známý a
 * **ne soulbound** (BoP). Materiály a spotřebáky soulbound nejsou. Jediný zdroj
 * pravdy pro trade filtr/validaci (API i web).
 */
export function canTradeItem(itemId: string): boolean {
  return isAuctionable(itemId);
}

/** Obě strany potvrdily → trade se může provést. */
export function tradeReady(initiatorConfirmed: boolean, partnerConfirmed: boolean): boolean {
  return initiatorConfirmed && partnerConfirmed;
}
