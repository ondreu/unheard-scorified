import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { HistoryService, type HistoryEntry } from './history.service';

/** Persistentní historie dokončených aktivit postavy (questy/dungeony/raidy/arény). */
@Controller('characters/:characterId/history')
@UseGuards(JwtAuthGuard)
export class HistoryController {
  constructor(private readonly history: HistoryService) {}

  @Get()
  list(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
  ): Promise<HistoryEntry[]> {
    return this.history.list(user.accountId, characterId);
  }
}
