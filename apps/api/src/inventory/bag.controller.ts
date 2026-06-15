import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BagService, type BagsView } from './bag.service';

@Controller('characters/:characterId/bags')
@UseGuards(JwtAuthGuard)
export class BagController {
  constructor(private readonly bags: BagService) {}

  /** Bag sloty + kapacita inventáře. */
  @Get()
  getBags(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
  ): Promise<BagsView> {
    return this.bags.getBags(user.accountId, characterId);
  }

  /** Vloží batoh z inventáře do bag slotu. */
  @Post(':slotIndex')
  equip(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
    @Param('slotIndex', ParseIntPipe) slotIndex: number,
    @Body() body: { itemId: string },
  ): Promise<BagsView> {
    return this.bags.equipBag(user.accountId, characterId, slotIndex, body.itemId);
  }

  /** Vyjme batoh z bag slotu. */
  @Delete(':slotIndex')
  unequip(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
    @Param('slotIndex', ParseIntPipe) slotIndex: number,
  ): Promise<BagsView> {
    return this.bags.unequipBag(user.accountId, characterId, slotIndex);
  }
}
