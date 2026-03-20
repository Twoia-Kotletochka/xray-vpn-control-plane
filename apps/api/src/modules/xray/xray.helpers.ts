export type XrayTrafficDirection = 'uplink' | 'downlink';

export type XrayStatEntry = {
  name: string;
  value: bigint | number | string;
};

export type XrayTrafficDelta = {
  incomingBytes: bigint;
  outgoingBytes: bigint;
  totalBytes: bigint;
};

function asBigInt(value: bigint | number | string): bigint {
  if (typeof value === 'bigint') {
    return value;
  }

  if (typeof value === 'number') {
    return BigInt(value);
  }

  return BigInt(value);
}

export function parseUserTrafficStatName(
  value: string,
): { direction: XrayTrafficDirection; emailTag: string } | null {
  const parts = value.split('>>>');

  if (parts.length !== 4 || parts[0] !== 'user' || parts[2] !== 'traffic') {
    return null;
  }

  if (parts[3] !== 'uplink' && parts[3] !== 'downlink') {
    return null;
  }

  return {
    emailTag: parts[1] ?? '',
    direction: parts[3],
  };
}

export function buildTrafficDeltaMap(stats: XrayStatEntry[]): Map<string, XrayTrafficDelta> {
  const usage = new Map<string, XrayTrafficDelta>();

  for (const stat of stats) {
    const parsed = parseUserTrafficStatName(stat.name);

    if (!parsed?.emailTag) {
      continue;
    }

    const current = usage.get(parsed.emailTag) ?? {
      incomingBytes: 0n,
      outgoingBytes: 0n,
      totalBytes: 0n,
    };
    const amount = asBigInt(stat.value);

    if (parsed.direction === 'uplink') {
      current.outgoingBytes += amount;
    } else {
      current.incomingBytes += amount;
    }

    current.totalBytes = current.incomingBytes + current.outgoingBytes;
    usage.set(parsed.emailTag, current);
  }

  return usage;
}

export function startOfUtcDay(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}
