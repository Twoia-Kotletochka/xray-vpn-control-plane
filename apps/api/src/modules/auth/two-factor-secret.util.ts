import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

type EncryptedSecretPayload = {
  iv: string;
  tag: string;
  value: string;
};

export function encryptTwoFactorSecret(secret: string, passphrase: string): string {
  const iv = randomBytes(12);
  const key = deriveKey(passphrase);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  const payload: EncryptedSecretPayload = {
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    value: encrypted.toString('base64'),
  };

  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
}

export function decryptTwoFactorSecret(encodedPayload: string, passphrase: string): string {
  const parsed = parsePayload(encodedPayload);
  const key = deriveKey(passphrase);
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(parsed.iv, 'base64'));

  decipher.setAuthTag(Buffer.from(parsed.tag, 'base64'));

  return Buffer.concat([
    decipher.update(Buffer.from(parsed.value, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

function deriveKey(passphrase: string): Buffer {
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
