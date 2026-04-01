import { Injectable } from '@nestjs/common';
import { ClientStatus } from '@prisma/client';

import { PrismaService } from '../../common/database/prisma.service';
import { SystemService } from '../system/system.service';
import { XrayService } from '../xray/xray.service';

const DASHBOARD_TREND_DAYS = 14;
const DASHBOARD_TREND_COMPARISON_DAYS = 7;
const DAY_IN_MS = 24 * 60 * 60 * 1000;

type DailyUsageTrendRow = {
  bucketDate: Date;
  clientId: string;
  totalBytes: bigint;
  activeConnections: number;
};

type DashboardTrendBucketSeed = {
  date: string;
  totalTrafficBytes: bigint;
  activeClients: Set<string>;
};

function startOfUtcDay(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function sumBigInts(values: bigint[]) {
  return values.reduce((total, value) => total + value, 0n);
}

function calculateTrafficDeltaPercent(currentTraffic: bigint, previousTraffic: bigint) {
  const previous = Number(previousTraffic);

  if (previous === 0) {
    return Number(currentTraffic) === 0 ? 0 : null;
  }

  return Number((((Number(currentTraffic) - previous) / previous) * 100).toFixed(1));
}

function buildTrendBuckets(rows: DailyUsageTrendRow[]) {
  const today = startOfUtcDay(new Date());
  const buckets = new Map<string, DashboardTrendBucketSeed>();

  for (let offset = DASHBOARD_TREND_DAYS - 1; offset >= 0; offset -= 1) {
    const bucketDate = new Date(today.getTime() - offset * DAY_IN_MS);
    const key = bucketDate.toISOString();

    buckets.set(key, {
      date: key,
      totalTrafficBytes: 0n,
      activeClients: new Set<string>(),
    });
  }

  for (const row of rows) {
    const bucketKey = startOfUtcDay(row.bucketDate).toISOString();
    const bucket = buckets.get(bucketKey);

    if (!bucket) {
      continue;
    }

    bucket.totalTrafficBytes += row.totalBytes ?? 0n;

    if (row.activeConnections > 0) {
      bucket.activeClients.add(row.clientId);
    }
  }

  return Array.from(buckets.values());
}

function buildDashboardTrends(rows: DailyUsageTrendRow[]) {
  const buckets = buildTrendBuckets(rows);
  const recentBuckets = buckets.slice(-DASHBOARD_TREND_COMPARISON_DAYS);
  const previousBuckets = buckets.slice(
    -DASHBOARD_TREND_COMPARISON_DAYS * 2,
    -DASHBOARD_TREND_COMPARISON_DAYS,
  );
  const last7DaysTraffic = sumBigInts(recentBuckets.map((bucket) => bucket.totalTrafficBytes));
  const previous7DaysTraffic = sumBigInts(previousBuckets.map((bucket) => bucket.totalTrafficBytes));
  const totalTraffic = sumBigInts(buckets.map((bucket) => bucket.totalTrafficBytes));
  const averageDailyTraffic =
    buckets.length > 0 ? totalTraffic / BigInt(buckets.length) : 0n;
  const busiestBucket = buckets.reduce<DashboardTrendBucketSeed | null>((currentMax, bucket) => {
    if (!currentMax || bucket.totalTrafficBytes > currentMax.totalTrafficBytes) {
      return bucket;
    }

    return currentMax;
  }, null);
  const peakActiveClients = buckets.reduce(
    (currentMax, bucket) => Math.max(currentMax, bucket.activeClients.size),
    0,
  );
  const activeClientsToday = buckets.at(-1)?.activeClients.size ?? 0;

  return {
    windowDays: DASHBOARD_TREND_DAYS,
    comparisonWindowDays: DASHBOARD_TREND_COMPARISON_DAYS,
    buckets: buckets.map((bucket) => ({
      date: bucket.date,
      totalTrafficBytes: bucket.totalTrafficBytes.toString(),
      activeClients: bucket.activeClients.size,
    })),
    comparisons: {
      last7DaysTrafficBytes: last7DaysTraffic.toString(),
      previous7DaysTrafficBytes: previous7DaysTraffic.toString(),
      trafficDeltaPercent: calculateTrafficDeltaPercent(last7DaysTraffic, previous7DaysTraffic),
      averageDailyTrafficBytes: averageDailyTraffic.toString(),
      busiestDayDate:
        busiestBucket && busiestBucket.totalTrafficBytes > 0n ? busiestBucket.date : null,
      busiestDayTrafficBytes:
        busiestBucket && busiestBucket.totalTrafficBytes > 0n
          ? busiestBucket.totalTrafficBytes.toString()
          : '0',
      activeClientsToday,
      peakActiveClients,
    },
  };
}

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly systemService: SystemService,
    private readonly xrayService: XrayService,
  ) {}

  async summary() {
    try {
      await this.xrayService.captureUsageSnapshot({
        reason: 'dashboard-summary',
      });
    } catch {
      // Dashboard must stay available even if Xray restarts.
    }

    await this.prisma.client.updateMany({
      where: {
        status: ClientStatus.ACTIVE,
        expiresAt: {
          lt: new Date(),
        },
      },
      data: {
        status: ClientStatus.EXPIRED,
      },
    });

    const trendStartDate = new Date(
      startOfUtcDay(new Date()).getTime() - (DASHBOARD_TREND_DAYS - 1) * DAY_IN_MS,
    );
    const [
      clients,
      available,
      expired,
      disabled,
      blocked,
      usage,
      latestConnections,
      trendUsageRows,
      host,
      runtime,
    ] = await Promise.all([
        this.prisma.client.count(),
        this.prisma.client.count({
          where: {
            status: ClientStatus.ACTIVE,
          },
        }),
        this.prisma.client.count({
          where: {
            status: ClientStatus.EXPIRED,
          },
        }),
        this.prisma.client.count({
          where: {
            status: ClientStatus.DISABLED,
          },
        }),
        this.prisma.client.count({
          where: {
            status: ClientStatus.BLOCKED,
          },
        }),
        this.prisma.dailyClientUsage.aggregate({
          _sum: {
            totalBytes: true,
          },
        }),
        this.prisma.dailyClientUsage.findMany({
          distinct: ['clientId'],
          orderBy: [{ bucketDate: 'desc' }, { updatedAt: 'desc' }],
          select: {
            activeConnections: true,
            client: {
              select: {
                status: true,
              },
            },
          },
        }),
        this.prisma.dailyClientUsage.findMany({
          where: {
            bucketDate: {
              gte: trendStartDate,
            },
          },
          orderBy: [{ bucketDate: 'asc' }, { clientId: 'asc' }],
          select: {
            bucketDate: true,
            clientId: true,
            totalBytes: true,
            activeConnections: true,
          },
        }),
        this.systemService.getHostMetrics(),
        this.xrayService.getRuntimeSummary(),
      ]);
    const onlineNow = latestConnections.filter(
      (item) => item.activeConnections > 0 && item.client.status === ClientStatus.ACTIVE,
    ).length;
    const trends = buildDashboardTrends(trendUsageRows);

    return {
      totals: {
        clients,
        active: available,
        available,
        onlineNow,
        expired,
        disabled,
        blocked,
        totalTrafficBytes: (usage._sum.totalBytes ?? 0n).toString(),
      },
      trends,
      host,
      runtime: {
        lastConfigSyncAt: runtime.lastConfigSyncAt,
        lastStatsSnapshotAt: runtime.lastStatsSnapshotAt,
        onlineUsers: runtime.onlineUsers,
        xrayStatus: runtime.status,
      },
      message:
        'Дашборд считает онлайн по тем же live-снимкам клиентов, что и список клиентов, поэтому online-статус больше не расходится между экранами.',
    };
  }
}
