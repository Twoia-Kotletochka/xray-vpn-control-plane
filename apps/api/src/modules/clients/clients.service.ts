import { randomBytes, randomUUID } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { ClientStatus, Prisma, type TransportProfile } from '@prisma/client';
import type { Request } from 'express';

import type { AuthenticatedAdmin } from '../../common/auth/authenticated-admin.interface';
import { PrismaService } from '../../common/database/prisma.service';
import type { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
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
  constructor(private readonly prisma: PrismaService) {}

  async list(query: PaginationQueryDto) {
    await this.expireClients();

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

    const client = await this.prisma.client.findUnique({
      where: {
        id: clientId,
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

  async create(payload: CreateClientDto, admin: AuthenticatedAdmin, request: Request) {
    const startsAt = payload.startsAt ? new Date(payload.startsAt) : new Date();
    const expiresAt = this.resolveExpiry(startsAt, payload.expiresAt, payload.durationDays);
    const requestedStatus = payload.status ?? ClientStatus.ACTIVE;
    const status = resolveEffectiveClientStatus({
      status: requestedStatus,
      expiresAt,
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
          trafficLimitBytes: this.resolveTrafficLimit(
            payload.isTrafficUnlimited ?? false,
            payload.trafficLimitBytes,
          ),
          isTrafficUnlimited: payload.isTrafficUnlimited ?? false,
          deviceLimit: payload.deviceLimit,
          ipLimit: payload.ipLimit,
          subscriptionToken: randomBytes(24).toString('base64url'),
          transportProfile: payload.transportProfile,
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
    const status =
      requestedStatus === ClientStatus.DISABLED || requestedStatus === ClientStatus.BLOCKED
        ? requestedStatus
        : resolveEffectiveClientStatus({
            status: requestedStatus,
            expiresAt,
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
          transportProfile: payload.transportProfile,
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

    const usageMap = await this.loadUsageMap([client.id]);
    return serializeClient(client, usageMap.get(client.id) ?? emptyClientUsage());
  }

  async resetTraffic(clientId: string, admin: AuthenticatedAdmin, request: Request) {
    const client = await this.requireClient(clientId);

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
    });

    return this.getById(clientId);
  }

  async remove(clientId: string, admin: AuthenticatedAdmin, request: Request) {
    const client = await this.requireClient(clientId);

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

    return {
      success: true,
      id: client.id,
    };
  }

  private async expireClients(): Promise<void> {
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

    const rows = await this.prisma.dailyClientUsage.groupBy({
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
        activeConnections: true,
      },
    });

    return new Map(
      rows.map((row) => [
        row.clientId,
        {
          incomingBytes: row._sum.incomingBytes ?? 0n,
          outgoingBytes: row._sum.outgoingBytes ?? 0n,
          totalBytes: row._sum.totalBytes ?? 0n,
          activeConnections: row._sum.activeConnections ?? 0,
        },
      ]),
    );
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
