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

/** Přihlásí postavu k realtime notifikacím (přátelství + guild pozvánky). */
export function subscribeSocial(
  socket: Socket,
  characterId: string,
  handlers: {
    onFriendRequest?: (e: FriendRequestEvent) => void;
    onFriendAccepted?: (e: FriendAcceptedEvent) => void;
    onGuildInvite?: (e: GuildInviteEvent) => void;
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
  return () => {
    socket.off('connect', join);
    if (handlers.onFriendRequest) socket.off('social:friend_request', handlers.onFriendRequest);
    if (handlers.onFriendAccepted) socket.off('social:friend_accepted', handlers.onFriendAccepted);
    if (handlers.onGuildInvite) socket.off('guild:invite', handlers.onGuildInvite);
  };
}

/**
 * Připojí se k globálnímu chatu: nahraje historii (ack) a poslouchá nové zprávy.
 * Vrací odhlašovací funkci.
 */
export function joinChat(
  socket: Socket,
  characterId: string,
  onMessage: (m: ChatMessageView) => void,
  onHistory?: (history: ChatMessageView[]) => void,
): () => void {
  const join = (): void => {
    socket.emit(
      'chat:join',
      { characterId, channel: 'global' },
      (res: { ok: boolean; history?: ChatMessageView[] }) => {
        if (res?.ok && res.history && onHistory) onHistory(res.history);
      },
    );
  };
  socket.on('connect', join);
  if (socket.connected) join();
  socket.on('chat:message', onMessage);
  return () => {
    socket.off('connect', join);
    socket.off('chat:message', onMessage);
  };
}

/** Odešle chatovou zprávu po WS (ack vrací ok/chybu). */
export function sendChat(socket: Socket, characterId: string, body: string): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.emit(
      'chat:send',
      { characterId, body, channel: 'global' },
      (res: { ok: boolean; error?: string }) => {
        if (res?.ok) resolve();
        else reject(new Error(res?.error ?? 'Failed to send'));
      },
    );
  });
}
