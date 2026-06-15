import { Logger } from '@nestjs/common';
import {
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  type OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { AuthService } from '../auth/auth.service';
import { CharacterRepository } from '../character/character.repository';
import { ArenaEventsRelay } from './arena.events';
import { ArenaService } from './arena.service';

/** Interval (ms) odhalování dalších combat událostí při živém sledování. */
const WATCH_TICK_MS = 700;

interface SocketState {
  accountId?: string;
  watch?: ReturnType<typeof setInterval>;
}

/**
 * WebSocket vrstva Aren (M7). První reálný realtime transport v projektu
 * (M5 combat log byl jen REST polling). Škálovatelný přes Redis pub/sub adaptér
 * (viz main.ts → RedisIoAdapter): `server.to(room).emit` doletí i na socket
 * připojený k jiné instanci.
 *
 * Funkce:
 *  - `arena:subscribe` → join room postavy → příjem realtime `arena:match_found`.
 *  - `arena:watch` → server streamuje předpočítaný combat timeline po WS
 *    (odhalování dle uplynulého času). REST `GET …/arena/match/:id` je
 *    autoritativní fallback (jako M5 dungeon log).
 *
 * Gateway je tenký — veškerá logika v `ArenaService` (testováno přes pglite).
 * DI: gateway závisí na ArenaService + relay; service závisí jen na relay →
 * žádný cyklus.
 */
@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class ArenaGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(ArenaGateway.name);

  @WebSocketServer()
  private server!: Server;

  constructor(
    private readonly auth: AuthService,
    private readonly characters: CharacterRepository,
    private readonly arena: ArenaService,
    private readonly relay: ArenaEventsRelay,
  ) {}

  afterInit(server: Server): void {
    // Předej server relay → ArenaService může pushovat „match found".
    this.relay.setServer(server);
  }

  handleConnection(client: Socket): void {
    // JWT v handshake (auth.token nebo Authorization header).
    const token =
      (client.handshake.auth?.token as string | undefined) ??
      client.handshake.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!token) {
      client.disconnect(true);
      return;
    }
    try {
      const payload = this.auth.verifyAccessToken(token);
      (client.data as SocketState).accountId = payload.sub;
    } catch {
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    this.clearWatch(client);
  }

  /** Připojí socket k room postavy (po ověření vlastnictví) pro „match found". */
  @SubscribeMessage('arena:subscribe')
  async subscribe(client: Socket, payload: { characterId?: string }): Promise<{ ok: boolean }> {
    const accountId = (client.data as SocketState).accountId;
    const characterId = payload?.characterId;
    if (!accountId || !characterId) return { ok: false };

    const owned = await this.characters.findOwned(accountId, characterId);
    if (!owned) return { ok: false };

    await client.join(ArenaEventsRelay.room(characterId));
    return { ok: true };
  }

  /** Spustí živé streamování předpočítaného zápasu po WS. */
  @SubscribeMessage('arena:watch')
  watch(client: Socket, payload: { characterId?: string; matchId?: string }): { ok: boolean } {
    const accountId = (client.data as SocketState).accountId;
    const { characterId, matchId } = payload ?? {};
    if (!accountId || !characterId || !matchId) return { ok: false };

    this.clearWatch(client);
    const tick = async (): Promise<void> => {
      try {
        const view = await this.arena.getMatch(accountId, characterId, matchId);
        client.emit('arena:match', view);
        if (view.progress.completed) this.clearWatch(client);
      } catch (err) {
        client.emit('arena:error', { message: (err as Error).message });
        this.clearWatch(client);
      }
    };
    void tick();
    (client.data as SocketState).watch = setInterval(() => void tick(), WATCH_TICK_MS);
    return { ok: true };
  }

  @SubscribeMessage('arena:unwatch')
  unwatch(client: Socket): { ok: boolean } {
    this.clearWatch(client);
    return { ok: true };
  }

  private clearWatch(client: Socket): void {
    const state = client.data as SocketState;
    if (state.watch) {
      clearInterval(state.watch);
      state.watch = undefined;
    }
  }
}
