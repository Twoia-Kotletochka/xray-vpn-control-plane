import { randomBytes, webcrypto } from 'node:crypto';

type WireguardKeyPair = {
  privateKey: string;
  publicKey: string;
};

export async function generateWireguardKeyPair(): Promise<WireguardKeyPair> {
  const keyPair = (await webcrypto.subtle.generateKey(
    { name: 'X25519' },
    true,
    ['deriveBits'],
  )) as CryptoKeyPair;
  const jwk = await webcrypto.subtle.exportKey('jwk', keyPair.privateKey);
  const publicKeyBuffer = Buffer.from(await webcrypto.subtle.exportKey('raw', keyPair.publicKey));

  if (!jwk.d) {
    throw new Error('Failed to export the WireGuard private key.');
  }

  return {
    privateKey: base64UrlToBase64(jwk.d),
    publicKey: publicKeyBuffer.toString('base64'),
  };
}

export function generateWireguardPresharedKey() {
  return randomBytes(32).toString('base64');
}

function base64UrlToBase64(value: string) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const paddingLength = (4 - (base64.length % 4)) % 4;

  return `${base64}${'='.repeat(paddingLength)}`;
}
