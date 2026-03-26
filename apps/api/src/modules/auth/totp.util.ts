import { createHmac, randomBytes } from 'node:crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const TOTP_DIGITS = 6;
const TOTP_TIME_STEP_SECONDS = 30;

export function generateTotpSecret(byteLength = 20): string {
  return encodeBase32(randomBytes(byteLength));
}

export function buildTotpOtpAuthUrl(params: {
  secret: string;
  issuer: string;
  accountName: string;
}): string {
  const label = `${params.issuer}:${params.accountName}`;

  return `otpauth://totp/${encodeURIComponent(label)}?secret=${params.secret}&issuer=${encodeURIComponent(
    params.issuer,
  )}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_TIME_STEP_SECONDS}`;
}

export function verifyTotpCode(secret: string, code: string, timestamp = Date.now(), window = 1) {
  const normalizedCode = code.replace(/\s+/g, '');

  if (!/^\d{6}$/.test(normalizedCode)) {
    return false;
  }

  const currentCounter = Math.floor(timestamp / 1_000 / TOTP_TIME_STEP_SECONDS);

  for (let offset = -window; offset <= window; offset += 1) {
    const candidateCounter = currentCounter + offset;

    if (candidateCounter < 0) {
      continue;
    }

    if (generateHotp(secret, candidateCounter) === normalizedCode) {
      return true;
    }
  }

  return false;
}

function generateHotp(secret: string, counter: number): string {
  const counterBuffer = Buffer.alloc(8);

  counterBuffer.writeBigUInt64BE(BigInt(counter));

  const digest = createHmac('sha1', decodeBase32(secret)).update(counterBuffer).digest();
  const lastByte = digest.at(-1) ?? 0;
  const offset = lastByte & 0x0f;
  const byte0 = digest[offset] ?? 0;
  const byte1 = digest[offset + 1] ?? 0;
  const byte2 = digest[offset + 2] ?? 0;
  const byte3 = digest[offset + 3] ?? 0;
  const binaryCode =
    ((byte0 & 0x7f) << 24) |
    ((byte1 & 0xff) << 16) |
    ((byte2 & 0xff) << 8) |
    (byte3 & 0xff);

  return String(binaryCode % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, '0');
}

function encodeBase32(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';

  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

function decodeBase32(value: string): Buffer {
  const normalized = value.toUpperCase().replace(/[\s-]+/g, '');
  let bits = 0;
  let current = 0;
  const bytes: number[] = [];

  for (const char of normalized) {
    const index = BASE32_ALPHABET.indexOf(char);

    if (index === -1) {
      throw new Error('Invalid base32 secret.');
    }

    current = (current << 5) | index;
    bits += 5;

    if (bits >= 8) {
      bytes.push((current >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}
