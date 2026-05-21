import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../common/database/database.module';
import { WireguardService } from './wireguard.service';

@Module({
  imports: [DatabaseModule],
  providers: [WireguardService],
  exports: [WireguardService],
})
export class WireguardModule {}
