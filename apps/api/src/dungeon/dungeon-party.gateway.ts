import { Logger } from '@nestjs/common';
import {
  type OnGatewayConnection,
  type OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { AuthService } from '../auth/auth.service';
import { DungeonPartyEventsRelay } from './dungeon-party.events';
import { DungeonPartyService, type DungeonPartyRunView } from './dungeon-party.service';

interface SocketState {
  accountId?: string;
}

/**
 * WebSocket vrstva živého MP tahového dungeonu (ADR 0038, Slice 4c). Push přes
 * Redis adaptér (multi-instance). View je per-viewer, takže push je lehký signál
 * `party:updated` (z relay) → klient si vyžádá svůj `party:state`. `party:submit`
 * jede přes service (server-authoritative) a vrátí čerstvý view; relay zároveň
 * probudí ostatní v sezení. Reconnection (4d) = klient znovu `party:join`.
 *
 * Gateway je tenký — logika v `DungeonPartyService` (testováno přes pglite).
 */
@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class DungeonPartyGateway implements OnGatewayInit, OnGatewayConnection {
  private readonly logger = new Logger(DungeonPartyGateway.name);

  @WebSocketServer()
  private server!: Server;

  constructor(
    private readonly auth: AuthService,
    private readonly party: DungeonPartyService,
    private readonly relay: DungeonPartyEventsRelay,
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

  /** Připojí socket do sezení runu (po ověření účasti) a vrátí aktuální stav. */
  @SubscribeMessage('party:join')
  async join(
    client: Socket,
    payload: { characterId?: string; runId?: string },
  ): Promise<{ ok: boolean; run?: DungeonPartyRunView; error?: string }> {
    const accountId = (client.data as SocketState).accountId;
    const { characterId, runId } = payload ?? {};
    if (!accountId || !characterId || !runId) return { ok: false, error: 'Bad request' };
    try {
      const run = await this.party.getRun(accountId, characterId, runId);
      await client.join(DungeonPartyEventsRelay.room(runId));
      return { ok: true, run };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  /** Vyžádá si aktuální (personalizovaný) stav runu — po `party:updated`. */
  @SubscribeMessage('party:state')
  async state(
    client: Socket,
    payload: { characterId?: string; runId?: string },
  ): Promise<{ ok: boolean; run?: DungeonPartyRunView; error?: string }> {
    const accountId = (client.data as SocketState).accountId;
    const { characterId, runId } = payload ?? {};
    if (!accountId || !characterId || !runId) return { ok: false, error: 'Bad request' };
    try {
      return { ok: true, run: await this.party.getRun(accountId, characterId, runId) };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  /** Pošle akci hráče pro aktuální kolo (server-authoritative). */
  @SubscribeMessage('party:submit')
  async submit(
    client: Socket,
    payload: { characterId?: string; runId?: string; abilityId?: string; targetId?: number; bonusAbilityId?: string; castTier?: number },
  ): Promise<{ ok: boolean; run?: DungeonPartyRunView; error?: string }> {
    const accountId = (client.data as SocketState).accountId;
    const { characterId, runId, abilityId, targetId, bonusAbilityId, castTier } = payload ?? {};
    if (!accountId || !characterId || !runId || !abilityId) return { ok: false, error: 'Bad request' };
    try {
      const run = await this.party.submit(accountId, characterId, runId, abilityId, targetId ?? 0, bonusAbilityId, castTier);
      return { ok: true, run };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  @SubscribeMessage('party:leave')
  async leave(client: Socket, payload: { runId?: string }): Promise<{ ok: boolean }> {
    if (payload?.runId) await client.leave(DungeonPartyEventsRelay.room(payload.runId));
    return { ok: true };
  }
}
