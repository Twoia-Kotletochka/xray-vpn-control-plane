import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../common/database/database.module';
import { XrayController } from './xray.controller';
import { XrayService } from './xray.service';

@Module({
  imports: [DatabaseModule],
  controllers: [XrayController],
  providers: [XrayService],
  exports: [XrayService],
})
export class XrayModule {}
