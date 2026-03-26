import { Injectable } from '@nestjs/common';
import { ClientStatus } from '@prisma/client';

import { PrismaService } from '../../common/database/prisma.service';
import { SystemService } from '../system/system.service';
import { XrayService } from '../xray/xray.service';

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

    const [clients, available, expired, disabled, blocked, usage, host, runtime] =
      await Promise.all([
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
        this.systemService.getHostMetrics(),
        this.xrayService.getRuntimeSummary(),
      ]);

    return {
      totals: {
        clients,
        active: available,
        available,
        onlineNow: runtime.onlineUsers,
        expired,
        disabled,
        blocked,
        totalTrafficBytes: (usage._sum.totalBytes ?? 0n).toString(),
      },
      host,
      runtime: {
        lastConfigSyncAt: runtime.lastConfigSyncAt,
        lastStatsSnapshotAt: runtime.lastStatsSnapshotAt,
        onlineUsers: runtime.onlineUsers,
        xrayStatus: runtime.status,
      },
      message:
        'Дашборд разделяет доступных клиентов по статусу и реальные live-подключения из Xray runtime, чтобы онлайн не смешивался с просто активными профилями.',
    };
  }
}
