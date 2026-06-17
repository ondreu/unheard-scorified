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
 * Persistované chat kanály.
 *  - `global` — všichni hráči, jeden sdílený proud.
 *  - `guild` — jen členové guildy (M9 chat overhaul); zprávy jsou „scoped" na
 *    konkrétní guildu (viz `isScopedChannel` + `scope_id` v DB).
 *
 * Whisper je 1:1 a **neperzistovaný** (online-only, doručení přes WS; offline
 * fallback = Mail) → záměrně NENÍ kanál (v UI je to jen samostatná záložka).
 * Další kanály (frakční, party) lze přidat bez refaktoru (kanál = datový atribut).
 */
export const CHAT_CHANNELS = ['global', 'guild'] as const;
export type ChatChannel = (typeof CHAT_CHANNELS)[number];

export function isChatChannel(value: string): value is ChatChannel {
  return (CHAT_CHANNELS as readonly string[]).includes(value);
}

/**
 * Kanály vázané na konkrétní entitu (potřebují `scope_id`): guild chat patří
 * dané guildě, takže historie i fan-out se filtrují podle `scopeId` (guildId).
 * Globální kanál scope nemá (`scopeId = null`).
 */
export function isScopedChannel(channel: ChatChannel): boolean {
  return channel === 'guild';
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
