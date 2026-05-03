import { type Client, ClientStatus, type Prisma, type WireguardPeer } from '@prisma/client';

type ClientUsageAggregate = {
  activeConnections: number;
  incomingBytes: bigint;
  outgoingBytes: bigint;
  totalBytes: bigint;
};

type ClientRecord = Client & {
  tags: Prisma.JsonValue | null;
  wireguardPeer?: Pick<WireguardPeer, 'assignedIpv4' | 'lastHandshakeAt'> | null;
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
  client: Pick<Client, 'expiresAt' | 'status'> & {
    isTrafficUnlimited?: boolean;
    trafficLimitBytes?: bigint | null;
    trafficUsedBytes?: bigint | null;
  },
): ClientStatus {
  if (client.status === ClientStatus.DISABLED || client.status === ClientStatus.BLOCKED) {
    return client.status;
  }

  if (client.expiresAt && client.expiresAt.getTime() <= Date.now()) {
    return ClientStatus.EXPIRED;
  }

  if (
    !client.isTrafficUnlimited &&
    client.trafficLimitBytes !== null &&
    client.trafficLimitBytes !== undefined &&
    (client.trafficUsedBytes ?? 0n) >= client.trafficLimitBytes
  ) {
    return ClientStatus.BLOCKED;
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
  const status = resolveEffectiveClientStatus({
    ...client,
    trafficUsedBytes: usage.totalBytes,
  });
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
    vlessEnabled: client.vlessEnabled,
    wireguardEnabled: client.wireguardEnabled,
    subscriptionToken: client.subscriptionToken,
    transportProfile: client.transportProfile,
    xrayInboundTag: client.xrayInboundTag,
    activeConnections: usage.activeConnections,
    lastActivatedAt: asIsoString(client.lastActivatedAt),
    lastSeenAt: asIsoString(client.lastSeenAt),
    wireguardIpv4Address: client.wireguardPeer?.assignedIpv4 ?? null,
    wireguardLastHandshakeAt: asIsoString(client.wireguardPeer?.lastHandshakeAt ?? null),
    hasWireguardProfile: Boolean(client.wireguardPeer),
  };
}
