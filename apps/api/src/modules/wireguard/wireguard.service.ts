import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type Client, ClientStatus, type WireguardPeer } from '@prisma/client';

import type { AppEnv } from '../../common/config/env.schema';
import { PrismaService } from '../../common/database/prisma.service';
import { resolveEffectiveClientStatus } from '../clients/client-presenter';
import { allocateWireguardPeerIpv4 } from './wireguard-ip.util';
import {
  generateWireguardKeyPair,
  generateWireguardPresharedKey,
} from './wireguard-crypto.util';
import {
  decryptWireguardSecret,
  encryptWireguardSecret,
} from './wireguard-secret.util';

type WireguardClientBundle = {
  defaultVariant: 'domain' | 'ip';
  enabled: boolean;
  id: 'wireguard';
  instructions: string[];
  label: string;
  platformGuides: Array<{
    clientApp: string;
    platform: string;
    steps: string[];
  }>;
  supportsQr: true;
  supportsSubscription: false;
  variants: Array<{
    addressMode: 'domain' | 'ip';
    configText: string;
    downloadFileName: string;
    endpointHost: string;
    endpointPort: number;
    label: string;
    qrText: string;
  }>;
};

type WireguardDumpPeer = {
  endpoint: string;
  latestHandshakeAt: Date | null;
  publicKey: string;
  transferRxBytes: bigint;
  transferTxBytes: bigint;
};

const LEGACY_BACKFILL_SETTING_KEY = 'wireguardLegacyBackfillCompletedAt';

@Injectable()
export class WireguardService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WireguardService.name);
  private readonly runtimeSyncIntervalMs: number;
  private readonly isEnabled: boolean;
  private runtimeInterval: NodeJS.Timeout | null = null;
  private renderPromise: Promise<void> | null = null;
  private lastConfigSyncAt: Date | null = null;
  private lastRuntimeSyncAt: Date | null = null;
  private lastRuntimePeerCount = 0;

  constructor(
    private readonly configService: ConfigService<AppEnv, true>,
    private readonly prisma: PrismaService,
  ) {
    this.isEnabled = this.configService.get('WIREGUARD_ENABLED', { infer: true });
    this.runtimeSyncIntervalMs = this.configService.get('WIREGUARD_RUNTIME_SYNC_INTERVAL_MS', {
      infer: true,
    });
  }

  private getRequiredStringConfig<K extends keyof AppEnv>(key: K) {
    const value = this.configService.get(key, { infer: true });

    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new Error(`${String(key)} is required when WireGuard is enabled.`);
    }

    return value;
  }

  onModuleInit(): void {
    if (!this.isFeatureReady() || this.configService.get('NODE_ENV', { infer: true }) === 'test') {
      return;
    }

    setTimeout(() => {
      void this.runBackgroundTask('bootstrap', async () => {
        await this.backfillLegacyClientsIfNeeded();
        await this.syncAllClients('bootstrap');
        await this.syncRuntimeDump('bootstrap');
      });
    }, 5_000).unref();

    this.runtimeInterval = setInterval(() => {
      void this.runBackgroundTask('runtime interval', async () => {
        await this.syncRuntimeDump('interval');
      });
    }, this.runtimeSyncIntervalMs);
    this.runtimeInterval.unref();
  }

  onModuleDestroy(): void {
    if (this.runtimeInterval) {
      clearInterval(this.runtimeInterval);
    }
  }

  async syncClient(
    client: Pick<
      Client,
      'emailTag' | 'expiresAt' | 'id' | 'isTrafficUnlimited' | 'status' | 'wireguardEnabled'
    >,
  ) {
    if (!this.isFeatureReady()) {
      return;
    }

    if (client.wireguardEnabled) {
      await this.ensurePeerForClientId(client.id);
    }

    await this.renderConfigForCurrentClients('client-sync');
  }

  async syncAllClients(reason = 'manual') {
    if (!this.isFeatureReady()) {
      return;
    }

    const enabledClients = await this.prisma.client.findMany({
      where: {
        wireguardEnabled: true,
      },
      select: {
        id: true,
      },
    });

    if (enabledClients.length > 0) {
      await this.ensurePeersForClientIds(enabledClients.map((client) => client.id));
    }

    await this.renderConfigForCurrentClients(reason);
  }

  async getClientBundle(
    client: Pick<Client, 'displayName' | 'id' | 'status' | 'wireguardEnabled'>,
  ): Promise<WireguardClientBundle | null> {
    if (!this.isFeatureReady() || !client.wireguardEnabled) {
      return null;
    }

    const peer = await this.ensurePeerForClientId(client.id);

    if (!peer) {
      return null;
    }

    const variants = this.resolveEndpointVariants();
    const defaultVariant = variants[0]?.addressMode ?? 'domain';

    return {
      defaultVariant,
      enabled: client.wireguardEnabled,
      id: 'wireguard',
      instructions: [
        'Импортируйте WireGuard-конфиг в официальный клиент WireGuard или совместимое приложение.',
        'Для телефонов удобнее использовать QR-код, для desktop-клиентов — .conf файл.',
        'Если доменный endpoint недоступен, используйте IP-вариант без изменения ключей и адреса peer.',
      ],
      label: 'WireGuard',
      platformGuides: [
        {
          clientApp: 'WireGuard',
          platform: 'Windows',
          steps: [
            'Откройте WireGuard и создайте новый туннель из файла конфигурации.',
            'Выберите domain или IP вариант и сохраните туннель.',
            'Активируйте туннель и проверьте, что интернет идёт через VPN.',
          ],
        },
        {
          clientApp: 'WireGuard',
          platform: 'macOS',
          steps: [
            'Импортируйте .conf файл в WireGuard для macOS.',
            'Если нужен быстрый fallback, используйте конфиг с IP endpoint.',
            'Подключите туннель и убедитесь, что маршрут активировался.',
          ],
        },
        {
          clientApp: 'WireGuard',
          platform: 'Android',
          steps: [
            'Отсканируйте QR-код или импортируйте .conf файл.',
            'Для мобильного интернета обычно лучше оставить Keepalive включённым.',
            'После импорта включите туннель одним тапом.',
          ],
        },
        {
          clientApp: 'WireGuard',
          platform: 'iPhone/iPad',
          steps: [
            'Добавьте туннель через QR-код или импорт файла.',
            'Разрешите приложению создать VPN-конфигурацию.',
            'Подключитесь к туннелю и проверьте доступ к интернету.',
          ],
        },
      ],
      supportsQr: true,
      supportsSubscription: false,
      variants: variants.map((variant) => ({
        addressMode: variant.addressMode,
        configText: this.buildClientConfigText({
          clientDisplayName: client.displayName,
          endpointHost: variant.host,
          endpointPort: this.configService.get('WIREGUARD_PORT', { infer: true }),
          peer,
        }),
        downloadFileName: `${sanitizeFileName(client.displayName)}-wireguard-${variant.addressMode}.conf`,
        endpointHost: variant.host,
        endpointPort: this.configService.get('WIREGUARD_PORT', { infer: true }),
        label: variant.label,
        qrText: this.buildClientConfigText({
          clientDisplayName: client.displayName,
          endpointHost: variant.host,
          endpointPort: this.configService.get('WIREGUARD_PORT', { infer: true }),
          peer,
        }),
      })),
    };
  }

  async getRuntimeSummary() {
    if (!this.isFeatureReady()) {
      return {
        details: 'WireGuard is disabled in the current environment.',
        lastConfigSyncAt: this.lastConfigSyncAt?.toISOString() ?? null,
        lastRuntimeSyncAt: this.lastRuntimeSyncAt?.toISOString() ?? null,
        onlinePeers: 0,
        status: 'disabled',
      };
    }

    try {
      const dumpFile = this.configService.get('WIREGUARD_RUNTIME_DUMP_PATH', { infer: true });
      const info = await stat(dumpFile);
      const freshnessMs = Date.now() - info.mtime.getTime();
      const status = freshnessMs <= this.runtimeSyncIntervalMs * 2 ? 'healthy' : 'degraded';

      return {
        details:
          status === 'healthy'
            ? `Runtime dump is fresh, peers online: ${this.lastRuntimePeerCount}.`
            : 'Runtime dump is stale. Check the WireGuard container and dump writer.',
        lastConfigSyncAt: this.lastConfigSyncAt?.toISOString() ?? null,
        lastRuntimeSyncAt: this.lastRuntimeSyncAt?.toISOString() ?? null,
        onlinePeers: this.lastRuntimePeerCount,
        status,
      };
    } catch (error) {
      return {
        details: error instanceof Error ? error.message : 'WireGuard runtime dump is not readable.',
        lastConfigSyncAt: this.lastConfigSyncAt?.toISOString() ?? null,
        lastRuntimeSyncAt: this.lastRuntimeSyncAt?.toISOString() ?? null,
        onlinePeers: 0,
        status: 'down',
      };
    }
  }

  private async backfillLegacyClientsIfNeeded() {
    if (!this.configService.get('WIREGUARD_AUTO_ENABLE_LEGACY_CLIENTS', { infer: true })) {
      return;
    }

    const existingSetting = await this.prisma.systemSetting.findUnique({
      where: {
        key: LEGACY_BACKFILL_SETTING_KEY,
      },
    });

    if (existingSetting) {
      return;
    }

    const clients = await this.prisma.client.findMany({
      select: {
        id: true,
      },
    });

    if (clients.length > 0) {
      await this.prisma.client.updateMany({
        data: {
          wireguardEnabled: true,
        },
        where: {
          wireguardEnabled: false,
        },
      });
      await this.ensurePeersForClientIds(clients.map((client) => client.id));
    }

    await this.prisma.systemSetting.upsert({
      where: {
        key: LEGACY_BACKFILL_SETTING_KEY,
      },
      create: {
        key: LEGACY_BACKFILL_SETTING_KEY,
        value: {
          completedAt: new Date().toISOString(),
          enabledClientCount: clients.length,
        },
      },
      update: {
        value: {
          completedAt: new Date().toISOString(),
          enabledClientCount: clients.length,
        },
      },
    });
  }

  private async ensurePeersForClientIds(clientIds: string[]) {
    for (const clientId of clientIds) {
      await this.ensurePeerForClientId(clientId);
    }
  }

  private async ensurePeerForClientId(clientId: string): Promise<WireguardPeer | null> {
    const existing = await this.prisma.wireguardPeer.findUnique({
      where: {
        clientId,
      },
    });

    if (existing) {
      return existing;
    }

    const [client, peers] = await Promise.all([
      this.prisma.client.findUnique({
        where: {
          id: clientId,
        },
        select: {
          id: true,
          wireguardEnabled: true,
        },
      }),
      this.prisma.wireguardPeer.findMany({
        select: {
          assignedIpv4: true,
        },
      }),
    ]);

    if (!client) {
      return null;
    }

    const assignedIpv4 = allocateWireguardPeerIpv4(
      this.configService.get('WIREGUARD_SERVER_ADDRESS_CIDR', { infer: true }),
      peers.map((peer) => peer.assignedIpv4),
    );
    const keyPair = await generateWireguardKeyPair();
    const presharedKey = generateWireguardPresharedKey();
    const passphrase = this.getRequiredStringConfig('WIREGUARD_CONFIG_ENCRYPTION_SECRET');

    return this.prisma.wireguardPeer.create({
      data: {
        assignedIpv4,
        clientId: client.id,
        presharedKeyEnc: encryptWireguardSecret(presharedKey, passphrase),
        privateKeyEnc: encryptWireguardSecret(keyPair.privateKey, passphrase),
        publicKey: keyPair.publicKey,
      },
    });
  }

  private async renderConfigForCurrentClients(reason: string) {
    if (this.renderPromise) {
      return this.renderPromise;
    }

    this.renderPromise = this.performRenderConfig(reason).finally(() => {
      this.renderPromise = null;
    });

    return this.renderPromise;
  }

  private async performRenderConfig(reason: string) {
    const clients = await this.prisma.client.findMany({
      where: {
        wireguardEnabled: true,
      },
      include: {
        wireguardPeer: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    for (const client of clients) {
      if (!client.wireguardPeer) {
        await this.ensurePeerForClientId(client.id);
      }
    }

    const refreshedClients = await this.prisma.client.findMany({
      where: {
        wireguardEnabled: true,
      },
      include: {
        wireguardPeer: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    const activePeers = refreshedClients
      .filter(
        (client) =>
          client.wireguardPeer &&
          resolveEffectiveClientStatus(client) === ClientStatus.ACTIVE &&
          client.wireguardEnabled,
      )
      .map((client) => client.wireguardPeer as WireguardPeer);

    const config = this.buildServerConfig(activePeers);
    const configPath = this.configService.get('WIREGUARD_CONFIG_PATH', { infer: true });

    await mkdir(dirname(configPath), { recursive: true });
    await writeFile(configPath, config, 'utf8');

    this.lastConfigSyncAt = new Date();
    this.logger.log(`Rendered WireGuard config (${activePeers.length} peers, reason: ${reason}).`);
  }

  private buildServerConfig(peers: WireguardPeer[]) {
    const interfaceName = this.configService.get('WIREGUARD_INTERFACE', { infer: true });
    const serverAddressCidr = this.configService.get('WIREGUARD_SERVER_ADDRESS_CIDR', {
      infer: true,
    });
    const serverPrivateKey = this.getRequiredStringConfig('WIREGUARD_SERVER_PRIVATE_KEY');
    const listenPort = this.configService.get('WIREGUARD_PORT', { infer: true });
    const mtu = this.configService.get('WIREGUARD_MTU', { infer: true });
    const egressInterface = this.configService.get('WIREGUARD_EGRESS_INTERFACE', {
      infer: true,
    });
    const passphrase = this.getRequiredStringConfig('WIREGUARD_CONFIG_ENCRYPTION_SECRET');

    const lines = [
      '[Interface]',
      `Address = ${serverAddressCidr}`,
      `ListenPort = ${listenPort}`,
      `PrivateKey = ${serverPrivateKey}`,
      `MTU = ${mtu}`,
      'SaveConfig = false',
      `PostUp = iptables -A FORWARD -i ${interfaceName} -j ACCEPT; iptables -A FORWARD -o ${interfaceName} -j ACCEPT; iptables -t nat -A POSTROUTING -o ${egressInterface} -j MASQUERADE`,
      `PostDown = iptables -D FORWARD -i ${interfaceName} -j ACCEPT; iptables -D FORWARD -o ${interfaceName} -j ACCEPT; iptables -t nat -D POSTROUTING -o ${egressInterface} -j MASQUERADE`,
      '',
    ];

    for (const peer of peers) {
      lines.push('[Peer]');
      lines.push(`PublicKey = ${peer.publicKey}`);

      if (peer.presharedKeyEnc) {
        lines.push(
          `PresharedKey = ${decryptWireguardSecret(peer.presharedKeyEnc, passphrase)}`,
        );
      }

      lines.push(`AllowedIPs = ${peer.assignedIpv4}/32`);
      lines.push('');
    }

    return `${lines.join('\n').trim()}\n`;
  }

  private buildClientConfigText(input: {
    clientDisplayName: string;
    endpointHost: string;
    endpointPort: number;
    peer: Pick<WireguardPeer, 'assignedIpv4' | 'privateKeyEnc' | 'presharedKeyEnc'>;
  }) {
    const passphrase = this.getRequiredStringConfig('WIREGUARD_CONFIG_ENCRYPTION_SECRET');
    const privateKey = decryptWireguardSecret(input.peer.privateKeyEnc, passphrase);
    const serverPublicKey = this.getRequiredStringConfig('WIREGUARD_SERVER_PUBLIC_KEY');
    const dns = this.configService.get('WIREGUARD_CLIENT_DNS', { infer: true });
    const allowedIps = this.configService.get('WIREGUARD_ALLOWED_IPS', { infer: true });
    const keepalive = this.configService.get('WIREGUARD_PERSISTENT_KEEPALIVE', { infer: true });
    const mtu = this.configService.get('WIREGUARD_MTU', { infer: true });
    const presharedKey = input.peer.presharedKeyEnc
      ? decryptWireguardSecret(input.peer.presharedKeyEnc, passphrase)
      : null;

    const lines = [
      `# ${input.clientDisplayName}`,
      '[Interface]',
      `PrivateKey = ${privateKey}`,
      `Address = ${input.peer.assignedIpv4}/32`,
      `DNS = ${dns}`,
      `MTU = ${mtu}`,
      '',
      '[Peer]',
      `PublicKey = ${serverPublicKey}`,
    ];

    if (presharedKey) {
      lines.push(`PresharedKey = ${presharedKey}`);
    }

    lines.push(`AllowedIPs = ${allowedIps}`);
    lines.push(`Endpoint = ${input.endpointHost}:${input.endpointPort}`);
    lines.push(`PersistentKeepalive = ${keepalive}`);

    return `${lines.join('\n')}\n`;
  }

  private resolveEndpointVariants() {
    const port = this.configService.get('WIREGUARD_PORT', { infer: true });
    const panelUrlHost = new URL(this.configService.get('PANEL_PUBLIC_URL', { infer: true })).hostname;
    const preferredHost =
      this.configService.get('WIREGUARD_PUBLIC_HOST', { infer: true })?.trim() ||
      this.configService.get('XRAY_PUBLIC_HOST', { infer: true })?.trim() ||
      panelUrlHost;
    const publicIp =
      this.configService.get('SERVER_PUBLIC_IP', { infer: true })?.trim() ||
      (isIpv4Address(panelUrlHost) ? panelUrlHost : '');
    const variants: Array<{ addressMode: 'domain' | 'ip'; host: string; label: string }> = [];

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

  private async syncRuntimeDump(reason: string) {
    if (!this.isFeatureReady()) {
      return;
    }

    try {
      const dumpContent = await readFile(
        this.configService.get('WIREGUARD_RUNTIME_DUMP_PATH', { infer: true }),
        'utf8',
      );
      const peers = parseWireguardDump(dumpContent);

      if (peers.length === 0) {
        this.lastRuntimePeerCount = 0;
        this.lastRuntimeSyncAt = new Date();
        return;
      }

      const profiles = await this.prisma.wireguardPeer.findMany({
        where: {
          publicKey: {
            in: peers.map((peer) => peer.publicKey),
          },
        },
        select: {
          clientId: true,
          id: true,
          observedRxBytes: true,
          observedTxBytes: true,
          publicKey: true,
        },
      });
      const profileByPublicKey = new Map(profiles.map((profile) => [profile.publicKey, profile]));
      let onlinePeerCount = 0;

      for (const peer of peers) {
        const profile = profileByPublicKey.get(peer.publicKey);

        if (!profile) {
          continue;
        }

        const isOnline =
          peer.latestHandshakeAt !== null &&
          Date.now() - peer.latestHandshakeAt.getTime() <= this.runtimeSyncIntervalMs * 2;

        if (isOnline) {
          onlinePeerCount += 1;
        }

        await this.prisma.wireguardPeer.update({
          where: {
            id: profile.id,
          },
          data: {
            lastHandshakeAt: peer.latestHandshakeAt,
            lastObservedAt: new Date(),
            observedRxBytes: peer.transferRxBytes,
            observedTxBytes: peer.transferTxBytes,
          },
        });

        if (peer.latestHandshakeAt) {
          await this.prisma.client.update({
            where: {
              id: profile.clientId,
            },
            data: {
              lastActivatedAt: isOnline ? peer.latestHandshakeAt : undefined,
              lastSeenAt: peer.latestHandshakeAt,
            },
          });
        }
      }

      this.lastRuntimePeerCount = onlinePeerCount;
      this.lastRuntimeSyncAt = new Date();
      this.logger.debug(`WireGuard runtime sync complete (${reason}, ${onlinePeerCount} online peers).`);
    } catch (error) {
      this.logger.warn(
        `WireGuard runtime sync failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }

  private isFeatureReady() {
    return this.isEnabled;
  }

  private runBackgroundTask(label: string, task: () => Promise<void>) {
    return task().catch((error: unknown) => {
      this.logger.warn(
        `WireGuard ${label} failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    });
  }
}

function parseWireguardDump(content: string): WireguardDumpPeer[] {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length <= 1) {
    return [];
  }

  return lines.slice(1).flatMap((line) => {
    const columns = line.split('\t');

    if (columns.length < 8) {
      return [];
    }

    const publicKey = columns[0] ?? '';
    const endpoint = columns[2] ?? '';
    const latestHandshakeAt = parseUnixSeconds(columns[4]);
    const transferRxBytes = BigInt(columns[5] ?? '0');
    const transferTxBytes = BigInt(columns[6] ?? '0');

    if (!publicKey) {
      return [];
    }

    return [
      {
        endpoint,
        latestHandshakeAt,
        publicKey,
        transferRxBytes,
        transferTxBytes,
      },
    ];
  });
}

function parseUnixSeconds(value: string | undefined) {
  const seconds = Number(value ?? '0');

  if (!Number.isFinite(seconds) || seconds <= 0) {
    return null;
  }

  return new Date(seconds * 1_000);
}

function sanitizeFileName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'client';
}

function isIpv4Address(value: string) {
  return /^([0-9]{1,3}\.){3}[0-9]{1,3}$/.test(value);
}
