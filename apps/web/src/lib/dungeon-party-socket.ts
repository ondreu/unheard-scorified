/**
 * WebSocket klient pro živé MP tahové dungeon sezení (ADR 0038, Slice 4c).
 * Socket.IO přes `/api/socket.io` (jen websocket transport, multi-instance přes
 * Redis adaptér). View je per-viewer, takže server posílá lehký signál
 * `party:updated` → klient si vyžádá `party:state` (vrací jeho personalizovaný
 * view). Reconnection (4d): `connect` znovu joinne sezení.
 */
import { io, type Socket } from 'socket.io-client';
import { currentSession } from './auth';
import type { DungeonPartyRunView } from './api';

export function connectDungeonParty(): Socket {
  const token = currentSession()?.accessToken;
  return io({ path: '/api/socket.io', transports: ['websocket'], auth: { token }, autoConnect: true });
}

interface Ack {
  ok: boolean;
  run?: DungeonPartyRunView;
  error?: string;
}

/**
 * Připojí se do sezení runu, dodá počáteční stav a volá `onUpdate` při každé
 * změně (přes `party:updated` → `party:state`). Vrací funkci pro odpojení.
 */
export function joinPartyRun(
  socket: Socket,
  characterId: string,
  runId: string,
  onUpdate: (run: DungeonPartyRunView) => void,
  onError?: (message: string) => void,
): () => void {
  const join = (): void => {
    socket.emit('party:join', { characterId, runId }, (ack: Ack) => {
      if (ack?.ok && ack.run) onUpdate(ack.run);
      else if (ack?.error && onError) onError(ack.error);
    });
  };
  const refresh = (): void => {
    socket.emit('party:state', { characterId, runId }, (ack: Ack) => {
      if (ack?.ok && ack.run) onUpdate(ack.run);
    });
  };
  socket.on('connect', join);
  if (socket.connected) join();
  socket.on('party:updated', refresh);
  return () => {
    void socket.emit('party:leave', { runId });
    socket.off('connect', join);
    socket.off('party:updated', refresh);
  };
}

/** Pošle akci hráče pro aktuální kolo; vrací čerstvý view (server-authoritative). */
export function submitPartyTurn(
  socket: Socket,
  characterId: string,
  runId: string,
  abilityId: string,
  targetId: number,
  bonusAbilityId?: string,
  castTier?: number,
): Promise<DungeonPartyRunView> {
  return new Promise((resolve, reject) => {
    socket.emit('party:submit', { characterId, runId, abilityId, targetId, bonusAbilityId, castTier }, (ack: Ack) => {
      if (ack?.ok && ack.run) resolve(ack.run);
      else reject(new Error(ack?.error ?? 'Submit failed'));
    });
  });
}
