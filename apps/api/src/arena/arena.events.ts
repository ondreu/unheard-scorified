import { Injectable, Logger } from '@nestjs/common';
import type { Server } from 'socket.io';

/**
 * Most mezi `ArenaService` a WebSocket gateway (M7). Drží referenci na socket.io
 * `Server` (nastaví ji gateway v `afterInit`). Díky Redis pub/sub adaptéru
 * (viz main.ts) `server.to(room).emit` doručí i na socket připojený k JINÉ
 * instanci API → škálovatelný realtime fan-out (ADR 0003, 0010).
 *
 * Oddělené od gateway, aby service nezávisel na gateway (a obráceně) → žádný
 * DI cyklus. Bez nastaveného serveru (testy / běh bez WS) jsou emity no-op.
 */
@Injectable()
export class ArenaEventsRelay {
  private readonly logger = new Logger(ArenaEventsRelay.name);
  private server?: Server;

  /** Room pro notifikace dané postavy. */
  static room(characterId: string): string {
    return `char:${characterId}`;
  }

  setServer(server: Server): void {
    this.server = server;
  }

  /** Oznámí oběma stranám spárování (realtime „match found"). */
  matchFound(matchId: string, aCharacterId: string, bCharacterId: string): void {
    this.emit(aCharacterId, 'arena:match_found', { matchId, characterId: aCharacterId });
    this.emit(bCharacterId, 'arena:match_found', { matchId, characterId: bCharacterId });
  }

  private emit(characterId: string, event: string, payload: unknown): void {
    if (!this.server) return;
    try {
      this.server.to(ArenaEventsRelay.room(characterId)).emit(event, payload);
    } catch (err) {
      this.logger.warn(`emit selhal (best-effort): ${(err as Error).message}`);
    }
  }
}
