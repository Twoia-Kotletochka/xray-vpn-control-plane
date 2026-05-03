import { Controller, Get, Header, Param } from '@nestjs/common';
import { AdminRole } from '@prisma/client';

import type { AuthenticatedAdmin } from '../../common/auth/authenticated-admin.interface';
import { CurrentAdmin } from '../../common/auth/current-admin.decorator';
import { Public } from '../../common/auth/public.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { SubscriptionsService } from './subscriptions.service';

@Controller('subscriptions')
@Roles(AdminRole.SUPER_ADMIN, AdminRole.OPERATOR, AdminRole.READ_ONLY)
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get('templates')
  listTemplates() {
    return this.subscriptionsService.listTemplates();
  }

  @Get('client/:clientId')
  getClientBundle(@Param('clientId') clientId: string, @CurrentAdmin() admin: AuthenticatedAdmin) {
    return this.subscriptionsService.getClientBundle(clientId, admin);
  }

  @Public()
  @Get(':subscriptionToken')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  renderSubscription(@Param('subscriptionToken') subscriptionToken: string) {
    return this.subscriptionsService.renderSubscription(subscriptionToken);
  }
}
