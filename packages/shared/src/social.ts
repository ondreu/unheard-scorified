/**
 * Sociální systém (M9): friends + jednoduchý chat. Sdílené typy, konstanty a
 * čisté helpery (jediný zdroj pravdy pro API i web). Veškerá business logika
 * (DB, realtime) žije v `apps/api`; tady jsou jen deterministické, testovatelné
 * kousky a hodnoty, které musí být shodné na BE i FE.
 *
 * UI strings (hlášky) drž odděleně od logiky — i18n-ready (viz ROADMAP).
 */

/** Stav žádosti o přátelství. Odmítnutí = smazání řádku (žádný stav `declined`). */
export const FRIEND_REQUEST_STATUSES = ['pending', 'accepted'] as const;
export type FriendRequestStatus = (typeof FRIEND_REQUEST_STATUSES)[number];

/** Maximální počet přátel na postavu (anti-spam, drží UI/zápasové seznamy malé). */
export const MAX_FRIENDS = 100;

/**
 * Vrátí id „té druhé" postavy ve vztahu z pohledu `selfId`. Vztah je uložen jako
 * jeden řádek (requester ↔ addressee); pro výpis přátel potřebujeme protistranu.
 * Vrací `undefined`, pokud `selfId` není ani jedna ze stran (obrana proti chybě).
 */
export function friendCounterpart(
  selfId: string,
  requesterId: string,
  addresseeId: string,
): string | undefined {
  if (selfId === requesterId) return addresseeId;
  if (selfId === addresseeId) return requesterId;
  return undefined;
}

/** Postava nemůže přidat sama sebe (alty napříč účty povoleny). */
export function canBefriend(selfId: string, targetId: string): boolean {
  return selfId !== targetId && targetId.length > 0;
}

// ── Chat ──────────────────────────────────────────────────────────────────

/**
 * Chat kanály (M9). Zatím jen globální; frakční/guild kanály lze přidat později
 * bez refaktoru (kanál je datový atribut).
 */
export const CHAT_CHANNELS = ['global'] as const;
export type ChatChannel = (typeof CHAT_CHANNELS)[number];

export function isChatChannel(value: string): value is ChatChannel {
  return (CHAT_CHANNELS as readonly string[]).includes(value);
}

/** Maximální délka jedné zprávy (po normalizaci). */
export const MAX_CHAT_MESSAGE_LENGTH = 256;

/** Kolik posledních zpráv kanálu se drží/posílá do historie. */
export const CHAT_HISTORY_LIMIT = 50;

/**
 * Normalizuje surovou zprávu z UI: ořeže okraje, sjednotí bílé znaky na mezery
 * (žádné řádkové triky/spam) a ořízne na max délku. Prázdná po normalizaci =
 * neplatná (volající odmítne). Deterministické → sdílené BE i FE.
 */
export function sanitizeChatMessage(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, MAX_CHAT_MESSAGE_LENGTH);
}

/** Validní zpráva = po normalizaci neprázdná. */
export function isValidChatMessage(raw: string): boolean {
  return sanitizeChatMessage(raw).length > 0;
}
