import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CharacterService, type CharacterView, type InspectView } from './character.service';
import { CreateCharacterDto } from './dto/create-character.dto';

@Controller('characters')
@UseGuards(JwtAuthGuard)
export class CharacterController {
  constructor(private readonly characters: CharacterService) {}

  @Post()
  create(
    @CurrentUser() user: { accountId: string },
    @Body() dto: CreateCharacterDto,
  ): Promise<CharacterView> {
    return this.characters.create(user.accountId, dto);
  }

  @Get()
  list(@CurrentUser() user: { accountId: string }): Promise<CharacterView[]> {
    return this.characters.list(user.accountId);
  }

  @Get(':id')
  get(@CurrentUser() user: { accountId: string }, @Param('id') id: string): Promise<CharacterView> {
    return this.characters.getOwned(user.accountId, id);
  }

  @Delete(':id')
  remove(
    @CurrentUser() user: { accountId: string },
    @Param('id') id: string,
  ): Promise<{ deleted: true }> {
    return this.characters.deleteOwned(user.accountId, id);
  }

  /**
   * Veřejný inspect libovolné postavy (chat → klik na jméno). Vyžaduje přihlášení,
   * ale ne vlastnictví — vrací jen public combat info (gear/ilvl/staty).
   */
  @Get(':id/inspect')
  inspect(@Param('id') id: string): Promise<InspectView> {
    return this.characters.inspect(id);
  }
}
