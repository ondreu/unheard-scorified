import { Body, Controller, Delete, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { PushService } from './push.service';
import { SubscribePushDto } from './dto/subscribe-push.dto';

type AuthUser = { accountId: string; username: string };

@Controller('push')
export class PushController {
  constructor(private readonly push: PushService) {}

  /** Vrátí VAPID public key — potřebný pro `PushManager.subscribe()` na frontendu. */
  @Get('vapid-public-key')
  getVapidPublicKey(): { key: string } {
    return { key: this.push.getVapidPublicKey() };
  }

  /** Uloží push subscription aktuálního účtu. */
  @Post('subscribe')
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  async subscribe(@CurrentUser() user: AuthUser, @Body() dto: SubscribePushDto): Promise<void> {
    await this.push.subscribe({
      accountId: user.accountId,
      endpoint: dto.endpoint,
      p256dh: dto.keys.p256dh,
      auth: dto.keys.auth,
    });
  }

  /** Odstraní push subscription (odhlášení notifikací). */
  @Delete('subscribe')
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  async unsubscribe(@Body() dto: { endpoint: string }): Promise<void> {
    await this.push.unsubscribe(dto.endpoint);
  }
}
