import { statfs } from 'node:fs/promises';
import { Socket } from 'node:net';
import os from 'node:os';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AppEnv } from '../../common/config/env.schema';
import { PrismaService } from '../../common/database/prisma.service';
import { XrayService } from '../xray/xray.service';

@Injectable()
export class SystemService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService<AppEnv, true>,
    private readonly xrayService: XrayService,
  ) {}

  async status() {
    const panelTlsMode = this.configService.get('PANEL_TLS_MODE', { infer: true });
    const caddyPort = panelTlsMode === 'domain' ? 443 : 8443;
    const [host, xrayRuntime, postgres, caddy, xrayTcp] = await Promise.all([
      this.getHostMetrics(),
      this.xrayService.getRuntimeSummary(),
      this.probeDatabase(),
      this.probeTcpTarget('caddy', caddyPort),
      this.probeTcpTarget('xray', this.configService.get('XRAY_VLESS_PORT', { infer: true })),
    ]);

    return {
      services: [
        {
          name: 'api',
          status: 'healthy',
          details: 'NestJS control plane is serving requests.',
          latencyMs: 0,
          target: 'self',
        },
        {
          name: 'postgres',
          ...postgres,
        },
        {
          name: 'xray-control',
          status: xrayRuntime.status,
          details:
            xrayRuntime.status === 'healthy'
              ? `Control API online, users online: ${xrayRuntime.onlineUsers}.`
              : 'Control API is not reachable right now.',
          latencyMs: xrayRuntime.latencyMs,
          target: xrayRuntime.apiTarget,
        },
        {
          name: 'xray-data',
          ...xrayTcp,
        },
        {
          name: 'caddy',
          ...caddy,
        },
      ],
      host,
      runtime: xrayRuntime,
      message:
        'Статус собирается из PostgreSQL, TCP-проб сервисов и Xray control API. Для управления рестартами намеренно не используется docker.sock внутри приложения.',
    };
  }

  async getHostMetrics() {
    const loadAverage = os.loadavg()[0] ?? 0;
    const cpuPercent = Number(
      Math.min(100, (loadAverage / Math.max(os.cpus().length, 1)) * 100).toFixed(1),
    );
    const ramPercent = Number(
      (((os.totalmem() - os.freemem()) / Math.max(os.totalmem(), 1)) * 100).toFixed(1),
    );
    const diskPercent = await this.getDiskPercent();

    return {
      cpuPercent,
      diskPercent,
      ramPercent,
    };
  }

  private async probeDatabase() {
    const startedAt = Date.now();

    try {
      await this.prisma.$queryRawUnsafe('SELECT 1');

      return {
        status: 'healthy',
        details: 'PostgreSQL query probe succeeded.',
        latencyMs: Date.now() - startedAt,
        target: 'postgres:5432',
      };
    } catch (error) {
      return {
        status: 'down',
        details: error instanceof Error ? error.message : 'Database probe failed.',
        latencyMs: Date.now() - startedAt,
        target: 'postgres:5432',
      };
    }
  }

  private async probeTcpTarget(host: string, port: number) {
    const startedAt = Date.now();

    try {
      await new Promise<void>((resolve, reject) => {
        const socket = new Socket();

        socket.setTimeout(1_500);
        socket.once('connect', () => {
          socket.destroy();
          resolve();
        });
        socket.once('timeout', () => {
          socket.destroy();
          reject(new Error('TCP probe timed out.'));
        });
        socket.once('error', (error) => {
          socket.destroy();
          reject(error);
        });
        socket.connect(port, host);
      });

      return {
        status: 'healthy',
        details: 'TCP listener accepted the connection.',
        latencyMs: Date.now() - startedAt,
        target: `${host}:${port}`,
      };
    } catch (error) {
      return {
        status: 'down',
        details: error instanceof Error ? error.message : 'TCP probe failed.',
        latencyMs: Date.now() - startedAt,
        target: `${host}:${port}`,
      };
    }
  }

  private async getDiskPercent(): Promise<number | null> {
    try {
      const stats = await statfs('/');
      const blocks = Number(stats.blocks);
      const available = Number(stats.bavail);

      if (!Number.isFinite(blocks) || blocks <= 0) {
        return null;
      }

      return Number((((blocks - available) / blocks) * 100).toFixed(1));
    } catch {
      return null;
    }
  }
}
