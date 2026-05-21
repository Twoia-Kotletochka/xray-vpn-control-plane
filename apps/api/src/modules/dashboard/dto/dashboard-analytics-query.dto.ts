import { Type } from 'class-transformer';
import { IsIn, IsOptional } from 'class-validator';

import {
  DASHBOARD_ANALYTICS_WINDOWS,
  DASHBOARD_DEFAULT_ANALYTICS_WINDOW,
  type DashboardAnalyticsWindowDays,
} from '../dashboard.constants';

export class DashboardAnalyticsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsIn(DASHBOARD_ANALYTICS_WINDOWS)
  windowDays: DashboardAnalyticsWindowDays = DASHBOARD_DEFAULT_ANALYTICS_WINDOW;
}
