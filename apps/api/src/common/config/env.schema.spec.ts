import { describe, expect, it } from 'vitest';

import { validateEnv } from './env.schema';

describe('validateEnv', () => {
  it('parses a valid environment object', () => {
    const env = validateEnv({
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/db?schema=public',
      JWT_ACCESS_SECRET: '12345678901234567890123456789012',
      JWT_REFRESH_SECRET: 'abcdefghijklmnopqrstuvwxyz123456',
      INITIAL_ADMIN_EMAIL: 'admin@example.com',
      INITIAL_ADMIN_USERNAME: 'admin',
      INITIAL_ADMIN_PASSWORD: 'super-secure-password',
      PANEL_PUBLIC_URL: 'https://panel.example.com:8443',
      XRAY_SUBSCRIPTION_BASE_URL: 'https://panel.example.com:8443',
    });

    expect(env.API_PORT).toBe(3000);
    expect(env.BCRYPT_ROUNDS).toBe(12);
    expect(env.XRAY_VLESS_PORT).toBe(443);
  });
});
