import { Injectable } from '@nestjs/common';
import { ClientStatus } from '@prisma/client';

import { PrismaService } from '../../common/database/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async summary() {
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

    const [clients, active, expired, disabled, blocked, usage] = await this.prisma.$transaction([
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
    ]);

    return {
      totals: {
        clients,
        active,
        expired,
        disabled,
        blocked,
        totalTrafficBytes: (usage._sum.totalBytes ?? 0n).toString(),
      },
      host: {
        cpuPercent: null,
        ramPercent: null,
        diskPercent: null,
      },
      message:
        'Сводка по клиентам и трафику уже читается из PostgreSQL. Хостовые метрики будут подключены отдельным безопасным system-probe этапом.',
    };
  }
}
