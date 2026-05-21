import { Module } from '@nestjs/common';

import { SystemModule } from '../system/system.module';
import { XrayModule } from '../xray/xray.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [SystemModule, XrayModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
