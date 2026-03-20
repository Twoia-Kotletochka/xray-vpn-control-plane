import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AppEnv } from '../../common/config/env.schema';
import { PrismaService } from '../../common/database/prisma.service';

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService<AppEnv, true>,
  ) {}

  getHealth() {
    return {
      service: 'server-vpn-api',
      status: 'ok',
      environment: this.configService.get('NODE_ENV', { infer: true }),
      timestamp: new Date().toISOString(),
    };
  }

  async getReadiness() {
    let databaseStatus: 'up' | 'down' = 'up';

    try {
      await this.prisma.$queryRawUnsafe('SELECT 1');
    } catch {
      databaseStatus = 'down';
    }

    return {
      status: databaseStatus === 'up' ? 'ready' : 'degraded',
      checks: {
        database: databaseStatus,
      },
      timestamp: new Date().toISOString(),
    };
  }
}
