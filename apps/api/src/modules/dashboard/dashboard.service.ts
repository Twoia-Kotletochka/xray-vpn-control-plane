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
  incomingBytes: bigint;
  outgoingBytes: bigint;
  totalBytes: bigint;
  activeConnections: number;
};

type DashboardTrendBucketSeed = {
  date: string;
  incomingTrafficBytes: bigint;
  outgoingTrafficBytes: bigint;
  totalTrafficBytes: bigint;
  activeClients: Set<string>;
};

type DashboardClientUsageAggregateRow = {
  clientId: string;
  _sum: {
    incomingBytes: bigint | null;
    outgoingBytes: bigint | null;
    totalBytes: bigint | null;
  };
};

type DashboardClientRuntimeRow = {
  clientId: string;
  activeConnections: number;
};

type DashboardAnalyticsClientRow = {
  id: string;
  displayName: string;
  emailTag: string;
  status: ClientStatus;
  lastSeenAt: Date | null;
};

type DashboardAnalyticsClientSeed = DashboardAnalyticsClientRow & {
  activeConnections: number;
  activeDays: number;
  incomingBytes: bigint;
  outgoingBytes: bigint;
  peakActiveConnections: number;
  todayTrafficBytes: bigint;
  totalTrafficBytes: bigint;
  windowTrafficBytes: bigint;
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

function compareBigInts(left: bigint, right: bigint) {
  if (left === right) {
    return 0;
  }

  return left > right ? 1 : -1;
}

function emptyTrafficTotals() {
  return {
    incomingBytes: 0n,
    outgoingBytes: 0n,
    totalBytes: 0n,
  };
}

function buildTrendBuckets(rows: DailyUsageTrendRow[]) {
  const today = startOfUtcDay(new Date());
  const buckets = new Map<string, DashboardTrendBucketSeed>();

  for (let offset = DASHBOARD_TREND_DAYS - 1; offset >= 0; offset -= 1) {
    const bucketDate = new Date(today.getTime() - offset * DAY_IN_MS);
    const key = bucketDate.toISOString();

    buckets.set(key, {
      date: key,
      incomingTrafficBytes: 0n,
      outgoingTrafficBytes: 0n,
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

    bucket.incomingTrafficBytes += row.incomingBytes ?? 0n;
    bucket.outgoingTrafficBytes += row.outgoingBytes ?? 0n;
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
      incomingTrafficBytes: bucket.incomingTrafficBytes.toString(),
      outgoingTrafficBytes: bucket.outgoingTrafficBytes.toString(),
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

function buildDashboardAnalytics(
  clients: DashboardAnalyticsClientRow[],
  allTimeUsageRows: DashboardClientUsageAggregateRow[],
  trendRows: DailyUsageTrendRow[],
  latestConnections: DashboardClientRuntimeRow[],
) {
  const todayKey = startOfUtcDay(new Date()).toISOString();
  const trendBuckets = buildTrendBuckets(trendRows);
  const totalTrafficBytes = sumBigInts(
    allTimeUsageRows.map((row) => row._sum.totalBytes ?? 0n),
  );
  const totalWindowTrafficBytes = sumBigInts(
    trendBuckets.map((bucket) => bucket.totalTrafficBytes),
  );
  const totalWindowIncomingBytes = sumBigInts(
    trendBuckets.map((bucket) => bucket.incomingTrafficBytes),
  );
  const totalWindowOutgoingBytes = sumBigInts(
    trendBuckets.map((bucket) => bucket.outgoingTrafficBytes),
  );
  const averageDailyTrafficBytes =
    trendBuckets.length > 0 ? totalWindowTrafficBytes / BigInt(trendBuckets.length) : 0n;
  const trafficTotalsByClient = new Map(
    allTimeUsageRows.map((row) => [
      row.clientId,
      {
        incomingBytes: row._sum.incomingBytes ?? 0n,
        outgoingBytes: row._sum.outgoingBytes ?? 0n,
        totalBytes: row._sum.totalBytes ?? 0n,
      },
    ]),
  );
  const latestConnectionsMap = new Map(
    latestConnections.map((snapshot) => [snapshot.clientId, snapshot.activeConnections]),
  );
  const analyticsClients = new Map<string, DashboardAnalyticsClientSeed>(
    clients.map((client) => {
      const totals = trafficTotalsByClient.get(client.id) ?? emptyTrafficTotals();

      return [
        client.id,
        {
          ...client,
          activeConnections: latestConnectionsMap.get(client.id) ?? 0,
          activeDays: 0,
          incomingBytes: totals.incomingBytes,
          outgoingBytes: totals.outgoingBytes,
          peakActiveConnections: 0,
          todayTrafficBytes: 0n,
          totalTrafficBytes: totals.totalBytes,
          windowTrafficBytes: 0n,
        },
      ];
    }),
  );

  for (const row of trendRows) {
    const client = analyticsClients.get(row.clientId);

    if (!client) {
      continue;
    }

    client.windowTrafficBytes += row.totalBytes ?? 0n;
    client.peakActiveConnections = Math.max(client.peakActiveConnections, row.activeConnections);

    if (row.totalBytes > 0n || row.activeConnections > 0) {
      client.activeDays += 1;
    }

    if (startOfUtcDay(row.bucketDate).toISOString() === todayKey) {
      client.todayTrafficBytes += row.totalBytes ?? 0n;
    }
  }

  const orderedClients = Array.from(analyticsClients.values()).sort((left, right) => {
    const totalTrafficDelta = compareBigInts(right.totalTrafficBytes, left.totalTrafficBytes);

    if (totalTrafficDelta !== 0) {
      return totalTrafficDelta;
    }

    const windowTrafficDelta = compareBigInts(right.windowTrafficBytes, left.windowTrafficBytes);

    if (windowTrafficDelta !== 0) {
      return windowTrafficDelta;
    }

    return left.displayName.localeCompare(right.displayName);
  });
  const topClient = orderedClients.find((client) => client.totalTrafficBytes > 0n) ?? null;
  const uniqueClientsWithTraffic = orderedClients.filter(
    (client) => client.totalTrafficBytes > 0n,
  ).length;
  const onlineNow = orderedClients.filter(
    (client) => client.activeConnections > 0 && client.status === ClientStatus.ACTIVE,
  ).length;
  const peakActiveClients = trendBuckets.reduce(
    (currentMax, bucket) => Math.max(currentMax, bucket.activeClients.size),
    0,
  );
  const activeClientsToday = trendBuckets.at(-1)?.activeClients.size ?? 0;

  return {
    generatedAt: new Date().toISOString(),
    windowDays: DASHBOARD_TREND_DAYS,
    totals: {
      totalTrafficBytes: totalTrafficBytes.toString(),
      windowTrafficBytes: totalWindowTrafficBytes.toString(),
      windowIncomingBytes: totalWindowIncomingBytes.toString(),
      windowOutgoingBytes: totalWindowOutgoingBytes.toString(),
      averageDailyTrafficBytes: averageDailyTrafficBytes.toString(),
      activeClientsToday,
      peakActiveClients,
      uniqueClientsWithTraffic,
      onlineNow,
      topClientDisplayName: topClient?.displayName ?? null,
      topClientTrafficBytes: topClient?.totalTrafficBytes.toString() ?? '0',
      todayTrafficBytes: trendBuckets.at(-1)?.totalTrafficBytes.toString() ?? '0',
    },
    timeline: trendBuckets.map((bucket) => ({
      date: bucket.date,
      incomingTrafficBytes: bucket.incomingTrafficBytes.toString(),
      outgoingTrafficBytes: bucket.outgoingTrafficBytes.toString(),
      totalTrafficBytes: bucket.totalTrafficBytes.toString(),
      activeClients: bucket.activeClients.size,
    })),
    clients: orderedClients.map((client) => ({
      id: client.id,
      displayName: client.displayName,
      emailTag: client.emailTag,
      status: client.status,
      lastSeenAt: client.lastSeenAt?.toISOString() ?? null,
      activeConnections: client.activeConnections,
      activeDays: client.activeDays,
      incomingBytes: client.incomingBytes.toString(),
      outgoingBytes: client.outgoingBytes.toString(),
      peakActiveConnections: client.peakActiveConnections,
      todayTrafficBytes: client.todayTrafficBytes.toString(),
      totalTrafficBytes: client.totalTrafficBytes.toString(),
      windowTrafficBytes: client.windowTrafficBytes.toString(),
    })),
  };
}

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly systemService: SystemService,
    private readonly xrayService: XrayService,
  ) {}

  private async primeDashboardData(reason: 'dashboard-summary' | 'dashboard-analytics') {
    try {
      await this.xrayService.captureUsageSnapshot({
        reason,
      });
    } catch {
      // The panel must stay available even if Xray is restarting.
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
  }

  async summary() {
    await this.primeDashboardData('dashboard-summary');

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
            incomingBytes: true,
            outgoingBytes: true,
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

  async analytics() {
    await this.primeDashboardData('dashboard-analytics');

    const trendStartDate = new Date(
      startOfUtcDay(new Date()).getTime() - (DASHBOARD_TREND_DAYS - 1) * DAY_IN_MS,
    );
    const [clients, allTimeUsageRows, trendUsageRows, latestConnections] = await Promise.all([
      this.prisma.client.findMany({
        orderBy: {
          displayName: 'asc',
        },
        select: {
          id: true,
          displayName: true,
          emailTag: true,
          status: true,
          lastSeenAt: true,
        },
      }),
      this.prisma.dailyClientUsage.groupBy({
        by: ['clientId'],
        _sum: {
          incomingBytes: true,
          outgoingBytes: true,
          totalBytes: true,
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
          incomingBytes: true,
          outgoingBytes: true,
          totalBytes: true,
          activeConnections: true,
        },
      }),
      this.prisma.dailyClientUsage.findMany({
        distinct: ['clientId'],
        orderBy: [{ bucketDate: 'desc' }, { updatedAt: 'desc' }],
        select: {
          clientId: true,
          activeConnections: true,
        },
      }),
    ]);

    return buildDashboardAnalytics(clients, allTimeUsageRows, trendUsageRows, latestConnections);
  }
}
