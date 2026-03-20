import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientStatus, TransportProfile } from '@prisma/client';

import type { AppEnv } from '../../common/config/env.schema';
import { PrismaService } from '../../common/database/prisma.service';
import { emptyClientUsage, serializeClient } from '../clients/client-presenter';

@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService<AppEnv, true>,
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
    const client = await this.prisma.client.findUnique({
      where: {
        id: clientId,
      },
    });

    if (!client) {
      throw new NotFoundException('Client was not found.');
    }

    const uri = this.buildConnectionUri(client);

    return {
      client: serializeClient(client, emptyClientUsage()),
      config: {
        uri,
        qrcodeText: uri,
        subscriptionUrl: this.buildSubscriptionUrl(client.subscriptionToken),
      },
      instructions: [
        'Импортируйте subscription URL в совместимый VLESS/Xray клиент.',
        'Если клиент не поддерживает подписки, используйте VLESS-ссылку напрямую.',
        'Для iOS/macOS подойдут FoXray и Streisand; для Windows/Android — v2rayN и v2rayNG.',
      ],
    };
  }

  async renderSubscription(subscriptionToken: string) {
    const client = await this.prisma.client.findUnique({
      where: {
        subscriptionToken,
      },
    });

    if (!client) {
      throw new NotFoundException('Subscription was not found.');
    }

    if (client.status !== ClientStatus.ACTIVE) {
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
}
