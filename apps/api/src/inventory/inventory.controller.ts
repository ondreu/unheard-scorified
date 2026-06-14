import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { InventoryService, type EquipmentSlotsView, type InventoryItemView } from './inventory.service';
import { EquipItemDto } from './dto/equip-item.dto';

@Controller('characters/:characterId')
@UseGuards(JwtAuthGuard)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  /** Inventář postavy (všechny itemy). */
  @Get('inventory')
  listInventory(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
  ): Promise<InventoryItemView[]> {
    return this.inventoryService.listInventory(user.accountId, characterId);
  }

  /** Equipnuté itemy a jejich souhrnné staty. */
  @Get('equipment')
  listEquipment(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
  ): Promise<EquipmentSlotsView> {
    return this.inventoryService.listEquipment(user.accountId, characterId);
  }

  /** Equipne item z inventáře do slotu. Body: { itemId, slot }. */
  @Post('equipment')
  equip(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
    @Body() body: { itemId: string } & EquipItemDto,
  ): Promise<EquipmentSlotsView> {
    return this.inventoryService.equip(user.accountId, characterId, body.itemId, body.slot);
  }

  /** Odequipne item ze slotu. */
  @Delete('equipment/:slot')
  unequip(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
    @Param('slot') slot: string,
  ): Promise<EquipmentSlotsView> {
    return this.inventoryService.unequip(user.accountId, characterId, slot);
  }
}
