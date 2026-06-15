import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { isChatChannel, type ChatChannel } from '@game/shared';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ChatService, type ChatMessageView } from './chat.service';
import { SendChatMessageDto } from './dto/social.dto';

/**
 * Chat REST (M9 social). Autoritativní fallback k WS gateway: historie kanálu +
 * odeslání zprávy (i bez socketu). Vázané na vlastněnou postavu.
 */
@Controller('characters/:characterId/chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  private channelOf(value?: string): ChatChannel {
    return value && isChatChannel(value) ? value : 'global';
  }

  /** Historie kanálu (posledních N zpráv). */
  @Get()
  history(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
    @Query('channel') channel?: string,
  ): Promise<ChatMessageView[]> {
    return this.chat.history(user.accountId, characterId, this.channelOf(channel));
  }

  /** Odešle zprávu jménem postavy. */
  @Post()
  send(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
    @Body() dto: SendChatMessageDto,
  ): Promise<ChatMessageView> {
    return this.chat.send(user.accountId, characterId, dto.body, this.channelOf(dto.channel));
  }
}
