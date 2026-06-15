import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { VendorService, type VendorView } from './vendor.service';

@Controller('characters/:characterId/vendor')
@UseGuards(JwtAuthGuard)
export class VendorController {
  constructor(private readonly vendor: VendorService) {}

  /** Panel vendora (sortiment + prodejné věci + gold). */
  @Get()
  getVendor(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
  ): Promise<VendorView> {
    return this.vendor.getVendor(user.accountId, characterId);
  }

  /** Koupí item od vendora. */
  @Post('buy/:itemId')
  buy(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
    @Param('itemId') itemId: string,
    @Body() body: { quantity?: number },
  ): Promise<VendorView> {
    return this.vendor.buy(user.accountId, characterId, itemId, body?.quantity ?? 1);
  }

  /** Prodá item vendorovi. */
  @Post('sell/:itemId')
  sell(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
    @Param('itemId') itemId: string,
    @Body() body: { quantity?: number },
  ): Promise<VendorView> {
    return this.vendor.sell(user.accountId, characterId, itemId, body?.quantity ?? 1);
  }
}
