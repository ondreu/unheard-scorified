import { Injectable, Logger } from '@nestjs/common';
import type { Server } from 'socket.io';

/**
 * Most mezi `DungeonPartyService` a WS gateway (ADR 0038, Slice 4c). Drží
 * referenci na socket.io `Server` (nastaví ji gateway v `afterInit`). Díky Redis
 * pub/sub adaptéru `server.to(room).emit` doletí i na socket na JINÉ instanci →
 * škálovatelný realtime fan-out (ADR 0003, 0010). Bez serveru (testy / běh bez
 * WS) jsou emity no-op.
 *
 * View runu je **per-viewer** (jiný `you` na hráče), proto se po WS posílá jen
 * lehký signál `party:updated` (runId + status); klient si pak vyžádá svůj
 * personalizovaný stav (`party:state` / REST `getRun`).
 */
@Injectable()
export class DungeonPartyEventsRelay {
  private readonly logger = new Logger(DungeonPartyEventsRelay.name);
  private server?: Server;

  /** Room živého MP runu. */
  static room(runId: string): string {
    return `party-run:${runId}`;
  }

  setServer(server: Server): void {
    this.server = server;
  }

  /** Oznámí všem ve sezení, že se stav runu změnil (klient si dotáhne svůj view). */
  notifyUpdated(runId: string, status: string): void {
    if (!this.server) return;
    try {
      this.server.to(DungeonPartyEventsRelay.room(runId)).emit('party:updated', { runId, status });
    } catch (err) {
      this.logger.warn(`emit selhal (best-effort): ${(err as Error).message}`);
    }
  }
}
