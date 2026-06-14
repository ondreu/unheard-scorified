import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PushController } from './push.controller';
import { PushRepository } from './push.repository';
import { PushService } from './push.service';

@Module({
  imports: [AuthModule],
  controllers: [PushController],
  providers: [PushService, PushRepository],
  exports: [PushService],
})
export class PushModule {}
