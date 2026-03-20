import { Controller, Get } from '@nestjs/common';

import { SubscriptionsService } from './subscriptions.service';

@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get('templates')
  listTemplates() {
    return this.subscriptionsService.listTemplates();
  }
}
