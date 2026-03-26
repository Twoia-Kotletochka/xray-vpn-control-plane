import { Controller, Get, Header, Param } from '@nestjs/common';

import { Public } from '../../common/auth/public.decorator';
import { SubscriptionsService } from './subscriptions.service';

@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get('templates')
  listTemplates() {
    return this.subscriptionsService.listTemplates();
  }

  @Get('client/:clientId')
  getClientBundle(@Param('clientId') clientId: string) {
    return this.subscriptionsService.getClientBundle(clientId);
  }

  @Public()
  @Get(':subscriptionToken')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  renderSubscription(@Param('subscriptionToken') subscriptionToken: string) {
    return this.subscriptionsService.renderSubscription(subscriptionToken);
  }
}
