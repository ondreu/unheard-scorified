import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { DevGuard } from './dev.guard';
import { DevService } from './dev.service';
import { AddGoldDto, AddItemDto, SetLevelDto, SetProfessionDto, TimeWarpDto } from './dto/dev.dto';

/** Auth check — verifikuje heslo, nevrací token (secret se posílá jako header). */
@Controller('dev/auth')
export class DevAuthController {
  constructor(private readonly dev: DevService) {}

  @Post()
  verify(@Body() body: { secret?: string }): { ok: boolean } {
    const ok = this.dev.verifySecret(body.secret ?? '');
    if (!ok) return { ok: false };
    return { ok: true };
  }
}

// ── Dev Tools (per-character) ────────────────────────────────────────────────

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

  @Post('grant-mounts')
  grantMounts(@Param('characterId') characterId: string) {
    return this.dev.grantAllMounts(characterId);
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

// ── Moderation ───────────────────────────────────────────────────────────────

@Controller('dev/mod')
@UseGuards(DevGuard)
export class DevModController {
  constructor(private readonly dev: DevService) {}

  @Get('accounts')
  listAccounts() {
    return this.dev.listAccounts();
  }

  @Post('accounts/:accountId/ban')
  banAccount(@Param('accountId') accountId: string) {
    return this.dev.banAccount(accountId);
  }

  @Post('accounts/:accountId/unban')
  unbanAccount(@Param('accountId') accountId: string) {
    return this.dev.unbanAccount(accountId);
  }

  @Delete('accounts/:accountId')
  deleteAccount(@Param('accountId') accountId: string) {
    return this.dev.deleteAccount(accountId);
  }

  @Get('characters/search')
  searchCharacters(@Query('name') name: string) {
    return this.dev.searchCharacters(name ?? '');
  }

  @Get('characters/:characterId/inspect')
  inspectCharacter(@Param('characterId') characterId: string) {
    return this.dev.inspectCharacter(characterId);
  }

  @Delete('characters/:characterId')
  deleteCharacter(@Param('characterId') characterId: string) {
    return this.dev.deleteCharacter(characterId);
  }
}
