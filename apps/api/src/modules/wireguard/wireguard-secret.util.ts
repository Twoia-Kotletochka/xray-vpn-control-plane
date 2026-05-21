import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

type EncryptedSecretPayload = {
  iv: string;
  tag: string;
  value: string;
};

export function encryptWireguardSecret(secret: string, passphrase: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(passphrase), iv);
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);

  return Buffer.from(
    JSON.stringify({
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      value: encrypted.toString('base64'),
    } satisfies EncryptedSecretPayload),
    'utf8',
  ).toString('base64');
}

export function decryptWireguardSecret(encodedPayload: string, passphrase: string) {
  const payload = parsePayload(encodedPayload);
  const decipher = createDecipheriv(
    'aes-256-gcm',
    deriveKey(passphrase),
    Buffer.from(payload.iv, 'base64'),
  );

  decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));

  return Buffer.concat([
    decipher.update(Buffer.from(payload.value, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

function deriveKey(passphrase: string) {
  return createHash('sha256').update(passphrase).digest();
}

function parsePayload(encodedPayload: string): EncryptedSecretPayload {
  const decoded = Buffer.from(encodedPayload, 'base64').toString('utf8');
  const payload = JSON.parse(decoded);

  if (
    !payload ||
    typeof payload !== 'object' ||
    typeof payload.iv !== 'string' ||
    typeof payload.tag !== 'string' ||
    typeof payload.value !== 'string'
  ) {
    throw new Error('Invalid encrypted secret payload.');
  }

  return payload;
}
