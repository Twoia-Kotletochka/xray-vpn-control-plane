import { type Client, ClientStatus, type Prisma } from '@prisma/client';

type ClientUsageAggregate = {
  activeConnections: number;
  incomingBytes: bigint;
  outgoingBytes: bigint;
  totalBytes: bigint;
};

type ClientRecord = Client & {
  tags: Prisma.JsonValue | null;
};

function asIsoString(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function asBigIntString(value: bigint | null): string | null {
  return value === null ? null : value.toString();
}

function asStringArray(value: Prisma.JsonValue | null): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === 'string');
}

export function resolveEffectiveClientStatus(
  client: Pick<Client, 'status' | 'expiresAt'>,
): ClientStatus {
  if (client.status === ClientStatus.DISABLED || client.status === ClientStatus.BLOCKED) {
    return client.status;
  }

  if (client.expiresAt && client.expiresAt.getTime() <= Date.now()) {
    return ClientStatus.EXPIRED;
  }

  return ClientStatus.ACTIVE;
}

export function emptyClientUsage(): ClientUsageAggregate {
  return {
    activeConnections: 0,
    incomingBytes: 0n,
    outgoingBytes: 0n,
    totalBytes: 0n,
  };
}

export function serializeClient(client: ClientRecord, usage: ClientUsageAggregate) {
  const status = resolveEffectiveClientStatus(client);
  const remainingTrafficBytes =
    client.isTrafficUnlimited || client.trafficLimitBytes === null
      ? null
      : client.trafficLimitBytes > usage.totalBytes
        ? client.trafficLimitBytes - usage.totalBytes
        : 0n;

  return {
    id: client.id,
    uuid: client.uuid,
    emailTag: client.emailTag,
    displayName: client.displayName,
    note: client.note,
    tags: asStringArray(client.tags),
    status,
    createdAt: client.createdAt.toISOString(),
    updatedAt: client.updatedAt.toISOString(),
    startsAt: asIsoString(client.startsAt),
    expiresAt: asIsoString(client.expiresAt),
    durationDays: client.durationDays,
    trafficLimitBytes: asBigIntString(client.trafficLimitBytes),
    isTrafficUnlimited: client.isTrafficUnlimited,
    trafficUsedBytes: usage.totalBytes.toString(),
    incomingBytes: usage.incomingBytes.toString(),
    outgoingBytes: usage.outgoingBytes.toString(),
    remainingTrafficBytes: asBigIntString(remainingTrafficBytes),
    deviceLimit: client.deviceLimit,
    ipLimit: client.ipLimit,
    subscriptionToken: client.subscriptionToken,
    transportProfile: client.transportProfile,
    xrayInboundTag: client.xrayInboundTag,
    activeConnections: usage.activeConnections,
    lastActivatedAt: asIsoString(client.lastActivatedAt),
    lastSeenAt: asIsoString(client.lastSeenAt),
  };
}
