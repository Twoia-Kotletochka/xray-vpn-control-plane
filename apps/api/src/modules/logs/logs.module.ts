import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { LogsController } from './logs.controller';
import { LogsService } from './logs.service';

@Module({
  imports: [ConfigModule],
  controllers: [LogsController],
  providers: [LogsService],
})
export class LogsModule {}
