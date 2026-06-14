import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { QuestService, type QuestView } from './quest.service';

@Controller('characters/:characterId/quests')
@UseGuards(JwtAuthGuard)
export class QuestController {
  constructor(private readonly quests: QuestService) {}

  @Get()
  available(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
  ): Promise<QuestView[]> {
    return this.quests.listAvailable(user.accountId, characterId);
  }
}
