/**
 * WebSocket klient pro sociální systém (M9): friend notifikace + globální chat.
 * Recykluje stejný transport jako arény (socket.io přes `/api/socket.io`, jen
 * websocket transport → multi-instance bez sticky sessions; Redis pub/sub
 * adaptér na serveru fan-outuje broadcasty).
 *
 * UI strings drženy odděleně od logiky (i18n-ready).
 */
import { io, type Socket } from 'socket.io-client';
import { currentTokens } from './auth';
import type { ChatMessageView } from './api';

/** Naváže autentizovaný socket (JWT v handshake). */
export function connectSocial(): Socket {
  const token = currentTokens()?.accessToken;
  return io({
    path: '/api/socket.io',
    transports: ['websocket'],
    auth: { token },
    autoConnect: true,
  });
}

export interface FriendRequestEvent {
  fromName: string;
}
export interface FriendAcceptedEvent {
  byName: string;
}
export interface GuildInviteEvent {
  guildName: string;
  byName: string;
}
export interface GuildCharterInviteEvent {
  guildName: string;
  byName: string;
}
export interface WhisperEvent {
  fromCharacterId: string;
  fromName: string;
  body: string;
  at: string;
}
/** Změna online stavu přítele (M9 chat overhaul). */
export interface PresenceEvent {
  characterId: string;
  online: boolean;
}

/** Persistované chat kanály na klientu (mirror `@game/shared` CHAT_CHANNELS). */
export type ChatChannel = 'global' | 'guild';

/** Přihlásí postavu k realtime notifikacím (přátelství + guild + whisper + presence). */
export function subscribeSocial(
  socket: Socket,
  characterId: string,
  handlers: {
    onFriendRequest?: (e: FriendRequestEvent) => void;
    onFriendAccepted?: (e: FriendAcceptedEvent) => void;
    onGuildInvite?: (e: GuildInviteEvent) => void;
    onGuildCharterInvite?: (e: GuildCharterInviteEvent) => void;
    onWhisper?: (e: WhisperEvent) => void;
    onPresence?: (e: PresenceEvent) => void;
  },
): () => void {
  const join = (): void => {
    void socket.emit('social:subscribe', { characterId });
  };
  socket.on('connect', join);
  if (socket.connected) join();
  if (handlers.onFriendRequest) socket.on('social:friend_request', handlers.onFriendRequest);
  if (handlers.onFriendAccepted) socket.on('social:friend_accepted', handlers.onFriendAccepted);
  if (handlers.onGuildInvite) socket.on('guild:invite', handlers.onGuildInvite);
  if (handlers.onGuildCharterInvite) socket.on('guild:charter_invite', handlers.onGuildCharterInvite);
  if (handlers.onWhisper) socket.on('whisper:message', handlers.onWhisper);
  if (handlers.onPresence) socket.on('social:presence', handlers.onPresence);
  return () => {
    socket.off('connect', join);
    if (handlers.onFriendRequest) socket.off('social:friend_request', handlers.onFriendRequest);
    if (handlers.onFriendAccepted) socket.off('social:friend_accepted', handlers.onFriendAccepted);
    if (handlers.onGuildInvite) socket.off('guild:invite', handlers.onGuildInvite);
    if (handlers.onGuildCharterInvite) socket.off('guild:charter_invite', handlers.onGuildCharterInvite);
    if (handlers.onWhisper) socket.off('whisper:message', handlers.onWhisper);
    if (handlers.onPresence) socket.off('social:presence', handlers.onPresence);
  };
}

/**
 * Připojí se k chat kanálu (`global` / `guild`): nahraje historii (ack) a
 * poslouchá nové zprávy. Server fan-outuje `chat:message` jen do room daného
 * kanálu/scope, takže příjemce filtruje podle `channel`/`scopeId` zprávy.
 * Vrací odhlašovací funkci.
 */
export function joinChat(
  socket: Socket,
  characterId: string,
  channel: ChatChannel,
  onMessage: (m: ChatMessageView) => void,
  onHistory?: (history: ChatMessageView[]) => void,
): () => void {
  const join = (): void => {
    socket.emit(
      'chat:join',
      { characterId, channel },
      (res: { ok: boolean; history?: ChatMessageView[] }) => {
        if (res?.ok && res.history && onHistory) onHistory(res.history);
      },
    );
  };
  // Filtruj zprávy na zvolený kanál (jeden socket může být v global i guild room).
  const handle = (m: ChatMessageView): void => {
    if ((m.channel ?? 'global') === channel) onMessage(m);
  };
  socket.on('connect', join);
  if (socket.connected) join();
  socket.on('chat:message', handle);
  return () => {
    socket.off('connect', join);
    socket.off('chat:message', handle);
  };
}

/**
 * Odešle whisper (online-only 1:1). Ack vrací, zda byl doručen (příjemce online).
 * Při `delivered:false` UI nabídne Mail jako offline fallback.
 */
export function sendWhisper(
  socket: Socket,
  fromCharacterId: string,
  toCharacterId: string,
  body: string,
): Promise<{ delivered: boolean }> {
  return new Promise((resolve, reject) => {
    socket.emit(
      'whisper:send',
      { fromCharacterId, toCharacterId, body },
      (res: { ok: boolean; delivered?: boolean; error?: string }) => {
        if (res?.ok) resolve({ delivered: !!res.delivered });
        else reject(new Error(res?.error ?? 'Failed to whisper'));
      },
    );
  });
}

/** Odešle chatovou zprávu po WS do daného kanálu (ack vrací ok/chybu). */
export function sendChat(
  socket: Socket,
  characterId: string,
  body: string,
  channel: ChatChannel = 'global',
): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.emit(
      'chat:send',
      { characterId, body, channel },
      (res: { ok: boolean; error?: string }) => {
        if (res?.ok) resolve();
        else reject(new Error(res?.error ?? 'Failed to send'));
      },
    );
  });
}
