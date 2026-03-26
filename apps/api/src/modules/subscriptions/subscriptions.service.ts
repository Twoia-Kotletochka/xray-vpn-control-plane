import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientStatus, TransportProfile } from '@prisma/client';

import type { AppEnv } from '../../common/config/env.schema';
import { PrismaService } from '../../common/database/prisma.service';
import {
  emptyClientUsage,
  resolveEffectiveClientStatus,
  serializeClient,
} from '../clients/client-presenter';
import { XrayService } from '../xray/xray.service';

@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService<AppEnv, true>,
    private readonly xrayService: XrayService,
  ) {}

  listTemplates() {
    return {
      items: [
        {
          id: 'vless-reality-main',
          profile: 'VLESS + REALITY',
          platformTargets: ['Windows', 'macOS', 'Android', 'iPhone/iPad'],
          qrReady: true,
        },
      ],
    };
  }

  async getClientBundle(clientId: string) {
    await this.captureUsageSnapshotBestEffort();

    const client = await this.prisma.client.findUnique({
      where: {
        id: clientId,
      },
    });

    if (!client) {
      throw new NotFoundException('Client was not found.');
    }

    const usage = await this.loadClientUsage(client.id);
    const uri = this.buildConnectionUri(client);

    return {
      client: serializeClient(client, usage),
      config: {
        uri,
        qrcodeText: uri,
        subscriptionUrl: this.buildSubscriptionUrl(client.subscriptionToken),
      },
      instructions: [
        'Импортируйте subscription URL в совместимый VLESS/Xray клиент.',
        'Если клиент не поддерживает подписки, используйте VLESS-ссылку напрямую или QR-код.',
        'После продления и изменения лимитов ссылка обычно остаётся прежней, достаточно обновить подписку.',
      ],
      platformGuides: [
        {
          clientApp: 'v2rayN',
          platform: 'Windows',
          steps: [
            'Откройте v2rayN и перейдите в управление подписками.',
            'Вставьте subscription URL, выполните обновление и выберите профиль.',
            'Если нужно разовое подключение, импортируйте VLESS-ссылку вручную.',
          ],
        },
        {
          clientApp: 'FoXray или Streisand',
          platform: 'macOS',
          steps: [
            'Добавьте профиль через subscription URL или вставьте VLESS-ссылку.',
            'Проверьте, что security = reality, transport = tcp, flow = vision.',
            'После импорта сохраните профиль и подключитесь одним кликом.',
          ],
        },
        {
          clientApp: 'v2rayNG',
          platform: 'Android',
          steps: [
            'Импортируйте subscription URL в v2rayNG.',
            'При необходимости используйте QR-код для быстрого импорта.',
            'После обновления сервера просто выполните refresh subscription.',
          ],
        },
        {
          clientApp: 'Streisand или FoXray',
          platform: 'iPhone/iPad',
          steps: [
            'Откройте клиент и импортируйте subscription URL.',
            'Если подписки нет, добавьте VLESS-ссылку вручную.',
            'Подтвердите добавление профиля и подключитесь к сохранённой конфигурации.',
          ],
        },
      ],
    };
  }

  async renderSubscription(subscriptionToken: string) {
    await this.captureUsageSnapshotBestEffort();

    const client = await this.prisma.client.findUnique({
      where: {
        subscriptionToken,
      },
    });

    if (!client) {
      throw new NotFoundException('Subscription was not found.');
    }

    const usage = await this.loadClientUsage(client.id);
    const status = resolveEffectiveClientStatus({
      ...client,
      trafficUsedBytes: usage.totalBytes,
    });

    if (status !== ClientStatus.ACTIVE) {
      throw new ForbiddenException('Client subscription is not active.');
    }

    return `${this.buildConnectionUri(client)}\n`;
  }

  private buildConnectionUri(client: {
    uuid: string;
    displayName: string;
    transportProfile: TransportProfile;
    subscriptionToken: string;
  }): string {
    if (client.transportProfile !== TransportProfile.VLESS_REALITY_TCP) {
      throw new ForbiddenException('Only VLESS + REALITY is enabled in the current MVP.');
    }

    const baseUrl = new URL(this.configService.get('XRAY_SUBSCRIPTION_BASE_URL', { infer: true }));
    const serverHost = baseUrl.hostname;
    const port = this.configService.get('XRAY_VLESS_PORT', { infer: true });
    const publicKey = this.configService.get('XRAY_REALITY_PUBLIC_KEY', { infer: true });
    const sni = this.configService.get('XRAY_DEFAULT_SNI', { infer: true });
    const spiderPath = this.configService.get('XRAY_DEFAULT_SPIDER_X', { infer: true });
    const shortId = this.resolveShortId();

    return `vless://${client.uuid}@${serverHost}:${port}?encryption=none&security=reality&flow=xtls-rprx-vision&type=tcp&headerType=none&fp=chrome&sni=${encodeURIComponent(
      sni,
    )}&pbk=${encodeURIComponent(publicKey)}&sid=${encodeURIComponent(shortId)}&spx=${encodeURIComponent(
      spiderPath,
    )}#${encodeURIComponent(client.displayName)}`;
  }

  private buildSubscriptionUrl(subscriptionToken: string): string {
    const baseUrl = new URL(this.configService.get('XRAY_SUBSCRIPTION_BASE_URL', { infer: true }));
    return new URL(`/api/subscriptions/${subscriptionToken}`, baseUrl).toString();
  }

  private resolveShortId(): string {
    const shortIds = this.configService.get('XRAY_SHORT_IDS', { infer: true });

    return (
      shortIds
        .split(',')
        .map((item: string) => item.trim())
        .find((item: string) => item.length > 0) ?? ''
    );
  }

  private async loadClientUsage(clientId: string) {
    const [aggregate, latestConnections] = await Promise.all([
      this.prisma.dailyClientUsage.aggregate({
        where: {
          clientId,
        },
        _sum: {
          incomingBytes: true,
          outgoingBytes: true,
          totalBytes: true,
        },
      }),
      this.prisma.dailyClientUsage.findFirst({
        where: {
          clientId,
        },
        orderBy: [{ bucketDate: 'desc' }, { updatedAt: 'desc' }],
        select: {
          activeConnections: true,
        },
      }),
    ]);

    return {
      ...emptyClientUsage(),
      activeConnections: latestConnections?.activeConnections ?? 0,
      incomingBytes: aggregate._sum.incomingBytes ?? 0n,
      outgoingBytes: aggregate._sum.outgoingBytes ?? 0n,
      totalBytes: aggregate._sum.totalBytes ?? 0n,
    };
  }

  private async captureUsageSnapshotBestEffort() {
    try {
      await this.xrayService.captureUsageSnapshot({
        reason: 'subscriptions',
      });
    } catch {
      // Subscription rendering should remain available even while Xray control API is restarting.
    }
  }
}
