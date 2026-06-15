import { Injectable, Logger } from '@nestjs/common';
import type { Server } from 'socket.io';

/**
 * Most mezi `SocialService`/chat gateway a socket.io serverem (M9 social).
 * Stejný vzor jako `ArenaEventsRelay`: drží referenci na `Server` (nastaví ji
 * chat gateway v `afterInit`), díky Redis pub/sub adaptéru (main.ts) doletí
 * `emit` i na socket připojený k jiné instanci API (škálovatelný fan-out).
 *
 * Oddělené od gateway → service nezávisí na gateway (žádný DI cyklus). Bez
 * nastaveného serveru (flow testy / běh bez WS) jsou emity no-op.
 */
@Injectable()
export class SocialEventsRelay {
  private readonly logger = new Logger(SocialEventsRelay.name);
  private server?: Server;

  /** Room pro notifikace dané postavy (sdílená konvence s arénou). */
  static room(characterId: string): string {
    return `char:${characterId}`;
  }

  /** Globální chat room. */
  static readonly CHAT_GLOBAL = 'chat:global';

  setServer(server: Server): void {
    this.server = server;
  }

  /** Oznámí cílové postavě příchozí žádost o přátelství (realtime odznak). */
  friendRequest(toCharacterId: string, fromName: string): void {
    this.emit(SocialEventsRelay.room(toCharacterId), 'social:friend_request', { fromName });
  }

  /** Oznámí postavě, že její žádost byla přijata. */
  friendAccepted(toCharacterId: string, byName: string): void {
    this.emit(SocialEventsRelay.room(toCharacterId), 'social:friend_accepted', { byName });
  }

  /** Rozešle chatovou zprávu do globálního kanálu. */
  chatMessage(message: unknown): void {
    this.emit(SocialEventsRelay.CHAT_GLOBAL, 'chat:message', message);
  }

  private emit(room: string, event: string, payload: unknown): void {
    if (!this.server) return;
    try {
      this.server.to(room).emit(event, payload);
    } catch (err) {
      this.logger.warn(`emit selhal (best-effort): ${(err as Error).message}`);
    }
  }
}
