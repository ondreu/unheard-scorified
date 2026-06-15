import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  CHAT_HISTORY_LIMIT,
  isValidChatMessage,
  sanitizeChatMessage,
  type ChatChannel,
} from '@game/shared';
import { CharacterRepository } from '../character/character.repository';
import type { ChatMessage } from '../db/schema';
import { ChatRepository } from './chat.repository';
import { SocialEventsRelay } from './social.events';

export interface ChatMessageView {
  id: string;
  channel: ChatChannel;
  characterId: string | null;
  name: string;
  body: string;
  at: string;
}

/**
 * Chat (M9 social). Jednoduchý persistovaný globální kanál; realtime fan-out
 * přes `SocialEventsRelay` (recykluje WS vrstvu z M7). REST je zdroj pravdy
 * (historie i odeslání), WS je rychlá vrstva navrch. Stateless.
 */
@Injectable()
export class ChatService {
  constructor(
    private readonly characters: CharacterRepository,
    private readonly chat: ChatRepository,
    private readonly relay: SocialEventsRelay,
  ) {}

  private toView(m: ChatMessage): ChatMessageView {
    return {
      id: m.id,
      channel: m.channel,
      characterId: m.senderCharacterId,
      name: m.senderName,
      body: m.body,
      at: m.createdAt.toISOString(),
    };
  }

  /** Posledních N zpráv kanálu (jen pro vlastníka postavy). */
  async history(
    accountId: string,
    characterId: string,
    channel: ChatChannel = 'global',
  ): Promise<ChatMessageView[]> {
    const owned = await this.characters.findOwned(accountId, characterId);
    if (!owned) throw new NotFoundException('Character not found');
    const rows = await this.chat.listRecent(channel, CHAT_HISTORY_LIMIT);
    return rows.map((m) => this.toView(m));
  }

  /**
   * Pošle zprávu jménem postavy. Normalizuje + validuje (sdílený helper),
   * persistuje a rozešle realtime. Vrací uloženou zprávu.
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

    const saved = await this.chat.insert({
      channel,
      senderCharacterId: characterId,
      senderName: owned.name,
      body: sanitizeChatMessage(body),
    });
    const view = this.toView(saved);
    this.relay.chatMessage(view);
    return view;
  }
}
