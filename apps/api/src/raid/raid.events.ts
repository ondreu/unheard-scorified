import { Injectable, Logger } from '@nestjs/common';
import type { Server } from 'socket.io';

/**
 * Most mezi `RaidService` a WebSocket gateway (M8). Recykluje vzor z M7 arény
 * (`ArenaEventsRelay`): drží referenci na socket.io `Server` (nastaví ji gateway
 * v `afterInit`). Díky Redis pub/sub adaptéru (main.ts) doletí emit i na socket
 * připojený k jiné instanci → škálovatelný realtime fan-out.
 *
 * Oddělené od gateway, aby service nezávisel na gateway → žádný DI cyklus. Bez
 * serveru (testy / běh bez WS) jsou emity no-op.
 */
@Injectable()
export class RaidEventsRelay {
  private readonly logger = new Logger(RaidEventsRelay.name);
  private server?: Server;

  static room(characterId: string): string {
    return `raidchar:${characterId}`;
  }

  setServer(server: Server): void {
    this.server = server;
  }

  /** Oznámí postavě, že byla vtažena do raidu (realtime „raid found"). */
  raidResolved(runId: string, raidId: string, characterId: string): void {
    this.emit(characterId, 'raid:resolved', { runId, raidId, characterId });
  }

  private emit(characterId: string, event: string, payload: unknown): void {
    if (!this.server) return;
    try {
      this.server.to(RaidEventsRelay.room(characterId)).emit(event, payload);
    } catch (err) {
      this.logger.warn(`emit selhal (best-effort): ${(err as Error).message}`);
    }
  }
}
