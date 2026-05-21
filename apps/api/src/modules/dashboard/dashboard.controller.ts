import { Controller, Get, Query } from '@nestjs/common';
import { AdminRole } from '@prisma/client';

import type { AuthenticatedAdmin } from '../../common/auth/authenticated-admin.interface';
import { CurrentAdmin } from '../../common/auth/current-admin.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { DashboardService } from './dashboard.service';
import { DashboardAnalyticsQueryDto } from './dto/dashboard-analytics-query.dto';

@Controller('dashboard')
@Roles(AdminRole.SUPER_ADMIN, AdminRole.OPERATOR, AdminRole.READ_ONLY)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  summary(@CurrentAdmin() admin: AuthenticatedAdmin) {
    return this.dashboardService.summary(admin);
  }

  @Get('analytics')
  analytics(@Query() query: DashboardAnalyticsQueryDto) {
    return this.dashboardService.analytics(query.windowDays);
  }
}
