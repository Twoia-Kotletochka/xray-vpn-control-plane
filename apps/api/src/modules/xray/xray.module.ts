import { Module } from '@nestjs/common';

import { XrayController } from './xray.controller';
import { XrayService } from './xray.service';

@Module({
  controllers: [XrayController],
  providers: [XrayService],
})
export class XrayModule {}
