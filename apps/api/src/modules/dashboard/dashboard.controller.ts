import { Controller, Get, Query } from '@nestjs/common';
import { AdminRole } from '@prisma/client';

import { Roles } from '../../common/auth/roles.decorator';
import { DashboardAnalyticsQueryDto } from './dto/dashboard-analytics-query.dto';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
@Roles(AdminRole.SUPER_ADMIN, AdminRole.OPERATOR, AdminRole.READ_ONLY)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  summary() {
    return this.dashboardService.summary();
  }

  @Get('analytics')
  analytics(@Query() query: DashboardAnalyticsQueryDto) {
    return this.dashboardService.analytics(query.windowDays);
  }
}
