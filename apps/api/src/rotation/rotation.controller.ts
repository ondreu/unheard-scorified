import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RotationService, type RotationView } from './rotation.service';
import { UpdateRotationDto } from './dto/update-rotation.dto';

@Controller('characters/:characterId/rotation')
@UseGuards(JwtAuthGuard)
export class RotationController {
  constructor(private readonly rotationService: RotationService) {}

  /** Dostupné ability + aktuální (uložená/default) pravidla rotace. */
  @Get()
  getRotation(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
  ): Promise<RotationView> {
    return this.rotationService.getRotation(user.accountId, characterId);
  }

  /** Uloží pravidla rotace (server je očistí proti dostupným ability). */
  @Put()
  setRotation(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
    @Body() body: UpdateRotationDto,
  ): Promise<RotationView> {
    return this.rotationService.setRotation(user.accountId, characterId, body);
  }
}
