import { randomBytes, randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { type Client, ClientStatus, Prisma, type TransportProfile } from '@prisma/client';
import type { Request } from 'express';

import type { AuthenticatedAdmin } from '../../common/auth/authenticated-admin.interface';
import { PrismaService } from '../../common/database/prisma.service';
import type { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { WireguardService } from '../wireguard/wireguard.service';
import { XrayService } from '../xray/xray.service';
import {
  type ImportedClientBundle,
  type ImportedClientRecord,
  importClientsSchema,
} from './client-import-export.schema';
import {
  emptyClientUsage,
  resolveEffectiveClientStatus,
  serializeClient,
} from './client-presenter';
import type { CreateClientDto } from './dto/create-client.dto';
import type { ExtendClientDto } from './dto/extend-client.dto';
import type { UpdateClientDto } from './dto/update-client.dto';

@Injectable()
export class ClientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly xrayService: XrayService,
    private readonly wireguardService: WireguardService,
  ) {}

  async list(query: PaginationQueryDto) {
    await this.expireClients();
    await this.captureUsageSnapshotBestEffort('clients-list');

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;
    const search = query.search?.trim();
    const where: Prisma.ClientWhereInput = search
      ? {
          OR: [
            { displayName: { contains: search, mode: Prisma.QueryMode.insensitive } },
            { note: { contains: search, mode: Prisma.QueryMode.insensitive } },
            { emailTag: { contains: search, mode: Prisma.QueryMode.insensitive } },
            { uuid: { contains: search } },
          ],
        }
      : {};

    const [items, total] = await this.prisma.$transaction([
      this.prisma.client.findMany({
        where,
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: pageSize,
        include: {
          wireguardPeer: {
            select: {
              assignedIpv4: true,
              lastHandshakeAt: true,
            },
          },
        },
      }),
      this.prisma.client.count({
        where,
      }),
    ]);

    const usageMap = await this.loadUsageMap(items.map((item) => item.id));

    return {
      items: items.map((item) =>
        serializeClient(item, usageMap.get(item.id) ?? emptyClientUsage()),
      ),
      pagination: {
        page,
        pageSize,
        total,
      },
      filters: {
        search: search ?? null,
      },
    };
  }

  async getById(clientId: string) {
    await this.expireClients();
    await this.captureUsageSnapshotBestEffort('client-detail');

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

    const usageMap = await this.loadUsageMap([client.id]);
    const usageHistory = await this.prisma.dailyClientUsage.findMany({
      where: {
        clientId,
      },
      orderBy: {
        bucketDate: 'desc',
      },
      take: 30,
    });

    return {
      ...serializeClient(client, usageMap.get(client.id) ?? emptyClientUsage()),
      usageHistory: usageHistory.map((bucket) => ({
        date: bucket.bucketDate.toISOString(),
        incomingBytes: bucket.incomingBytes.toString(),
        outgoingBytes: bucket.outgoingBytes.toString(),
        totalBytes: bucket.totalBytes.toString(),
        activeConnections: bucket.activeConnections,
      })),
    };
  }

  async exportClients() {
    await this.expireClients();
    await this.captureUsageSnapshotBestEffort('clients-export', true);

    const items = await this.prisma.client.findMany({
      orderBy: {
        createdAt: 'asc',
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
    const usageMap = await this.loadUsageMap(items.map((item) => item.id));

    return {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      items: items.map((item) =>
        serializeClient(item, usageMap.get(item.id) ?? emptyClientUsage()),
      ),
    };
  }

  async importClients(payload: unknown, admin: AuthenticatedAdmin, request: Request) {
    const parsed = this.parseImportPayload(payload);
    const touchedClients: Client[] = [];
    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const item of parsed.items) {
      const outcome = await this.importSingleClient(item, parsed.overwriteExisting);

      if (outcome.status === 'skipped') {
        skipped += 1;
        continue;
      }

      touchedClients.push(outcome.client);

      if (outcome.status === 'created') {
        created += 1;
      } else {
        updated += 1;
      }
    }

    await Promise.all(touchedClients.map((client) => this.syncClientBestEffort(client)));

    await this.prisma.auditLog.create({
      data: {
        actorAdminId: admin.id,
        action: 'CLIENT_UPDATED',
        entityType: 'client-import',
        summary: `Imported ${created + updated} client records (${created} created, ${updated} updated, ${skipped} skipped).`,
        metadata: {
          created,
          overwriteExisting: parsed.overwriteExisting,
          schemaVersion: parsed.schemaVersion,
          skipped,
          updated,
        },
        ipAddress: request.ip ?? undefined,
        userAgent: request.get('user-agent') ?? undefined,
      },
    });

    return {
      created,
      overwriteExisting: parsed.overwriteExisting,
      skipped,
      synced: touchedClients.length,
      updated,
    };
  }

  async create(payload: CreateClientDto, admin: AuthenticatedAdmin, request: Request) {
    const isTrafficUnlimited = payload.isTrafficUnlimited ?? false;
    const trafficLimitBytes = this.resolveTrafficLimit(
      isTrafficUnlimited,
      payload.trafficLimitBytes,
    );
    const startsAt = payload.startsAt ? new Date(payload.startsAt) : new Date();
    const expiresAt = this.resolveExpiry(startsAt, payload.expiresAt, payload.durationDays);
    const requestedStatus = payload.status ?? ClientStatus.ACTIVE;
    const vlessEnabled = payload.vlessEnabled ?? true;
    const wireguardEnabled = payload.wireguardEnabled ?? true;
    this.assertAtLeastOneTransportEnabled(vlessEnabled, wireguardEnabled);
    const status = resolveEffectiveClientStatus({
      isTrafficUnlimited,
      status: requestedStatus,
      expiresAt,
      trafficLimitBytes,
    });

    const client = await this.prisma.$transaction(async (tx) => {
      const created = await tx.client.create({
        data: {
          uuid: payload.customUuid ?? randomUUID(),
          emailTag: this.buildEmailTag(payload.displayName),
          displayName: payload.displayName.trim(),
          note: payload.note?.trim() || null,
          tags: payload.tags ?? undefined,
          status,
          startsAt,
          expiresAt,
          durationDays: payload.durationDays,
          trafficLimitBytes,
          isTrafficUnlimited,
          deviceLimit: payload.deviceLimit,
          ipLimit: payload.ipLimit,
          vlessEnabled,
          wireguardEnabled,
          subscriptionToken: randomBytes(24).toString('base64url'),
          transportProfile: payload.transportProfile,
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

      await tx.auditLog.create({
        data: {
          actorAdminId: admin.id,
          action: 'CLIENT_CREATED',
          entityType: 'client',
          entityId: created.id,
          summary: `Client ${created.displayName} created.`,
          metadata: {
            status: created.status,
          },
          ipAddress: request.ip ?? undefined,
          userAgent: request.get('user-agent') ?? undefined,
        },
      });

      return created;
    });

    await this.syncClientBestEffort(client);
    return serializeClient(client, emptyClientUsage());
  }

  async update(
    clientId: string,
    payload: UpdateClientDto,
    admin: AuthenticatedAdmin,
    request: Request,
  ) {
    const existing = await this.requireClient(clientId);
    const startsAt =
      payload.startsAt !== undefined
        ? payload.startsAt
          ? new Date(payload.startsAt)
          : null
        : existing.startsAt;
    const expiresAt =
      payload.expiresAt !== undefined || payload.durationDays !== undefined
        ? this.resolveExpiry(startsAt ?? new Date(), payload.expiresAt, payload.durationDays)
        : existing.expiresAt;
    const requestedStatus = payload.status ?? existing.status;
    const vlessEnabled = payload.vlessEnabled ?? existing.vlessEnabled;
    const wireguardEnabled = payload.wireguardEnabled ?? existing.wireguardEnabled;
    this.assertAtLeastOneTransportEnabled(vlessEnabled, wireguardEnabled);
    const status =
      requestedStatus === ClientStatus.DISABLED || requestedStatus === ClientStatus.BLOCKED
        ? requestedStatus
        : resolveEffectiveClientStatus({
            isTrafficUnlimited: payload.isTrafficUnlimited ?? existing.isTrafficUnlimited,
            status: requestedStatus,
            expiresAt,
            trafficLimitBytes:
              payload.trafficLimitBytes !== undefined || payload.isTrafficUnlimited !== undefined
                ? this.resolveTrafficLimit(
                    payload.isTrafficUnlimited ?? existing.isTrafficUnlimited,
                    payload.trafficLimitBytes,
                  )
                : existing.trafficLimitBytes,
          });
    const isTrafficUnlimited = payload.isTrafficUnlimited ?? existing.isTrafficUnlimited;

    const client = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.client.update({
        where: {
          id: clientId,
        },
        data: {
          displayName: payload.displayName?.trim(),
          note: payload.note !== undefined ? payload.note.trim() || null : undefined,
          tags: payload.tags ?? undefined,
          status,
          startsAt,
          expiresAt,
          durationDays: payload.durationDays,
          trafficLimitBytes:
            payload.trafficLimitBytes !== undefined || payload.isTrafficUnlimited !== undefined
              ? this.resolveTrafficLimit(isTrafficUnlimited, payload.trafficLimitBytes)
              : undefined,
          isTrafficUnlimited,
          deviceLimit: payload.deviceLimit,
          ipLimit: payload.ipLimit,
          vlessEnabled,
          wireguardEnabled,
          transportProfile: payload.transportProfile,
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

      await tx.auditLog.create({
        data: {
          actorAdminId: admin.id,
          action: updated.status === ClientStatus.DISABLED ? 'CLIENT_DISABLED' : 'CLIENT_UPDATED',
          entityType: 'client',
          entityId: updated.id,
          summary: `Client ${updated.displayName} updated.`,
          metadata: {
            status: updated.status,
          },
          ipAddress: request.ip ?? undefined,
          userAgent: request.get('user-agent') ?? undefined,
        },
      });

      return updated;
    });

    await this.syncClientBestEffort(client);
    const usageMap = await this.loadUsageMap([client.id]);
    return serializeClient(client, usageMap.get(client.id) ?? emptyClientUsage());
  }

  async extend(
    clientId: string,
    payload: ExtendClientDto,
    admin: AuthenticatedAdmin,
    request: Request,
  ) {
    const existing = await this.requireClient(clientId);
    const baseDate = existing.expiresAt ?? new Date();
    const expiresAt = payload.expiresAt
      ? new Date(payload.expiresAt)
      : payload.days
        ? new Date(baseDate.getTime() + payload.days * 86_400_000)
        : existing.expiresAt;

    if (!expiresAt) {
      return this.getById(clientId);
    }

    const client = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.client.update({
        where: {
          id: clientId,
        },
        data: {
          expiresAt,
          status: ClientStatus.ACTIVE,
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

      await tx.auditLog.create({
        data: {
          actorAdminId: admin.id,
          action: 'CLIENT_EXTENDED',
          entityType: 'client',
          entityId: updated.id,
          summary: `Client ${updated.displayName} extended.`,
          metadata: {
            expiresAt: expiresAt.toISOString(),
          },
          ipAddress: request.ip ?? undefined,
          userAgent: request.get('user-agent') ?? undefined,
        },
      });

      return updated;
    });

    await this.syncClientBestEffort(client);
    const usageMap = await this.loadUsageMap([client.id]);
    return serializeClient(client, usageMap.get(client.id) ?? emptyClientUsage());
  }

  async resetTraffic(clientId: string, admin: AuthenticatedAdmin, request: Request) {
    const client = await this.requireClient(clientId);
    await this.captureUsageSnapshotBestEffort('client-reset-traffic', true);

    await this.prisma.$transaction(async (tx) => {
      await tx.dailyClientUsage.deleteMany({
        where: {
          clientId,
        },
      });

      await tx.auditLog.create({
        data: {
          actorAdminId: admin.id,
          action: 'CLIENT_TRAFFIC_RESET',
          entityType: 'client',
          entityId: client.id,
          summary: `Traffic usage for ${client.displayName} was reset.`,
          ipAddress: request.ip ?? undefined,
          userAgent: request.get('user-agent') ?? undefined,
        },
      });

      await tx.client.update({
        where: {
          id: clientId,
        },
        data: {
          status:
            client.status === ClientStatus.BLOCKED
              ? resolveEffectiveClientStatus({
                  ...client,
                  isTrafficUnlimited: client.isTrafficUnlimited,
                  status: ClientStatus.ACTIVE,
                  trafficUsedBytes: 0n,
                  trafficLimitBytes: client.trafficLimitBytes,
                })
              : client.status,
        },
      });
    });

    const refreshed = await this.requireClient(clientId);
    await this.syncClientBestEffort(refreshed);
    return this.getById(clientId);
  }

  async remove(clientId: string, admin: AuthenticatedAdmin, request: Request) {
    const client = await this.requireClient(clientId);
    await this.captureUsageSnapshotBestEffort('client-delete', true);

    await this.prisma.$transaction(async (tx) => {
      await tx.client.delete({
        where: {
          id: client.id,
        },
      });

      await tx.auditLog.create({
        data: {
          actorAdminId: admin.id,
          action: 'CLIENT_DELETED',
          entityType: 'client',
          entityId: client.id,
          summary: `Client ${client.displayName} deleted.`,
          ipAddress: request.ip ?? undefined,
          userAgent: request.get('user-agent') ?? undefined,
        },
      });
    });

    await this.syncClientBestEffort({
      ...client,
      status: ClientStatus.DISABLED,
    });

    return {
      success: true,
      id: client.id,
    };
  }

  private async expireClients(): Promise<void> {
    const expiredClients = await this.prisma.client.findMany({
      where: {
        status: ClientStatus.ACTIVE,
        expiresAt: {
          lt: new Date(),
        },
      },
    });

    if (expiredClients.length === 0) {
      return;
    }

    await this.prisma.client.updateMany({
      where: {
        id: {
          in: expiredClients.map((client) => client.id),
        },
      },
      data: {
        status: ClientStatus.EXPIRED,
      },
    });

    for (const client of expiredClients) {
      await this.syncClientBestEffort({
        ...client,
        status: ClientStatus.EXPIRED,
      });
    }
  }

  private async requireClient(clientId: string) {
    const client = await this.prisma.client.findUnique({
      where: {
        id: clientId,
      },
    });

    if (!client) {
      throw new NotFoundException('Client was not found.');
    }

    return client;
  }

  private parseImportPayload(payload: unknown): ImportedClientBundle {
    const parsed = importClientsSchema.safeParse(payload);

    if (!parsed.success) {
      const issues = parsed.error.issues.map((issue) => {
        const path = issue.path.join('.');
        return path ? `${path}: ${issue.message}` : issue.message;
      });

      throw new BadRequestException(
        issues.length > 0 ? issues.join('; ') : 'Import payload is invalid.',
      );
    }

    return parsed.data;
  }

  private resolveExpiry(
    startsAt: Date,
    expiresAt?: string | null,
    durationDays?: number | null,
  ): Date | null {
    if (expiresAt !== undefined) {
      return expiresAt ? new Date(expiresAt) : null;
    }

    if (durationDays) {
      return new Date(startsAt.getTime() + durationDays * 86_400_000);
    }

    return null;
  }

  private resolveTrafficLimit(
    isTrafficUnlimited: boolean,
    trafficLimitBytes?: number | null,
  ): bigint | null {
    if (isTrafficUnlimited || trafficLimitBytes === undefined || trafficLimitBytes === null) {
      return null;
    }

    return BigInt(trafficLimitBytes);
  }

  private async loadUsageMap(clientIds: string[]) {
    if (clientIds.length === 0) {
      return new Map<string, ReturnType<typeof emptyClientUsage>>();
    }

    const [rows, latestConnectionSnapshots] = await Promise.all([
      this.prisma.dailyClientUsage.groupBy({
        by: ['clientId'],
        where: {
          clientId: {
            in: clientIds,
          },
        },
        _sum: {
          incomingBytes: true,
          outgoingBytes: true,
          totalBytes: true,
        },
      }),
      this.prisma.dailyClientUsage.findMany({
        where: {
          clientId: {
            in: clientIds,
          },
        },
        distinct: ['clientId'],
        orderBy: [{ bucketDate: 'desc' }, { updatedAt: 'desc' }],
        select: {
          activeConnections: true,
          clientId: true,
        },
      }),
    ]);
    const connectionsMap = new Map(
      latestConnectionSnapshots.map((snapshot) => [snapshot.clientId, snapshot.activeConnections]),
    );

    return new Map(
      rows.map((row) => [
        row.clientId,
        {
          incomingBytes: row._sum.incomingBytes ?? 0n,
          outgoingBytes: row._sum.outgoingBytes ?? 0n,
          totalBytes: row._sum.totalBytes ?? 0n,
          activeConnections: connectionsMap.get(row.clientId) ?? 0,
        },
      ]),
    );
  }

  private async importSingleClient(item: ImportedClientRecord, overwriteExisting: boolean) {
    const existing = await this.findImportTarget(item);

    if (existing && !overwriteExisting) {
      return {
        status: 'skipped' as const,
      };
    }

    const createdAt = item.createdAt ? new Date(item.createdAt) : new Date();
    const startsAt = item.startsAt ? new Date(item.startsAt) : null;
    const expiresAt = item.expiresAt ? new Date(item.expiresAt) : null;
    const trafficLimitBytes = this.parseBigInt(item.trafficLimitBytes);
    const incomingBytes = this.parseBigInt(item.incomingBytes) ?? 0n;
    const outgoingBytes = this.parseBigInt(item.outgoingBytes) ?? 0n;
    const totalBytes = this.parseBigInt(item.trafficUsedBytes) ?? 0n;
    const requestedStatus = item.status ?? ClientStatus.ACTIVE;
    this.assertAtLeastOneTransportEnabled(item.vlessEnabled, item.wireguardEnabled);
    const status =
      requestedStatus === ClientStatus.DISABLED || requestedStatus === ClientStatus.BLOCKED
        ? requestedStatus
        : resolveEffectiveClientStatus({
            expiresAt,
            isTrafficUnlimited: item.isTrafficUnlimited,
            status: requestedStatus,
            trafficLimitBytes,
            trafficUsedBytes: totalBytes,
          });

    const client = await this.prisma.$transaction(async (tx) => {
      const emailTag = await this.ensureUniqueEmailTag(tx, item.emailTag, existing?.id);
      const subscriptionToken = await this.ensureUniqueSubscriptionToken(
        tx,
        item.subscriptionToken,
        existing?.id,
      );
      const data: Prisma.ClientUncheckedCreateInput = {
        createdAt,
        deviceLimit: item.deviceLimit ?? null,
        displayName: item.displayName.trim(),
        emailTag,
        expiresAt,
        ipLimit: item.ipLimit ?? null,
        isTrafficUnlimited: item.isTrafficUnlimited,
        note: item.note?.trim() || null,
        startsAt,
        status,
        subscriptionToken,
        tags: item.tags,
        trafficLimitBytes,
        transportProfile: item.transportProfile,
        updatedAt: new Date(),
        uuid: item.uuid,
        vlessEnabled: item.vlessEnabled,
        wireguardEnabled: item.wireguardEnabled,
        xrayInboundTag: item.xrayInboundTag,
        durationDays: item.durationDays ?? null,
      };

      const nextClient = existing
        ? await tx.client.update({
            where: {
              id: existing.id,
            },
            data,
          })
        : await tx.client.create({
            data,
          });

      await tx.dailyClientUsage.deleteMany({
        where: {
          clientId: nextClient.id,
        },
      });

      if (
        incomingBytes > 0n ||
        outgoingBytes > 0n ||
        totalBytes > 0n ||
        item.activeConnections > 0
      ) {
        await tx.dailyClientUsage.create({
          data: {
            activeConnections: item.activeConnections,
            bucketDate: new Date(new Date().setUTCHours(0, 0, 0, 0)),
            clientId: nextClient.id,
            incomingBytes,
            outgoingBytes,
            totalBytes,
          },
        });
      }

      return nextClient;
    });

    return {
      client,
      status: existing ? ('updated' as const) : ('created' as const),
    };
  }

  private async findImportTarget(item: ImportedClientRecord) {
    if (item.id) {
      const byId = await this.prisma.client.findUnique({
        where: {
          id: item.id,
        },
      });

      if (byId) {
        return byId;
      }
    }

    const byUuid = await this.prisma.client.findUnique({
      where: {
        uuid: item.uuid,
      },
    });

    if (byUuid) {
      return byUuid;
    }

    return this.prisma.client.findUnique({
      where: {
        emailTag: item.emailTag,
      },
    });
  }

  private async ensureUniqueEmailTag(
    tx: Prisma.TransactionClient,
    desired: string,
    currentClientId?: string,
  ) {
    let candidate = desired.trim() || this.buildEmailTag('client');
    let suffixCounter = 0;

    while (true) {
      const existing = await tx.client.findUnique({
        where: {
          emailTag: candidate,
        },
      });

      if (!existing || existing.id === currentClientId) {
        return candidate;
      }

      suffixCounter += 1;
      candidate = `${desired}-${suffixCounter}`;
    }
  }

  private async ensureUniqueSubscriptionToken(
    tx: Prisma.TransactionClient,
    desired: string,
    currentClientId?: string,
  ) {
    let candidate = desired.trim() || randomBytes(24).toString('base64url');

    while (true) {
      const existing = await tx.client.findUnique({
        where: {
          subscriptionToken: candidate,
        },
      });

      if (!existing || existing.id === currentClientId) {
        return candidate;
      }

      candidate = randomBytes(24).toString('base64url');
    }
  }

  private parseBigInt(value: string | number | null | undefined) {
    if (value === null || value === undefined) {
      return null;
    }

    return BigInt(value);
  }

  private assertAtLeastOneTransportEnabled(vlessEnabled: boolean, wireguardEnabled: boolean) {
    if (!vlessEnabled && !wireguardEnabled) {
      throw new BadRequestException('At least one transport must remain enabled for the client.');
    }
  }

  private async syncClientBestEffort(
    client: Pick<
      Client,
      | 'emailTag'
      | 'expiresAt'
      | 'id'
      | 'isTrafficUnlimited'
      | 'status'
      | 'trafficLimitBytes'
      | 'transportProfile'
      | 'vlessEnabled'
      | 'uuid'
      | 'wireguardEnabled'
    >,
  ) {
    await Promise.allSettled([
      this.xrayService.syncClient(client).catch(() => {
        // The control plane keeps the canonical state in PostgreSQL.
        // If Xray is temporarily unavailable, the periodic reconciler will repair runtime drift.
      }),
      this.wireguardService.syncClient(client).catch(() => {
        // WireGuard runtime is also eventually consistent and will be reconciled in the background.
      }),
    ]);
  }

  private async captureUsageSnapshotBestEffort(reason: string, force = false) {
    try {
      await this.xrayService.captureUsageSnapshot({
        force,
        reason,
      });
    } catch {
      // Runtime stats are best-effort; listing clients should still work when Xray is unavailable.
    }
  }

  private buildEmailTag(displayName: string): string {
    const slug =
      displayName
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'client';

    return `${slug}-${randomBytes(4).toString('hex')}`;
  }
}
