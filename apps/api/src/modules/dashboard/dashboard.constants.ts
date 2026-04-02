export const DASHBOARD_ANALYTICS_WINDOWS = [7, 14, 30] as const;

export type DashboardAnalyticsWindowDays = (typeof DASHBOARD_ANALYTICS_WINDOWS)[number];

export const DASHBOARD_DEFAULT_ANALYTICS_WINDOW: DashboardAnalyticsWindowDays = 14;
