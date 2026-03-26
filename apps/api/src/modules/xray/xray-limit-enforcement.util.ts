export type ClientLimitBreach = {
  actual: number;
  kind: 'deviceLimit' | 'ipLimit';
  limit: number;
};

export function buildUserOnlineStatName(emailTag: string) {
  return `user>>>${emailTag}>>>online`;
}

export function countOnlineIpEntries(
  ips: Record<string, bigint | number | string> | null | undefined,
) {
  return Object.keys(ips ?? {}).filter((ip) => ip.trim().length > 0).length;
}

export function evaluateClientLimitBreaches(input: {
  actualOnlineIps: number;
  deviceLimit: number | null;
  ipLimit: number | null;
}) {
  const breaches: ClientLimitBreach[] = [];

  if (input.deviceLimit !== null && input.actualOnlineIps > input.deviceLimit) {
    breaches.push({
      actual: input.actualOnlineIps,
      kind: 'deviceLimit',
      limit: input.deviceLimit,
    });
  }

  if (input.ipLimit !== null && input.actualOnlineIps > input.ipLimit) {
    breaches.push({
      actual: input.actualOnlineIps,
      kind: 'ipLimit',
      limit: input.ipLimit,
    });
  }

  return breaches;
}

export function describeClientLimitBreaches(breaches: ClientLimitBreach[]) {
  return breaches
    .map((breach) => {
      if (breach.kind === 'deviceLimit') {
        return `device limit ${breach.limit}`;
      }

      return `IP limit ${breach.limit}`;
    })
    .join(' and ');
}
