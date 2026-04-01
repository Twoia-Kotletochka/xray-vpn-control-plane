import { ClientStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { DashboardService } from './dashboard.service';

describe('DashboardService', () => {
  it('returns separate counts for available and matched online clients', async () => {
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
        findMany: vi.fn().mockResolvedValue([
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
        ]),
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
    expect(summary.runtime.onlineUsers).toBe(2);
    expect(summary.message).toContain('список клиентов');
  });
});
