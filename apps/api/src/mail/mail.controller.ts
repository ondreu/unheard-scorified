import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SendMailDto } from './dto/mail.dto';
import { MailService, type Mailbox } from './mail.service';

/**
 * Pošta (M9). Tenký controller — logika v `MailService`. Vše vázané na vlastněnou
 * postavu (ownership check v service).
 */
@Controller('characters/:characterId/mail')
@UseGuards(JwtAuthGuard)
export class MailController {
  constructor(private readonly mail: MailService) {}

  @Get()
  inbox(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
  ): Promise<Mailbox> {
    return this.mail.getMailbox(user.accountId, characterId);
  }

  @Post()
  send(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
    @Body() dto: SendMailDto,
  ): Promise<{ sent: true }> {
    return this.mail.send(
      user.accountId,
      characterId,
      dto.toName,
      dto.subject,
      dto.body ?? '',
      dto.items ?? [],
      dto.gold ?? 0,
    );
  }

  @Post(':mailId/read')
  read(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
    @Param('mailId') mailId: string,
  ): Promise<Mailbox> {
    return this.mail.read(user.accountId, characterId, mailId);
  }

  @Post(':mailId/claim')
  claim(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
    @Param('mailId') mailId: string,
  ): Promise<Mailbox> {
    return this.mail.claim(user.accountId, characterId, mailId);
  }

  @Delete(':mailId')
  remove(
    @CurrentUser() user: { accountId: string },
    @Param('characterId') characterId: string,
    @Param('mailId') mailId: string,
  ): Promise<Mailbox> {
    return this.mail.remove(user.accountId, characterId, mailId);
  }
}
