/**
 * WebSocket klient pro Areny (M7). Socket.IO přes proxy `/api/socket.io`
 * (Caddy/vite strhne `/api` → server vidí default `/socket.io`). Používá jen
 * websocket transport (žádný polling) → multi-instance bez sticky sessions
 * (Redis pub/sub adaptér na serveru fan-outuje broadcasty).
 *
 * UI strings drženy odděleně od logiky (i18n-ready).
 */
import { io, type Socket } from 'socket.io-client';
import { currentSession } from './auth';
import type { ArenaMatchView } from './api';

export interface MatchFoundEvent {
  matchId: string;
  characterId: string;
}

/** Naváže autentizovaný socket (JWT v handshake). */
export function connectArena(): Socket {
  const token = currentSession()?.accessToken;
  return io({
    path: '/api/socket.io',
    transports: ['websocket'],
    auth: { token },
    autoConnect: true,
  });
}

/**
 * Přihlásí se k realtime notifikacím postavy (`arena:match_found`). Vrací funkci
 * pro odhlášení/odpojení.
 */
export function subscribeMatchFound(
  socket: Socket,
  characterId: string,
  onMatchFound: (e: MatchFoundEvent) => void,
): () => void {
  const join = (): void => {
    void socket.emit('arena:subscribe', { characterId });
  };
  socket.on('connect', join);
  if (socket.connected) join();
  socket.on('arena:match_found', onMatchFound);
  return () => {
    socket.off('connect', join);
    socket.off('arena:match_found', onMatchFound);
  };
}

/**
 * Spustí živé streamování zápasu po WS. Server posílá `arena:match` (postupně
 * odhalený timeline) dokud souboj neskončí. Vrací funkci pro zastavení.
 */
export function watchMatch(
  socket: Socket,
  characterId: string,
  matchId: string,
  onUpdate: (view: ArenaMatchView) => void,
  onError?: (message: string) => void,
): () => void {
  const start = (): void => {
    void socket.emit('arena:watch', { characterId, matchId });
  };
  socket.on('connect', start);
  if (socket.connected) start();
  socket.on('arena:match', onUpdate);
  if (onError) socket.on('arena:error', (e: { message: string }) => onError(e.message));
  return () => {
    void socket.emit('arena:unwatch');
    socket.off('connect', start);
    socket.off('arena:match', onUpdate);
    socket.off('arena:error');
  };
}
