import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { DevGuard } from './dev.guard';
import { DevService } from './dev.service';
import { AddGoldDto, AddItemDto, SetLevelDto, SetProfessionDto, TimeWarpDto } from './dto/dev.dto';

@Controller('dev/characters/:characterId')
@UseGuards(DevGuard)
export class DevController {
  constructor(private readonly dev: DevService) {}

  @Get('state')
  getState(@Param('characterId') characterId: string) {
    return this.dev.getState(characterId);
  }

  @Get('items')
  listItems() {
    return this.dev.listItems();
  }

  @Get('professions')
  listProfessions() {
    return this.dev.listProfessions();
  }

  @Post('set-level')
  setLevel(@Param('characterId') characterId: string, @Body() body: SetLevelDto) {
    return this.dev.setLevel(characterId, body.level);
  }

  @Post('add-gold')
  addGold(@Param('characterId') characterId: string, @Body() body: AddGoldDto) {
    return this.dev.addGold(characterId, body.amount);
  }

  @Post('add-item')
  addItem(@Param('characterId') characterId: string, @Body() body: AddItemDto) {
    return this.dev.addItem(characterId, body.itemId, body.quantity);
  }

  @Post('complete-activity')
  completeActivity(@Param('characterId') characterId: string) {
    return this.dev.completeActivity(characterId);
  }

  @Post('time-warp')
  timeWarp(@Param('characterId') characterId: string, @Body() body: TimeWarpDto) {
    return this.dev.timeWarp(characterId, body.hours);
  }

  @Post('set-profession')
  setProfession(@Param('characterId') characterId: string, @Body() body: SetProfessionDto) {
    return this.dev.setProfession(characterId, body.professionId, body.skill);
  }

  @Post('reset')
  resetCharacter(@Param('characterId') characterId: string) {
    return this.dev.resetCharacter(characterId);
  }
}
