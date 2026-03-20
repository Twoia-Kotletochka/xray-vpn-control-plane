import { Module } from '@nestjs/common';

import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '../../common/database/database.module';
import { XrayModule } from '../xray/xray.module';
import { SystemController } from './system.controller';
import { SystemService } from './system.service';

@Module({
  imports: [ConfigModule, DatabaseModule, XrayModule],
  controllers: [SystemController],
  providers: [SystemService],
  exports: [SystemService],
})
export class SystemModule {}
