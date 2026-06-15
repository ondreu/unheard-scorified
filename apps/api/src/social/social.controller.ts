import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RespondFriendRequestDto, SendFriendRequestDto } from './dto/social.dto';
import { SocialService, type FriendActionResult, type SocialView } from './social.service';

/**
 * Friends (M9 social). Tenký controller — logika v `SocialService`. Vše vázané
 * na vlastněnou postavu (JWT účet + ownership check v service).
 */
@Controller('characters/:characterId/social')
@UseGuards(JwtAuthGuard)
export class SocialController {
  constructor(private readonly social: SocialService) {}

  /** Přehled: přátelé + příchozí/odeslané žádosti. */
  @Get()
  get(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
  ): Promise<SocialView> {
    return this.social.getSocial(user.accountId, characterId);
  }

  /** Pošle žádost o přátelství postavě dle jména. */
  @Post('requests')
  send(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
    @Body() dto: SendFriendRequestDto,
  ): Promise<FriendActionResult> {
    return this.social.sendRequest(user.accountId, characterId, dto.name);
  }

  /** Potvrdí/odmítne příchozí žádost. */
  @Post('requests/:requestId/respond')
  respond(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
    @Param('requestId') requestId: string,
    @Body() dto: RespondFriendRequestDto,
  ): Promise<SocialView> {
    return this.social.respond(user.accountId, characterId, requestId, dto.accept);
  }

  /** Zruší přátelství / odvolá žádost. */
  @Delete('friends/:otherCharacterId')
  remove(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
    @Param('otherCharacterId') otherCharacterId: string,
  ): Promise<SocialView> {
    return this.social.removeFriend(user.accountId, characterId, otherCharacterId);
  }
}
