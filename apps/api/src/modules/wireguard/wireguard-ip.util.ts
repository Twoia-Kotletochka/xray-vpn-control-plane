type ParsedWireguardNetwork = {
  broadcastAddress: number;
  cidr: number;
  networkAddress: number;
  serverAddress: number;
};

export function allocateWireguardPeerIpv4(
  serverAddressCidr: string,
  usedAddresses: string[],
): string {
  const parsed = parseWireguardNetwork(serverAddressCidr);
  const used = new Set(
    usedAddresses
      .map((value) => value.trim())
      .filter((value) => value.length > 0)
      .map(ipv4ToInt),
  );

  for (let candidate = parsed.networkAddress + 1; candidate < parsed.broadcastAddress; candidate += 1) {
    if (candidate === parsed.serverAddress || used.has(candidate)) {
      continue;
    }

    return intToIpv4(candidate);
  }

  throw new Error('No available WireGuard IPv4 addresses remain in the configured subnet.');
}

export function parseWireguardNetwork(serverAddressCidr: string): ParsedWireguardNetwork {
  const [serverAddress, cidrRaw] = serverAddressCidr.split('/');
  const cidr = Number(cidrRaw);

  if (!serverAddress || !Number.isInteger(cidr) || cidr < 0 || cidr > 32) {
    throw new Error(`Invalid WireGuard network CIDR: ${serverAddressCidr}`);
  }

  const serverInt = ipv4ToInt(serverAddress);
  const mask = cidr === 0 ? 0 : ((0xffffffff << (32 - cidr)) >>> 0);
  const networkAddress = serverInt & mask;
  const broadcastAddress = networkAddress | (~mask >>> 0);

  return {
    broadcastAddress,
    cidr,
    networkAddress,
    serverAddress: serverInt,
  };
}

export function ipv4ToInt(value: string) {
  const parts = value.split('.').map((part) => Number(part));

  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    throw new Error(`Invalid IPv4 address: ${value}`);
  }

  return (
    (((parts[0] ?? 0) << 24) >>> 0) +
    (((parts[1] ?? 0) << 16) >>> 0) +
    (((parts[2] ?? 0) << 8) >>> 0) +
    ((parts[3] ?? 0) >>> 0)
  ) >>> 0;
}

export function intToIpv4(value: number) {
  return [
    (value >>> 24) & 255,
    (value >>> 16) & 255,
    (value >>> 8) & 255,
    value & 255,
  ].join('.');
}
