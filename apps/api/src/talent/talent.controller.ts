import { Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TalentService, type TalentsView } from './talent.service';

@Controller('characters/:characterId/talents')
@UseGuards(JwtAuthGuard)
export class TalentController {
  constructor(private readonly talentService: TalentService) {}

  /** Aktuální stav talent stromů. */
  @Get()
  listTalents(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
  ): Promise<TalentsView> {
    return this.talentService.listTalents(user.accountId, characterId);
  }

  /** Alokuje bod do talentu. */
  @Post(':talentId')
  allocate(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
    @Param('talentId') talentId: string,
  ): Promise<TalentsView> {
    return this.talentService.allocate(user.accountId, characterId, talentId);
  }

  /** Resetuje všechny talenty. */
  @Delete()
  resetAll(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
  ): Promise<TalentsView> {
    return this.talentService.resetAll(user.accountId, characterId);
  }
}
