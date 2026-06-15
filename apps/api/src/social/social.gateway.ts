import { Logger } from '@nestjs/common';
import {
  type OnGatewayConnection,
  type OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { isChatChannel, type ChatChannel } from '@game/shared';
import { AuthService } from '../auth/auth.service';
import { CharacterRepository } from '../character/character.repository';
import { ChatService, type ChatMessageView } from './chat.service';
import { SocialEventsRelay } from './social.events';

interface SocketState {
  accountId?: string;
}

/**
 * WebSocket vrstva sociálního systému (M9). Recykluje realtime transport z M7
 * (socket.io + Redis pub/sub adaptér, viz main.ts → multi-instance fan-out).
 *
 * Funkce:
 *  - `social:subscribe` → join room postavy → příjem `social:friend_request` /
 *    `social:friend_accepted`.
 *  - `chat:join` → join globální chat room, vrátí historii.
 *  - `chat:send` → odešle zprávu (persistuje + rozešle přes relay).
 *
 * Gateway je tenký — logika v `ChatService`/`SocialService`. Nastaví server na
 * sdílený `SocialEventsRelay` (v `afterInit`) → service nezávisí na gateway.
 */
@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class SocialGateway implements OnGatewayInit, OnGatewayConnection {
  private readonly logger = new Logger(SocialGateway.name);

  @WebSocketServer()
  private server!: Server;

  constructor(
    private readonly auth: AuthService,
    private readonly characters: CharacterRepository,
    private readonly chat: ChatService,
    private readonly relay: SocialEventsRelay,
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

  /** Join room postavy pro realtime notifikace přátelství (po ověření vlastnictví). */
  @SubscribeMessage('social:subscribe')
  async subscribe(client: Socket, payload: { characterId?: string }): Promise<{ ok: boolean }> {
    const accountId = (client.data as SocketState).accountId;
    const characterId = payload?.characterId;
    if (!accountId || !characterId) return { ok: false };
    const owned = await this.characters.findOwned(accountId, characterId);
    if (!owned) return { ok: false };
    await client.join(SocialEventsRelay.room(characterId));
    return { ok: true };
  }

  /** Join chat room + vrátí historii kanálu. */
  @SubscribeMessage('chat:join')
  async join(
    client: Socket,
    payload: { characterId?: string; channel?: string },
  ): Promise<{ ok: boolean; history?: ChatMessageView[] }> {
    const accountId = (client.data as SocketState).accountId;
    const characterId = payload?.characterId;
    const channel: ChatChannel = isChatChannel(payload?.channel ?? '') ? (payload!.channel as ChatChannel) : 'global';
    if (!accountId || !characterId) return { ok: false };
    try {
      const history = await this.chat.history(accountId, characterId, channel);
      await client.join(SocialEventsRelay.CHAT_GLOBAL);
      return { ok: true, history };
    } catch {
      return { ok: false };
    }
  }

  /** Odešle chatovou zprávu (persistuje + rozešle všem v kanálu). */
  @SubscribeMessage('chat:send')
  async send(
    client: Socket,
    payload: { characterId?: string; body?: string; channel?: string },
  ): Promise<{ ok: boolean; error?: string }> {
    const accountId = (client.data as SocketState).accountId;
    const { characterId, body } = payload ?? {};
    const channel: ChatChannel = isChatChannel(payload?.channel ?? '') ? (payload!.channel as ChatChannel) : 'global';
    if (!accountId || !characterId || !body) return { ok: false };
    try {
      await this.chat.send(accountId, characterId, body, channel);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }
}
