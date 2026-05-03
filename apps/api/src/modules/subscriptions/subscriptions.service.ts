import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientStatus, TransportProfile } from '@prisma/client';

import { canViewSensitiveClientConfig } from '../../common/auth/admin-role.utils';
import type { AuthenticatedAdmin } from '../../common/auth/authenticated-admin.interface';
import type { AppEnv } from '../../common/config/env.schema';
import { PrismaService } from '../../common/database/prisma.service';
import {
  emptyClientUsage,
  resolveEffectiveClientStatus,
  serializeClientForAdmin,
} from '../clients/client-presenter';
import { WireguardService } from '../wireguard/wireguard.service';
import { XrayService } from '../xray/xray.service';

type AddressMode = 'domain' | 'ip';

type PlatformGuide = {
  clientApp: string;
  platform: string;
  steps: string[];
};

type VlessTransportVariant = {
  addressMode: AddressMode;
  downloadFileName: string;
  endpointHost: string;
  endpointPort: number;
  label: string;
  qrcodeText: string;
  subscriptionUrl: string;
  uri: string;
};

type VlessTransportBundle = {
  defaultVariant: AddressMode;
  enabled: boolean;
  id: 'vless';
  instructions: string[];
  label: string;
  platformGuides: PlatformGuide[];
  supportsQr: true;
  supportsSubscription: true;
  variants: VlessTransportVariant[];
};

type WireguardTransportBundle = Awaited<ReturnType<WireguardService['getClientBundle']>>;

type SubscriptionTransportBundle = NonNullable<WireguardTransportBundle> | VlessTransportBundle;

@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService<AppEnv, true>,
    private readonly xrayService: XrayService,
    private readonly wireguardService: WireguardService,
  ) {}

  listTemplates() {
    const wireguardEnabled = this.configService.get('WIREGUARD_ENABLED', { infer: true });

    return {
      items: [
        {
          id: 'vless-reality-main',
          profile: 'VLESS + REALITY',
          platformTargets: ['Windows', 'macOS', 'Android', 'iPhone/iPad'],
          qrReady: true,
        },
        ...(wireguardEnabled
          ? [
              {
                id: 'wireguard-main',
                profile: 'WireGuard',
                platformTargets: ['Windows', 'macOS', 'Android', 'iPhone/iPad'],
                qrReady: true,
              },
            ]
          : []),
      ],
    };
  }

  async getClientBundle(clientId: string, admin: AuthenticatedAdmin) {
    await this.captureUsageSnapshotBestEffort();

    const client = await this.prisma.client.findUnique({
      where: {
        id: clientId,
      },
      include: {
        wireguardPeer: {
          select: {
            assignedIpv4: true,
            lastHandshakeAt: true,
          },
        },
      },
    });

    if (!client) {
      throw new NotFoundException('Client was not found.');
    }

    if (!canViewSensitiveClientConfig(admin, client.createdByAdminUserId)) {
      throw new ForbiddenException(
        'Client connection configs are available only to the owner or a super admin.',
      );
    }

    const usage = await this.loadClientUsage(client.id);
    const vlessTransport = this.buildVlessTransportBundle(client);
    const wireguardTransport = await this.wireguardService.getClientBundle(client);
    const transports = [vlessTransport, wireguardTransport].filter(
      (item): item is SubscriptionTransportBundle => item !== null,
    );
    const primaryTransport = transports[0] ?? null;
    const primaryConfig = this.buildCompatibilityConfig(primaryTransport);

    return {
      client: serializeClientForAdmin(client, usage, admin),
      config: primaryConfig,
      instructions: primaryTransport?.instructions ?? [],
      platformGuides: primaryTransport?.platformGuides ?? [],
      defaultTransportId: primaryTransport?.id ?? null,
      transports,
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

    if (status !== ClientStatus.ACTIVE || !client.vlessEnabled) {
      throw new ForbiddenException('Client subscription is not active.');
    }

    const vlessTransport = this.buildVlessTransportBundle(client);

    if (!vlessTransport) {
      throw new ForbiddenException('VLESS transport is not available for this client.');
    }

    const preferredVariant =
      vlessTransport.variants.find(
        (variant) => variant.addressMode === vlessTransport.defaultVariant,
      ) ?? vlessTransport.variants[0];

    if (!preferredVariant) {
      throw new ForbiddenException('VLESS transport is not available for this client.');
    }

    return `${preferredVariant.uri}\n`;
  }

  private buildVlessTransportBundle(client: {
    displayName: string;
    subscriptionToken: string;
    transportProfile: TransportProfile;
    uuid: string;
    vlessEnabled: boolean;
  }): VlessTransportBundle | null {
    if (!client.vlessEnabled) {
      return null;
    }

    if (client.transportProfile !== TransportProfile.VLESS_REALITY_TCP) {
      throw new ForbiddenException('Only VLESS + REALITY is enabled in the current release.');
    }

    const endpointVariants = this.resolveVlessEndpointVariants();
    const subscriptionUrl = this.buildSubscriptionUrl(client.subscriptionToken);
    const defaultVariant = endpointVariants[0]?.addressMode ?? 'domain';
    const listenPort = this.configService.get('XRAY_VLESS_PORT', { infer: true });

    return {
      defaultVariant,
      enabled: true,
      id: 'vless',
      instructions: [
        'Импортируйте subscription URL в совместимый VLESS/Xray клиент.',
        'Если подписки не поддерживаются, используйте прямую VLESS-ссылку или QR-код.',
        'После продления доступа или изменения лимитов обычно достаточно обновить подписку.',
      ],
      label: 'VLESS + REALITY',
      platformGuides: [
        {
          clientApp: 'v2rayN',
          platform: 'Windows',
          steps: [
            'Откройте управление подписками в v2rayN.',
            'Вставьте subscription URL и выполните обновление профилей.',
            'Для разового подключения можно импортировать VLESS-ссылку напрямую.',
          ],
        },
        {
          clientApp: 'FoXray или Streisand',
          platform: 'macOS',
          steps: [
            'Добавьте профиль через subscription URL или вставьте VLESS-ссылку вручную.',
            'Проверьте параметры reality/tcp/vision после импорта.',
            'Сохраните профиль и подключитесь одним кликом.',
          ],
        },
        {
          clientApp: 'v2rayNG',
          platform: 'Android',
          steps: [
            'Импортируйте subscription URL в v2rayNG.',
            'Для быстрого импорта можно использовать QR-код.',
            'После изменений на сервере выполните refresh subscription.',
          ],
        },
        {
          clientApp: 'Streisand или FoXray',
          platform: 'iPhone/iPad',
          steps: [
            'Импортируйте subscription URL или добавьте VLESS-ссылку вручную.',
            'Подтвердите создание VPN-профиля в системе.',
            'Подключитесь к сохранённой конфигурации.',
          ],
        },
      ],
      supportsQr: true,
      supportsSubscription: true,
      variants: endpointVariants.map((variant) => {
        const uri = this.buildConnectionUri({
          displayName: client.displayName,
          endpointHost: variant.host,
          subscriptionToken: client.subscriptionToken,
          transportProfile: client.transportProfile,
          uuid: client.uuid,
        });

        return {
          addressMode: variant.addressMode,
          downloadFileName: `${sanitizeFileName(client.displayName)}-vless-${variant.addressMode}.txt`,
          endpointHost: variant.host,
          endpointPort: listenPort,
          label: variant.label,
          qrcodeText: uri,
          subscriptionUrl,
          uri,
        };
      }),
    };
  }

  private buildCompatibilityConfig(primaryTransport: SubscriptionTransportBundle | null) {
    if (!primaryTransport) {
      return {
        qrcodeText: '',
        subscriptionUrl: '',
        uri: '',
      };
    }

    if (primaryTransport.id === 'vless') {
      const primaryVariant =
        primaryTransport.variants.find(
          (variant) => variant.addressMode === primaryTransport.defaultVariant,
        ) ?? primaryTransport.variants[0];

      if (!primaryVariant) {
        return {
          qrcodeText: '',
          subscriptionUrl: '',
          uri: '',
        };
      }

      return {
        qrcodeText: primaryVariant.qrcodeText,
        subscriptionUrl: primaryVariant.subscriptionUrl,
        uri: primaryVariant.uri,
      };
    }

    const primaryVariant =
      primaryTransport.variants.find(
        (variant) => variant.addressMode === primaryTransport.defaultVariant,
      ) ?? primaryTransport.variants[0];

    if (!primaryVariant) {
      return {
        qrcodeText: '',
        subscriptionUrl: '',
        uri: '',
      };
    }

    return {
      qrcodeText: primaryVariant.qrText,
      subscriptionUrl: '',
      uri: primaryVariant.configText,
    };
  }

  private buildConnectionUri(client: {
    displayName: string;
    endpointHost: string;
    subscriptionToken: string;
    transportProfile: TransportProfile;
    uuid: string;
  }): string {
    if (client.transportProfile !== TransportProfile.VLESS_REALITY_TCP) {
      throw new ForbiddenException('Only VLESS + REALITY is enabled in the current release.');
    }

    const port = this.configService.get('XRAY_VLESS_PORT', { infer: true });
    const publicKey = this.configService.get('XRAY_REALITY_PUBLIC_KEY', { infer: true });
    const sni = this.configService.get('XRAY_DEFAULT_SNI', { infer: true });
    const spiderPath = this.configService.get('XRAY_DEFAULT_SPIDER_X', { infer: true });
    const shortId = this.resolveShortId();

    return `vless://${client.uuid}@${client.endpointHost}:${port}?encryption=none&security=reality&flow=xtls-rprx-vision&type=tcp&headerType=none&fp=chrome&sni=${encodeURIComponent(
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

  private resolveVlessEndpointVariants() {
    const baseUrlHost = new URL(
      this.configService.get('XRAY_SUBSCRIPTION_BASE_URL', { infer: true }),
    ).hostname;
    const preferredHost =
      this.configService.get('XRAY_PUBLIC_HOST', { infer: true })?.trim() || baseUrlHost;
    const publicIp =
      this.configService.get('SERVER_PUBLIC_IP', { infer: true })?.trim() ||
      (isIpv4Address(baseUrlHost) ? baseUrlHost : '');
    const port = this.configService.get('XRAY_VLESS_PORT', { infer: true });
    const variants: Array<{ addressMode: AddressMode; host: string; label: string }> = [];

    if (preferredHost && !isIpv4Address(preferredHost)) {
      variants.push({
        addressMode: 'domain',
        host: preferredHost,
        label: `${preferredHost}:${port}`,
      });
    }

    if (publicIp) {
      variants.push({
        addressMode: 'ip',
        host: publicIp,
        label: `${publicIp}:${port}`,
      });
    }

    if (variants.length === 0 && preferredHost) {
      variants.push({
        addressMode: 'ip',
        host: preferredHost,
        label: `${preferredHost}:${port}`,
      });
    }

    return variants;
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

function sanitizeFileName(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'client'
  );
}

function isIpv4Address(value: string) {
  return /^([0-9]{1,3}\.){3}[0-9]{1,3}$/.test(value);
}
