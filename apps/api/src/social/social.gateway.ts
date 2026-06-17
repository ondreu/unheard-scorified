import { Inject, Logger } from '@nestjs/common';
import {
  type OnGatewayConnection,
  type OnGatewayDisconnect,
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
import { GuildRepository } from './guild.repository';
import { PRESENCE_STORE, type PresenceStore } from './presence.store';
import { SocialEventsRelay } from './social.events';
import { SocialRepository } from './social.repository';

interface SocketState {
  accountId?: string;
  /** Postava, k jejíž room je socket přihlášený (pro presence při disconnectu). */
  presenceCharacterId?: string;
}

/**
 * WebSocket vrstva sociálního systému (M9 + chat overhaul). Recykluje realtime
 * transport z M7 (socket.io + Redis pub/sub adaptér, viz main.ts → multi-instance
 * fan-out).
 *
 * Funkce:
 *  - `social:subscribe` → join room postavy → příjem `social:friend_request` /
 *    `social:friend_accepted` / `guild:*` / `social:presence` + zapne **presence**
 *    (online stav přátel).
 *  - `chat:join` → join chat room (global, nebo guild dle členství), vrátí historii.
 *  - `chat:send` → odešle zprávu (persistuje + rozešle přes relay do správného kanálu).
 *  - `whisper:send` → online-only 1:1 zpráva.
 *  - disconnect → presence leave (offline broadcast přátelům).
 *
 * Gateway je tenký — logika v `ChatService`/`SocialService`. Nastaví server na
 * sdílený `SocialEventsRelay` (v `afterInit`) → service nezávisí na gateway.
 */
@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class SocialGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(SocialGateway.name);

  @WebSocketServer()
  private server!: Server;

  constructor(
    private readonly auth: AuthService,
    private readonly characters: CharacterRepository,
    private readonly chat: ChatService,
    private readonly social: SocialRepository,
    private readonly guilds: GuildRepository,
    @Inject(PRESENCE_STORE) private readonly presence: PresenceStore,
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

  /** Disconnect → presence leave; přechod online→offline broadcastni přátelům. */
  async handleDisconnect(client: Socket): Promise<void> {
    const characterId = (client.data as SocketState).presenceCharacterId;
    if (characterId) await this.markOffline(characterId);
  }

  /** Presence online (broadcast přátelům jen při reálném přechodu offline→online). */
  private async markOnline(characterId: string): Promise<void> {
    const becameOnline = await this.presence.join(characterId);
    if (becameOnline) {
      const friends = await this.social.listFriendIds(characterId);
      this.relay.presence(friends, characterId, true);
    }
  }

  /** Presence offline (broadcast přátelům jen při přechodu online→offline). */
  private async markOffline(characterId: string): Promise<void> {
    const becameOffline = await this.presence.leave(characterId);
    if (becameOffline) {
      const friends = await this.social.listFriendIds(characterId);
      this.relay.presence(friends, characterId, false);
    }
  }

  /** Join room postavy pro realtime notifikace + zapne presence (po ověření vlastnictví). */
  @SubscribeMessage('social:subscribe')
  async subscribe(client: Socket, payload: { characterId?: string }): Promise<{ ok: boolean }> {
    const state = client.data as SocketState;
    const accountId = state.accountId;
    const characterId = payload?.characterId;
    if (!accountId || !characterId) return { ok: false };
    const owned = await this.characters.findOwned(accountId, characterId);
    if (!owned) return { ok: false };

    // Přepnutí aktivní postavy na témže socketu: opusť starou presence/room.
    if (state.presenceCharacterId && state.presenceCharacterId !== characterId) {
      await client.leave(SocialEventsRelay.room(state.presenceCharacterId));
      await this.markOffline(state.presenceCharacterId);
    }
    await client.join(SocialEventsRelay.room(characterId));
    if (state.presenceCharacterId !== characterId) {
      state.presenceCharacterId = characterId;
      await this.markOnline(characterId);
    }
    return { ok: true };
  }

  /** Join chat room (global / guild dle členství) + vrátí historii kanálu. */
  @SubscribeMessage('chat:join')
  async join(
    client: Socket,
    payload: { characterId?: string; channel?: string },
  ): Promise<{ ok: boolean; history?: ChatMessageView[] }> {
    const accountId = (client.data as SocketState).accountId;
    const characterId = payload?.characterId;
    const channel: ChatChannel = isChatChannel(payload?.channel ?? '')
      ? (payload!.channel as ChatChannel)
      : 'global';
    if (!accountId || !characterId) return { ok: false };
    try {
      // Historie zároveň ověří vlastnictví + (pro guild) členství.
      const history = await this.chat.history(accountId, characterId, channel);
      if (channel === 'guild') {
        const membership = await this.guilds.membershipOf(characterId);
        if (!membership) return { ok: false };
        await client.join(SocialEventsRelay.guildChatRoom(membership.guildId));
      } else {
        await client.join(SocialEventsRelay.CHAT_GLOBAL);
      }
      return { ok: true, history };
    } catch {
      return { ok: false };
    }
  }

  /**
   * Whisper (soukromá 1:1 zpráva) — **pouze online**. Doručí se jen pokud má
   * příjemce aktivní socket ve své room (napříč instancemi přes Redis adaptér).
   * Žádná perzistence; offline doručení řeší Mail. Vrací `delivered`.
   */
  @SubscribeMessage('whisper:send')
  async whisper(
    client: Socket,
    payload: { fromCharacterId?: string; toCharacterId?: string; body?: string },
  ): Promise<{ ok: boolean; delivered?: boolean; error?: string }> {
    const accountId = (client.data as SocketState).accountId;
    const { fromCharacterId, toCharacterId } = payload ?? {};
    const body = (payload?.body ?? '').trim().slice(0, 256);
    if (!accountId || !fromCharacterId || !toCharacterId || !body) return { ok: false };
    const sender = await this.characters.findOwned(accountId, fromCharacterId);
    if (!sender) return { ok: false, error: 'Not your character' };
    const target = await this.characters.findById(toCharacterId);
    if (!target) return { ok: false, error: 'No character with that name' };

    const room = SocialEventsRelay.room(toCharacterId);
    const sockets = await this.server.in(room).fetchSockets();
    const delivered = sockets.length > 0;
    if (delivered) {
      this.server.to(room).emit('whisper:message', {
        fromCharacterId,
        fromName: sender.name,
        body,
        at: new Date().toISOString(),
      });
    }
    return { ok: true, delivered };
  }

  /** Odešle chatovou zprávu (persistuje + rozešle do správného kanálu/scope). */
  @SubscribeMessage('chat:send')
  async send(
    client: Socket,
    payload: { characterId?: string; body?: string; channel?: string },
  ): Promise<{ ok: boolean; error?: string }> {
    const accountId = (client.data as SocketState).accountId;
    const { characterId, body } = payload ?? {};
    const channel: ChatChannel = isChatChannel(payload?.channel ?? '')
      ? (payload!.channel as ChatChannel)
      : 'global';
    if (!accountId || !characterId || !body) return { ok: false };
    try {
      await this.chat.send(accountId, characterId, body, channel);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }
}
