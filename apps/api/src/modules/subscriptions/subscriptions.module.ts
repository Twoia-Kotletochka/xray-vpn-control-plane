import { Module } from '@nestjs/common';

import { WireguardModule } from '../wireguard/wireguard.module';
import { XrayModule } from '../xray/xray.module';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';

@Module({
  imports: [XrayModule, WireguardModule],
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService],
})
export class SubscriptionsModule {}
