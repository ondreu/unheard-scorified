import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MountService, type MountsView } from './mount.service';

@Controller('characters/:characterId/mounts')
@UseGuards(JwtAuthGuard)
export class MountController {
  constructor(private readonly mountService: MountService) {}

  /** Stáj postavy (katalog + vlastnictví/dostupnost). */
  @Get()
  listMounts(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
  ): Promise<MountsView> {
    return this.mountService.listMounts(user.accountId, characterId);
  }

  /** Koupí mount za zlato. */
  @Post(':mountId/buy')
  buy(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
    @Param('mountId') mountId: string,
  ): Promise<MountsView> {
    return this.mountService.buy(user.accountId, characterId, mountId);
  }

  /** Nastaví aktivní (kosmetický) mount. */
  @Post(':mountId/select')
  select(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
    @Param('mountId') mountId: string,
  ): Promise<MountsView> {
    return this.mountService.select(user.accountId, characterId, mountId);
  }
}
