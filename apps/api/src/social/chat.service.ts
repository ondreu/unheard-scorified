import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  CHAT_HISTORY_LIMIT,
  isScopedChannel,
  isValidChatMessage,
  sanitizeChatMessage,
  type ChatChannel,
} from '@game/shared';
import { CharacterRepository } from '../character/character.repository';
import type { ChatMessage } from '../db/schema';
import { ChatRepository } from './chat.repository';
import { GuildRepository } from './guild.repository';
import { SocialEventsRelay } from './social.events';

export interface ChatMessageView {
  id: string;
  channel: ChatChannel;
  /** Scope kanálu (guildId pro `guild`, null pro `global`). */
  scopeId: string | null;
  characterId: string | null;
  name: string;
  body: string;
  at: string;
}

/**
 * Chat (M9 social + chat overhaul). Persistované kanály `global` (všichni) a
 * `guild` (jen členové, scoped na guildId). Realtime fan-out přes
 * `SocialEventsRelay` (recykluje WS vrstvu z M7) — global do sdílené room,
 * guild jen do room dané guildy. REST je zdroj pravdy (historie i odeslání),
 * WS je rychlá vrstva navrch. Stateless.
 */
@Injectable()
export class ChatService {
  constructor(
    private readonly characters: CharacterRepository,
    private readonly chat: ChatRepository,
    private readonly guilds: GuildRepository,
    private readonly relay: SocialEventsRelay,
  ) {}

  private toView(m: ChatMessage): ChatMessageView {
    return {
      id: m.id,
      channel: m.channel,
      scopeId: m.scopeId,
      characterId: m.senderCharacterId,
      name: m.senderName,
      body: m.body,
      at: m.createdAt.toISOString(),
    };
  }

  /**
   * Vyřeší scope kanálu pro danou postavu. Pro `guild` ověří členství a vrátí
   * guildId; pro `global` vrací null. Non-member guild kanálu → Forbidden.
   */
  private async resolveScope(channel: ChatChannel, characterId: string): Promise<string | null> {
    if (!isScopedChannel(channel)) return null;
    // channel === 'guild'
    const membership = await this.guilds.membershipOf(characterId);
    if (!membership) throw new ForbiddenException('You are not in a guild');
    return membership.guildId;
  }

  /** Posledních N zpráv kanálu (jen pro vlastníka postavy). */
  async history(
    accountId: string,
    characterId: string,
    channel: ChatChannel = 'global',
  ): Promise<ChatMessageView[]> {
    const owned = await this.characters.findOwned(accountId, characterId);
    if (!owned) throw new NotFoundException('Character not found');
    const scopeId = await this.resolveScope(channel, characterId);
    const rows = await this.chat.listRecent(channel, scopeId, CHAT_HISTORY_LIMIT);
    return rows.map((m) => this.toView(m));
  }

  /**
   * Pošle zprávu jménem postavy. Normalizuje + validuje (sdílený helper),
   * persistuje a rozešle realtime do správného kanálu/scope. Vrací uloženou zprávu.
   */
  async send(
    accountId: string,
    characterId: string,
    body: string,
    channel: ChatChannel = 'global',
  ): Promise<ChatMessageView> {
    const owned = await this.characters.findOwned(accountId, characterId);
    if (!owned) throw new NotFoundException('Character not found');
    if (!isValidChatMessage(body)) throw new BadRequestException('Empty message');
    const scopeId = await this.resolveScope(channel, characterId);

    const saved = await this.chat.insert({
      channel,
      scopeId,
      senderCharacterId: characterId,
      senderName: owned.name,
      body: sanitizeChatMessage(body),
    });
    const view = this.toView(saved);
    if (channel === 'guild' && scopeId) this.relay.guildChatMessage(scopeId, view);
    else this.relay.chatMessage(view);
    return view;
  }
}
