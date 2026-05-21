import { Module } from '@nestjs/common';

import { WireguardModule } from '../wireguard/wireguard.module';
import { XrayModule } from '../xray/xray.module';
import { ClientsController } from './clients.controller';
import { ClientsService } from './clients.service';

@Module({
  imports: [XrayModule, WireguardModule],
  controllers: [ClientsController],
  providers: [ClientsService],
  exports: [ClientsService],
})
export class ClientsModule {}
