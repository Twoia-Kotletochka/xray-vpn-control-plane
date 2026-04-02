import { ClientStatus } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DashboardService } from './dashboard.service';

describe('DashboardService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-01T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns separate counts for available and matched online clients', async () => {
    const findMany = vi
      .fn()
      .mockResolvedValueOnce([
        {
          activeConnections: 2,
          client: {
            status: ClientStatus.ACTIVE,
          },
        },
        {
          activeConnections: 1,
          client: {
            status: ClientStatus.DISABLED,
          },
        },
        {
          activeConnections: 0,
          client: {
            status: ClientStatus.ACTIVE,
          },
        },
      ])
      .mockResolvedValueOnce([
        {
          bucketDate: new Date('2026-03-25T00:00:00.000Z'),
          clientId: 'client-one',
          incomingBytes: 400n,
          outgoingBytes: 600n,
          totalBytes: 1000n,
          activeConnections: 1,
        },
        {
          bucketDate: new Date('2026-03-24T00:00:00.000Z'),
          clientId: 'client-two',
          incomingBytes: 800n,
          outgoingBytes: 1200n,
          totalBytes: 2000n,
          activeConnections: 1,
        },
        {
          bucketDate: new Date('2026-03-30T00:00:00.000Z'),
          clientId: 'client-one',
          incomingBytes: 1800n,
          outgoingBytes: 2200n,
          totalBytes: 4000n,
          activeConnections: 1,
        },
        {
          bucketDate: new Date('2026-03-31T00:00:00.000Z'),
          clientId: 'client-two',
          incomingBytes: 1000n,
          outgoingBytes: 2000n,
          totalBytes: 3000n,
          activeConnections: 1,
        },
        {
          bucketDate: new Date('2026-04-01T00:00:00.000Z'),
          clientId: 'client-three',
          incomingBytes: 2500n,
          outgoingBytes: 3500n,
          totalBytes: 6000n,
          activeConnections: 1,
        },
      ]);
    const prisma = {
      client: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        count: vi
          .fn()
          .mockResolvedValueOnce(9)
          .mockResolvedValueOnce(6)
          .mockResolvedValueOnce(1)
          .mockResolvedValueOnce(1)
          .mockResolvedValueOnce(1),
      },
      dailyClientUsage: {
        aggregate: vi.fn().mockResolvedValue({
          _sum: {
            totalBytes: 4096n,
          },
        }),
        findMany,
      },
    };
    const systemService = {
      getHostMetrics: vi.fn().mockResolvedValue({
        cpuPercent: 12.5,
        ramPercent: 48.2,
        diskPercent: 63.1,
      }),
    };
    const xrayService = {
      captureUsageSnapshot: vi.fn().mockResolvedValue({
        onlineUsers: ['client-one', 'client-two'],
      }),
      getRuntimeSummary: vi.fn().mockResolvedValue({
        apiTarget: 'xray:10085',
        lastConfigSyncAt: '2026-03-26T17:00:00.000Z',
        lastStatsSnapshotAt: '2026-03-26T17:05:00.000Z',
        lastSyncReason: 'dashboard-summary',
        latencyMs: 18,
        onlineUsers: 2,
        status: 'healthy',
        uptimeSeconds: 123,
      }),
    };

    const service = new DashboardService(
      prisma as never,
      systemService as never,
      xrayService as never,
    );

    const summary = await service.summary();

    expect(xrayService.captureUsageSnapshot).toHaveBeenCalledWith({
      reason: 'dashboard-summary',
    });
    expect(prisma.client.updateMany).toHaveBeenCalledWith({
      where: {
        status: ClientStatus.ACTIVE,
        expiresAt: {
          lt: expect.any(Date),
        },
      },
      data: {
        status: ClientStatus.EXPIRED,
      },
    });
    expect(summary.totals).toMatchObject({
      clients: 9,
      active: 6,
      available: 6,
      onlineNow: 2,
      expired: 1,
      disabled: 1,
      blocked: 1,
      totalTrafficBytes: '4096',
    });
    expect(prisma.dailyClientUsage.findMany).toHaveBeenNthCalledWith(1, {
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
    });
    expect(prisma.dailyClientUsage.findMany).toHaveBeenNthCalledWith(2, {
      where: {
        bucketDate: {
          gte: new Date('2026-03-19T00:00:00.000Z'),
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
    });
    expect(summary.trends.windowDays).toBe(14);
    expect(summary.trends.comparisonWindowDays).toBe(7);
    expect(summary.trends.buckets).toHaveLength(14);
    expect(summary.trends.buckets.at(-1)).toMatchObject({
      date: '2026-04-01T00:00:00.000Z',
      incomingTrafficBytes: '2500',
      outgoingTrafficBytes: '3500',
      totalTrafficBytes: '6000',
      activeClients: 1,
    });
    expect(summary.trends.comparisons).toMatchObject({
      last7DaysTrafficBytes: '13000',
      previous7DaysTrafficBytes: '3000',
      trafficDeltaPercent: 333.3,
      busiestDayDate: '2026-04-01T00:00:00.000Z',
      busiestDayTrafficBytes: '6000',
      activeClientsToday: 1,
      peakActiveClients: 1,
    });
    expect(summary.runtime.onlineUsers).toBe(2);
    expect(summary.message).toContain('список клиентов');
  });

  it('returns analytics timeline and per-client traffic ranking', async () => {
    const prisma = {
      client: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'client-ann',
            displayName: 'Ann',
            emailTag: 'ann-27b6cd0c',
            status: ClientStatus.ACTIVE,
            lastSeenAt: new Date('2026-04-01T10:10:00.000Z'),
          },
          {
            id: 'client-den',
            displayName: 'Den',
            emailTag: 'den-bc966509',
            status: ClientStatus.ACTIVE,
            lastSeenAt: null,
          },
        ]),
      },
      dailyClientUsage: {
        groupBy: vi.fn().mockResolvedValue([
          {
            clientId: 'client-ann',
            _sum: {
              incomingBytes: 10240n,
              outgoingBytes: 5120n,
              totalBytes: 15360n,
            },
          },
          {
            clientId: 'client-den',
            _sum: {
              incomingBytes: 2048n,
              outgoingBytes: 4096n,
              totalBytes: 6144n,
            },
          },
        ]),
        findMany: vi
          .fn()
          .mockResolvedValueOnce([
            {
              bucketDate: new Date('2026-03-31T00:00:00.000Z'),
              clientId: 'client-ann',
              incomingBytes: 1024n,
              outgoingBytes: 1024n,
              totalBytes: 2048n,
              activeConnections: 1,
            },
            {
              bucketDate: new Date('2026-04-01T00:00:00.000Z'),
              clientId: 'client-ann',
              incomingBytes: 2048n,
              outgoingBytes: 1024n,
              totalBytes: 3072n,
              activeConnections: 2,
            },
            {
              bucketDate: new Date('2026-04-01T00:00:00.000Z'),
              clientId: 'client-den',
              incomingBytes: 512n,
              outgoingBytes: 1536n,
              totalBytes: 2048n,
              activeConnections: 1,
            },
          ])
          .mockResolvedValueOnce([
            {
              clientId: 'client-ann',
              activeConnections: 1,
            },
            {
              clientId: 'client-den',
              activeConnections: 0,
            },
          ]),
      },
    };
    const systemService = {
      getHostMetrics: vi.fn(),
    };
    const xrayService = {
      captureUsageSnapshot: vi.fn().mockResolvedValue({
        onlineUsers: ['client-ann'],
      }),
      getRuntimeSummary: vi.fn(),
    };

    const service = new DashboardService(
      prisma as never,
      systemService as never,
      xrayService as never,
    );

    const analytics = await service.analytics();

    expect(xrayService.captureUsageSnapshot).toHaveBeenCalledWith({
      reason: 'dashboard-analytics',
    });
    expect(prisma.client.findMany).toHaveBeenCalledWith({
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
    });
    expect(prisma.dailyClientUsage.groupBy).toHaveBeenCalledWith({
      by: ['clientId'],
      _sum: {
        incomingBytes: true,
        outgoingBytes: true,
        totalBytes: true,
      },
    });
    expect(prisma.dailyClientUsage.findMany).toHaveBeenNthCalledWith(1, {
      where: {
        bucketDate: {
          gte: new Date('2026-03-19T00:00:00.000Z'),
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
    });
    expect(prisma.dailyClientUsage.findMany).toHaveBeenNthCalledWith(2, {
      distinct: ['clientId'],
      orderBy: [{ bucketDate: 'desc' }, { updatedAt: 'desc' }],
      select: {
        clientId: true,
        activeConnections: true,
      },
    });
    expect(analytics.totals).toMatchObject({
      totalTrafficBytes: '21504',
      windowTrafficBytes: '5120',
      todayTrafficBytes: '5120',
      onlineNow: 1,
      uniqueClientsWithTraffic: 2,
      topClientDisplayName: 'Ann',
      topClientTrafficBytes: '15360',
      activeClientsToday: 2,
      peakActiveClients: 2,
    });
    expect(analytics.timeline.at(-1)).toMatchObject({
      date: '2026-04-01T00:00:00.000Z',
      incomingTrafficBytes: '2560',
      outgoingTrafficBytes: '2560',
      totalTrafficBytes: '5120',
      activeClients: 2,
    });
    expect(analytics.clients[0]).toMatchObject({
      displayName: 'Ann',
      totalTrafficBytes: '15360',
      windowTrafficBytes: '5120',
      todayTrafficBytes: '3072',
      activeConnections: 1,
      activeDays: 2,
      peakActiveConnections: 2,
    });
  });
});
