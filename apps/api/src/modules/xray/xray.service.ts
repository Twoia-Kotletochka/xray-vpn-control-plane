import { isAbsolute, join } from 'node:path';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditAction, type Client, ClientStatus, TransportProfile } from '@prisma/client';
import protobuf from 'protobufjs';

import type { AppEnv } from '../../common/config/env.schema';
import { PrismaService } from '../../common/database/prisma.service';
import { resolveEffectiveClientStatus } from '../clients/client-presenter';
import {
  buildUserOnlineStatName,
  countOnlineIpEntries,
  describeClientLimitBreaches,
  evaluateClientLimitBreaches,
} from './xray-limit-enforcement.util';
import {
  buildTrafficDeltaMap,
  resolveObservedActiveConnections,
  startOfUtcDay,
} from './xray.helpers';

@Injectable()
export class XrayService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(XrayService.name);
  private readonly protoRootDir = join(process.cwd(), 'proto', 'xray');
  private readonly usageSnapshotIntervalMs: number;
  private readonly controlSyncIntervalMs: number;
  private readonly apiTarget: string;

  private grpcBundle:
    | {
        handlerClient: grpc.Client;
        protobufRoot: protobuf.Root;
        statsClient: grpc.Client;
      }
    | undefined;
  private lastConfigSyncAt: Date | null = null;
  private lastStatsSnapshotAt: Date | null = null;
  private lastSyncReason: string | null = null;
  private lastKnownXrayUptimeSeconds: number | null = null;
  private runtimeProvisioned = false;
  private statsInterval: NodeJS.Timeout | null = null;
  private syncInterval: NodeJS.Timeout | null = null;
  private inflightSnapshot: Promise<{
    capturedAt: Date;
    deltas: Map<string, { incomingBytes: bigint; outgoingBytes: bigint; totalBytes: bigint }>;
    onlineUsers: string[];
  }> | null = null;
  private inflightSync: Promise<void> | null = null;

  constructor(
    private readonly configService: ConfigService<AppEnv, true>,
    private readonly prisma: PrismaService,
  ) {
    this.apiTarget = this.configService.get('XRAY_API_TARGET', { infer: true });
    this.usageSnapshotIntervalMs = this.configService.get('XRAY_USAGE_SNAPSHOT_INTERVAL_MS', {
      infer: true,
    });
    this.controlSyncIntervalMs = this.configService.get('XRAY_CONTROL_SYNC_INTERVAL_MS', {
      infer: true,
    });
  }

  onModuleInit(): void {
    if (this.configService.get('NODE_ENV', { infer: true }) === 'test') {
      return;
    }

    this.statsInterval = setInterval(() => {
      void this.captureUsageSnapshot({
        force: true,
        reason: 'interval',
      });
    }, this.usageSnapshotIntervalMs);
    this.statsInterval.unref();

    this.syncInterval = setInterval(() => {
      void this.ensureRuntimeProvisioned('interval');
    }, this.controlSyncIntervalMs);
    this.syncInterval.unref();

    setTimeout(() => {
      void this.ensureRuntimeProvisioned('bootstrap');
    }, 3_000).unref();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.statsInterval) {
      clearInterval(this.statsInterval);
    }

    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }

    if (this.grpcBundle) {
      await Promise.allSettled([
        this.closeGrpcClient(this.grpcBundle.handlerClient),
        this.closeGrpcClient(this.grpcBundle.statsClient),
      ]);
    }
  }

  async getProfiles() {
    const runtime = await this.getRuntimeSummary();

    return {
      items: [
        {
          id: this.configService.get('XRAY_INBOUND_TAG', { infer: true }),
          transport: 'vless-reality-tcp',
          listenPort: this.configService.get('XRAY_VLESS_PORT', { infer: true }),
          apiTarget: this.apiTarget,
          onlineUsers: runtime.onlineUsers,
          status: runtime.status,
        },
      ],
      runtime,
    };
  }

  async syncClient(
    client: Pick<
      Client,
      | 'emailTag'
      | 'expiresAt'
      | 'id'
      | 'isTrafficUnlimited'
      | 'status'
      | 'trafficLimitBytes'
      | 'transportProfile'
      | 'uuid'
    >,
  ) {
    if (this.configService.get('NODE_ENV', { infer: true }) === 'test') {
      return;
    }

    if (resolveEffectiveClientStatus(client) !== ClientStatus.ACTIVE) {
      await this.removeUser(client.emailTag);
      return;
    }

    if (client.transportProfile !== TransportProfile.VLESS_REALITY_TCP) {
      throw new Error('Only VLESS + REALITY transport profile is supported in the current MVP.');
    }

    await this.addOrReplaceUser(client);
    this.runtimeProvisioned = true;
    this.lastConfigSyncAt = new Date();
    this.lastSyncReason = 'client-sync';
  }

  async syncAllClients(reason = 'manual'): Promise<void> {
    if (this.configService.get('NODE_ENV', { infer: true }) === 'test') {
      return;
    }

    if (this.inflightSync) {
      return this.inflightSync;
    }

    this.inflightSync = this.performSyncAllClients(reason).finally(() => {
      this.inflightSync = null;
    });

    return this.inflightSync;
  }

  async captureUsageSnapshot(options?: { force?: boolean; reason?: string }) {
    if (
      !options?.force &&
      this.lastStatsSnapshotAt &&
      Date.now() - this.lastStatsSnapshotAt.getTime() < this.usageSnapshotIntervalMs
    ) {
      return null;
    }

    if (this.inflightSnapshot) {
      return this.inflightSnapshot;
    }

    this.inflightSnapshot = this.performCaptureUsageSnapshot(options?.reason ?? 'manual').finally(
      () => {
        this.inflightSnapshot = null;
      },
    );

    return this.inflightSnapshot;
  }

  async getRuntimeSummary() {
    const startedAt = Date.now();

    try {
      const [sysStats, onlineUsersResponse] = await Promise.all([
        this.callStatsService<{ Uptime?: number }>('GetSysStats', {}),
        this.callStatsService<{ users?: string[] }>('GetAllOnlineUsers', {}),
      ]);
      const uptimeSeconds =
        typeof sysStats.Uptime === 'number' ? sysStats.Uptime : this.lastKnownXrayUptimeSeconds;

      return {
        apiTarget: this.apiTarget,
        lastConfigSyncAt: this.lastConfigSyncAt?.toISOString() ?? null,
        lastStatsSnapshotAt: this.lastStatsSnapshotAt?.toISOString() ?? null,
        lastSyncReason: this.lastSyncReason,
        latencyMs: Date.now() - startedAt,
        onlineUsers: onlineUsersResponse.users?.length ?? 0,
        status: 'healthy',
        uptimeSeconds,
      };
    } catch (error) {
      this.runtimeProvisioned = false;
      this.logger.warn(`Xray control API is not reachable: ${this.describeGrpcError(error)}`);

      return {
        apiTarget: this.apiTarget,
        lastConfigSyncAt: this.lastConfigSyncAt?.toISOString() ?? null,
        lastStatsSnapshotAt: this.lastStatsSnapshotAt?.toISOString() ?? null,
        lastSyncReason: this.lastSyncReason,
        latencyMs: Date.now() - startedAt,
        onlineUsers: 0,
        status: 'down',
        uptimeSeconds: this.lastKnownXrayUptimeSeconds,
      };
    }
  }

  private async performSyncAllClients(reason: string) {
    const clients = await this.prisma.client.findMany({
      select: {
        emailTag: true,
        expiresAt: true,
        id: true,
        isTrafficUnlimited: true,
        status: true,
        trafficLimitBytes: true,
        transportProfile: true,
        uuid: true,
      },
    });

    for (const client of clients) {
      if (resolveEffectiveClientStatus(client) === ClientStatus.ACTIVE) {
        await this.addOrReplaceUser(client);
        continue;
      }

      await this.removeUser(client.emailTag);
    }

    this.runtimeProvisioned = true;
    this.lastConfigSyncAt = new Date();
    this.lastSyncReason = reason;
  }

  private async ensureRuntimeProvisioned(reason: string) {
    const previousUptimeSeconds = this.lastKnownXrayUptimeSeconds;
    const summary = await this.getRuntimeSummary();

    if (summary.status !== 'healthy') {
      return;
    }

    if (typeof summary.uptimeSeconds === 'number') {
      this.lastKnownXrayUptimeSeconds = summary.uptimeSeconds;
    }

    if (!this.runtimeProvisioned) {
      await this.syncAllClients(reason);
      return;
    }

    if (
      typeof summary.uptimeSeconds === 'number' &&
      previousUptimeSeconds !== null &&
      summary.uptimeSeconds < previousUptimeSeconds
    ) {
      await this.syncAllClients('xray-restart-detected');
    }
  }

  private async performCaptureUsageSnapshot(reason: string) {
    try {
      const [queryResponse, onlineUsersResponse] = await Promise.all([
        this.callStatsService<{ stat?: Array<{ name: string; value: string | number }> }>(
          'QueryStats',
          {
            pattern: 'user>>>',
            reset: true,
          },
        ),
        this.callStatsService<{ users?: string[] }>('GetAllOnlineUsers', {}),
      ]);

      const capturedAt = new Date();
      const bucketDate = startOfUtcDay(capturedAt);
      const onlineUsers = Array.from(new Set(onlineUsersResponse.users ?? []));
      const onlineUserSet = new Set(onlineUsers);
      const onlineIpCountByEmailTag = await this.loadOnlineIpCountMap(onlineUsers);
      const deltas = buildTrafficDeltaMap(queryResponse.stat ?? []);
      const emailTags = Array.from(new Set([...deltas.keys(), ...onlineUsers]));
      const clients =
        emailTags.length === 0
          ? []
          : await this.prisma.client.findMany({
              where: {
                emailTag: {
                  in: emailTags,
                },
              },
              select: {
                deviceLimit: true,
                displayName: true,
                emailTag: true,
                id: true,
                ipLimit: true,
                status: true,
              },
            });

      await this.prisma.$transaction(async (tx) => {
        await tx.dailyClientUsage.updateMany({
          where: {
            bucketDate,
          },
          data: {
            activeConnections: 0,
          },
        });

        const latestConnectionSnapshots = await tx.dailyClientUsage.findMany({
          distinct: ['clientId'],
          orderBy: [{ bucketDate: 'desc' }, { updatedAt: 'desc' }],
          select: {
            activeConnections: true,
            clientId: true,
          },
        });
        const currentClientIds = new Set(clients.map((client) => client.id));

        for (const snapshot of latestConnectionSnapshots) {
          if (snapshot.activeConnections === 0 || currentClientIds.has(snapshot.clientId)) {
            continue;
          }

          await tx.dailyClientUsage.upsert({
            where: {
              clientId_bucketDate: {
                bucketDate,
                clientId: snapshot.clientId,
              },
            },
            update: {
              activeConnections: 0,
            },
            create: {
              activeConnections: 0,
              bucketDate,
              clientId: snapshot.clientId,
              incomingBytes: 0n,
              outgoingBytes: 0n,
              totalBytes: 0n,
            },
          });
        }

        for (const client of clients) {
          const delta = deltas.get(client.emailTag) ?? {
            incomingBytes: 0n,
            outgoingBytes: 0n,
            totalBytes: 0n,
          };
          const activeConnections = resolveObservedActiveConnections({
            emailTag: client.emailTag,
            onlineIpCountByEmailTag,
            onlineUsers: onlineUserSet,
          });

          if (delta.totalBytes === 0n && activeConnections === 0) {
            continue;
          }

          await tx.dailyClientUsage.upsert({
            where: {
              clientId_bucketDate: {
                bucketDate,
                clientId: client.id,
              },
            },
            update: {
              activeConnections,
              incomingBytes: {
                increment: delta.incomingBytes,
              },
              outgoingBytes: {
                increment: delta.outgoingBytes,
              },
              totalBytes: {
                increment: delta.totalBytes,
              },
            },
            create: {
              activeConnections,
              bucketDate,
              clientId: client.id,
              incomingBytes: delta.incomingBytes,
              outgoingBytes: delta.outgoingBytes,
              totalBytes: delta.totalBytes,
            },
          });

          await tx.client.update({
            where: {
              id: client.id,
            },
            data: {
              lastActivatedAt: activeConnections > 0 ? capturedAt : undefined,
              lastSeenAt: capturedAt,
            },
          });
        }
      });

      if (emailTags.length > 0) {
        await this.enforceTrafficQuotas(emailTags);
        await this.enforceClientAccessLimits(clients, onlineIpCountByEmailTag);
      }

      this.lastStatsSnapshotAt = capturedAt;
      this.lastSyncReason = reason;
      this.runtimeProvisioned = true;

      return {
        capturedAt,
        deltas,
        onlineUsers,
      };
    } catch (error) {
      this.runtimeProvisioned = false;
      this.logger.warn(`Usage snapshot failed: ${this.describeGrpcError(error)}`);
      throw error;
    }
  }

  private async enforceTrafficQuotas(emailTags: string[]) {
    if (emailTags.length === 0) {
      return;
    }

    const clients = await this.prisma.client.findMany({
      where: {
        emailTag: {
          in: emailTags,
        },
        isTrafficUnlimited: false,
        trafficLimitBytes: {
          not: null,
        },
      },
      select: {
        emailTag: true,
        id: true,
        trafficLimitBytes: true,
      },
    });

    if (clients.length === 0) {
      return;
    }

    const usageRows = await this.prisma.dailyClientUsage.groupBy({
      by: ['clientId'],
      where: {
        clientId: {
          in: clients.map((client) => client.id),
        },
      },
      _sum: {
        totalBytes: true,
      },
    });
    const totalByClientId = new Map(
      usageRows.map((row) => [row.clientId, row._sum.totalBytes ?? 0n] as const),
    );

    for (const client of clients) {
      const totalBytes = totalByClientId.get(client.id) ?? 0n;

      if (client.trafficLimitBytes !== null && totalBytes >= client.trafficLimitBytes) {
        await this.prisma.client.update({
          where: {
            id: client.id,
          },
          data: {
            status: ClientStatus.BLOCKED,
          },
        });
        await this.removeUser(client.emailTag);
      }
    }
  }

  private async enforceClientAccessLimits(
    clients: Array<{
      deviceLimit: number | null;
      displayName: string;
      emailTag: string;
      id: string;
      ipLimit: number | null;
      status: ClientStatus;
    }>,
    onlineIpCountByEmailTag: Map<string, number>,
  ) {
    for (const client of clients) {
      const actualOnlineIps = onlineIpCountByEmailTag.get(client.emailTag) ?? 0;
      const breaches = evaluateClientLimitBreaches({
        actualOnlineIps,
        deviceLimit: client.deviceLimit,
        ipLimit: client.ipLimit,
      });

      if (breaches.length === 0) {
        continue;
      }

      if (client.status === ClientStatus.ACTIVE) {
        const blockSummary = `Client ${client.displayName} auto-blocked after ${actualOnlineIps} concurrent online endpoints exceeded ${describeClientLimitBreaches(
          breaches,
        )}.`;
        const updateResult = await this.prisma.client.updateMany({
          where: {
            id: client.id,
            status: ClientStatus.ACTIVE,
          },
          data: {
            status: ClientStatus.BLOCKED,
          },
        });

        if (updateResult.count > 0) {
          await this.prisma.auditLog.create({
            data: {
              action: AuditAction.CLIENT_UPDATED,
              entityType: 'client',
              entityId: client.id,
              summary: blockSummary,
              metadata: {
                actualOnlineIps,
                autoBlockedBy: 'runtime-limit-enforcement',
                breaches,
              },
            },
          });
        }
      }

      await this.removeUser(client.emailTag);
    }
  }

  private async addOrReplaceUser(
    client: Pick<Client, 'emailTag' | 'transportProfile' | 'uuid'>,
  ): Promise<void> {
    try {
      await this.addUser(client);
      return;
    } catch (error) {
      if (!this.isAlreadyExistsError(error)) {
        throw error;
      }
    }

    await this.removeUser(client.emailTag);
    await this.addUser(client);
  }

  private async addUser(client: Pick<Client, 'emailTag' | 'transportProfile' | 'uuid'>) {
    const bundle = this.getGrpcBundle();
    const typedMessageType = bundle.protobufRoot.lookupType('xray.common.serial.TypedMessage');
    const accountType = bundle.protobufRoot.lookupType('xray.proxy.vless.Account');
    const addUserOperationType = bundle.protobufRoot.lookupType(
      'xray.app.proxyman.command.AddUserOperation',
    );

    const accountMessage = typedMessageType.create({
      type: 'xray.proxy.vless.Account',
      value: accountType
        .encode(
          accountType.create({
            encryption: 'none',
            flow: 'xtls-rprx-vision',
            id: client.uuid,
          }),
        )
        .finish(),
    });
    const operation = addUserOperationType.create({
      user: {
        account: accountMessage,
        email: client.emailTag,
        level: 0,
      },
    });

    await this.callHandlerService('AlterInbound', {
      operation: {
        type: 'xray.app.proxyman.command.AddUserOperation',
        value: addUserOperationType.encode(operation).finish(),
      },
      tag: this.configService.get('XRAY_INBOUND_TAG', { infer: true }),
    });
  }

  private async removeUser(emailTag: string) {
    const bundle = this.getGrpcBundle();
    const removeUserOperationType = bundle.protobufRoot.lookupType(
      'xray.app.proxyman.command.RemoveUserOperation',
    );

    try {
      await this.callHandlerService('AlterInbound', {
        operation: {
          type: 'xray.app.proxyman.command.RemoveUserOperation',
          value: removeUserOperationType
            .encode(
              removeUserOperationType.create({
                email: emailTag,
              }),
            )
            .finish(),
        },
        tag: this.configService.get('XRAY_INBOUND_TAG', { infer: true }),
      });
    } catch (error) {
      if (this.isMissingUserError(error)) {
        return;
      }

      throw error;
    }
  }

  private async loadOnlineIpCountMap(emailTags: string[]) {
    if (emailTags.length === 0) {
      return new Map<string, number>();
    }

    const responses = await Promise.allSettled(
      emailTags.map(async (emailTag) => {
        const statName = buildUserOnlineStatName(emailTag);

        try {
          const response = await this.callStatsService<{
            ips?: Record<string, bigint | number | string>;
          }>('GetStatsOnlineIpList', {
            name: statName,
            reset: false,
          });

          return [emailTag, countOnlineIpEntries(response.ips)] as const;
        } catch {
          const fallbackResponse = await this.callStatsService<{
            stat?: {
              value?: number | string;
            };
          }>('GetStatsOnline', {
            name: statName,
            reset: false,
          });
          const fallbackValue = Number(fallbackResponse.stat?.value ?? 1);

          return [
            emailTag,
            Number.isFinite(fallbackValue) && fallbackValue > 0 ? Math.trunc(fallbackValue) : 0,
          ] as const;
        }
      }),
    );
    const counts = new Map<string, number>();

    responses.forEach((response, index) => {
      const emailTag = emailTags[index];

      if (!emailTag) {
        return;
      }

      if (response.status === 'fulfilled') {
        counts.set(response.value[0], response.value[1]);
        return;
      }

      counts.set(emailTag, 0);
    });

    return counts;
  }

  private getGrpcBundle() {
    if (this.grpcBundle) {
      return this.grpcBundle;
    }

    const protoFiles = [
      'app/proxyman/command/command.proto',
      'app/stats/command/command.proto',
      'proxy/vless/account.proto',
    ];
    const packageDefinition = protoLoader.loadSync(protoFiles, {
      defaults: true,
      enums: String,
      includeDirs: [this.protoRootDir],
      keepCase: false,
      longs: String,
      oneofs: true,
    });
    const descriptor = grpc.loadPackageDefinition(packageDefinition) as Record<string, unknown>;
    const xrayNamespace = descriptor.xray as Record<string, unknown>;
    const appNamespace = xrayNamespace.app as Record<string, unknown>;
    const proxymanNamespace = appNamespace.proxyman as Record<string, unknown>;
    const statsNamespace = appNamespace.stats as Record<string, unknown>;
    const proxymanCommandNamespace = proxymanNamespace.command as Record<string, unknown>;
    const statsCommandNamespace = statsNamespace.command as Record<string, unknown>;
    const HandlerService = proxymanCommandNamespace.HandlerService as grpc.ServiceClientConstructor;
    const StatsService = statsCommandNamespace.StatsService as grpc.ServiceClientConstructor;
    const protobufRoot = new protobuf.Root();

    protobufRoot.resolvePath = (_origin, target) =>
      isAbsolute(target) ? target : join(this.protoRootDir, target);
    protobufRoot.loadSync(protoFiles);
    protobufRoot.resolveAll();

    this.grpcBundle = {
      handlerClient: new HandlerService(this.apiTarget, grpc.credentials.createInsecure()),
      protobufRoot,
      statsClient: new StatsService(this.apiTarget, grpc.credentials.createInsecure()),
    };

    return this.grpcBundle;
  }

  private async callHandlerService<T>(method: string, request: unknown): Promise<T> {
    return this.callGrpcMethod<T>(this.getGrpcBundle().handlerClient, method, request);
  }

  private async callStatsService<T>(method: string, request: unknown): Promise<T> {
    return this.callGrpcMethod<T>(this.getGrpcBundle().statsClient, method, request);
  }

  private callGrpcMethod<T>(client: grpc.Client, method: string, request: unknown): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const callable = (client as unknown as Record<string, unknown>)[method];

      if (typeof callable !== 'function') {
        reject(new Error(`gRPC method ${method} is not available.`));
        return;
      }

      (
        callable as (
          this: grpc.Client,
          request: unknown,
          callback: (error: grpc.ServiceError | null, response: T) => void,
        ) => void
      ).call(client, request, (error, response) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(response);
      });
    });
  }

  private describeGrpcError(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    return 'Unknown gRPC error';
  }

  private isAlreadyExistsError(error: unknown): boolean {
    const message = this.describeGrpcError(error).toLowerCase();
    return message.includes('already exists') || message.includes('existing user');
  }

  private isMissingUserError(error: unknown): boolean {
    const message = this.describeGrpcError(error).toLowerCase();
    return message.includes('not found') || message.includes('notfound');
  }

  private closeGrpcClient(client: grpc.Client): Promise<void> {
    return new Promise((resolve) => {
      client.close();
      resolve();
    });
  }
}
