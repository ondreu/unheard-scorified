import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ProfessionService, type ProfessionPanel } from './profession.service';

@Controller('characters/:characterId/professions')
@UseGuards(JwtAuthGuard)
export class ProfessionController {
  constructor(private readonly professions: ProfessionService) {}

  /** Profession panel: skilly, reputace, materiály, gathering nody, recepty. */
  @Get()
  panel(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
  ): Promise<ProfessionPanel> {
    return this.professions.getPanel(user.accountId, characterId);
  }

  /** Pošle postavu sbírat materiály (gathering aktivita). */
  @Post('gather/:nodeId')
  async gather(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
    @Param('nodeId') nodeId: string,
  ): Promise<ProfessionPanel> {
    await this.professions.startGather(user.accountId, characterId, nodeId);
    return this.professions.getPanel(user.accountId, characterId);
  }

  /** Pošle postavu craftit (crafting aktivita; spotřebuje materiály). */
  @Post('craft/:recipeId')
  async craft(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
    @Param('recipeId') recipeId: string,
  ): Promise<ProfessionPanel> {
    await this.professions.startCraft(user.accountId, characterId, recipeId);
    return this.professions.getPanel(user.accountId, characterId);
  }
}
