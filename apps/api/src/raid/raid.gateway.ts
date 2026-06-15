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
import { RaidEventsRelay } from './raid.events';
import { RaidService } from './raid.service';

/** Interval (ms) odhalování dalších combat událostí při živém sledování. */
const WATCH_TICK_MS = 700;

interface SocketState {
  accountId?: string;
  watch?: ReturnType<typeof setInterval>;
}

/**
 * WebSocket vrstva raidů (M8). Recykluje realtime vrstvu z M7 arény (Socket.IO +
 * Redis pub/sub adaptér v main.ts → škálovatelné napříč instancemi, žádné sticky
 * sessions). REST `GET …/raids/run/:runId` je autoritativní fallback.
 *
 *  - `raid:subscribe` → join room postavy → příjem `raid:resolved` (byl(a) jsem
 *    vtažen(a) do cizí party).
 *  - `raid:watch` → server streamuje předpočítaný combat timeline (reveal dle času).
 *
 * Gateway je tenký — logika v `RaidService`. DI: gateway závisí na service + relay;
 * service závisí jen na relay → žádný cyklus.
 */
@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class RaidGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RaidGateway.name);

  @WebSocketServer()
  private server!: Server;

  constructor(
    private readonly auth: AuthService,
    private readonly characters: CharacterRepository,
    private readonly raids: RaidService,
    private readonly relay: RaidEventsRelay,
  ) {}

  afterInit(server: Server): void {
    this.relay.setServer(server);
  }

  handleConnection(client: Socket): void {
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

  @SubscribeMessage('raid:subscribe')
  async subscribe(client: Socket, payload: { characterId?: string }): Promise<{ ok: boolean }> {
    const accountId = (client.data as SocketState).accountId;
    const characterId = payload?.characterId;
    if (!accountId || !characterId) return { ok: false };
    const owned = await this.characters.findOwned(accountId, characterId);
    if (!owned) return { ok: false };
    await client.join(RaidEventsRelay.room(characterId));
    return { ok: true };
  }

  @SubscribeMessage('raid:watch')
  watch(client: Socket, payload: { characterId?: string; runId?: string }): { ok: boolean } {
    const accountId = (client.data as SocketState).accountId;
    const { characterId, runId } = payload ?? {};
    if (!accountId || !characterId || !runId) return { ok: false };

    this.clearWatch(client);
    const tick = async (): Promise<void> => {
      try {
        const view = await this.raids.getRun(accountId, characterId, runId);
        client.emit('raid:run', view);
        if (view.progress.completed) this.clearWatch(client);
      } catch (err) {
        client.emit('raid:error', { message: (err as Error).message });
        this.clearWatch(client);
      }
    };
    void tick();
    (client.data as SocketState).watch = setInterval(() => void tick(), WATCH_TICK_MS);
    return { ok: true };
  }

  @SubscribeMessage('raid:unwatch')
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
