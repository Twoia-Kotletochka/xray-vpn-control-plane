import { describe, expect, it } from 'vitest';

import { validateEnv } from './env.schema';

describe('validateEnv', () => {
  it('parses a valid environment object', () => {
    const env = validateEnv({
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/db?schema=public',
      JWT_ACCESS_SECRET: '12345678901234567890123456789012',
      JWT_REFRESH_SECRET: 'abcdefghijklmnopqrstuvwxyz123456',
      TOTP_ENCRYPTION_SECRET: 'totp-encryption-secret-1234567890',
      INITIAL_ADMIN_EMAIL: 'admin@example.com',
      INITIAL_ADMIN_USERNAME: 'admin',
      INITIAL_ADMIN_PASSWORD: 'super-secure-password',
      API_LOG_FILE: '/var/log/server-vpn/api.log',
      PANEL_TLS_MODE: 'domain',
      PANEL_PUBLIC_URL: 'https://panel.example.com:8443',
      XRAY_API_TARGET: 'xray:10085',
      XRAY_REALITY_PUBLIC_KEY: 'public-key',
      XRAY_SHORT_IDS: '0123456789abcdef',
      XRAY_DEFAULT_SNI: 'www.cloudflare.com',
      XRAY_SUBSCRIPTION_BASE_URL: 'https://panel.example.com:8443',
      XRAY_ACCESS_LOG_FILE: '/var/log/server-vpn/xray-access.log',
      XRAY_ERROR_LOG_FILE: '/var/log/server-vpn/xray-error.log',
      CADDY_ACCESS_LOG_FILE: '/var/log/server-vpn/caddy-access.log',
      BACKUP_DIR: '/var/backups/server-vpn',
      BACKUP_HOST_DIR: '/opt/server-vpn/infra/backup/output',
      BACKUP_AUTO_CREATE_ENABLED: 'true',
      BACKUP_AUTO_CREATE_INTERVAL_DAYS: '5',
      BACKUP_AUTO_MAINTENANCE_INTERVAL_MS: '3600000',
      BACKUP_RETENTION_DAYS: '14',
    });

    expect(env.API_PORT).toBe(3000);
    expect(env.BCRYPT_ROUNDS).toBe(12);
    expect(env.XRAY_API_TARGET).toBe('xray:10085');
    expect(env.XRAY_VLESS_PORT).toBe(443);
    expect(env.PANEL_TLS_MODE).toBe('domain');
    expect(env.BACKUP_HOST_DIR).toBe('/opt/server-vpn/infra/backup/output');
    expect(env.BACKUP_AUTO_CREATE_ENABLED).toBe(true);
    expect(env.BACKUP_AUTO_CREATE_INTERVAL_DAYS).toBe(5);
    expect(env.BACKUP_RETENTION_DAYS).toBe(14);
  });

  it('parses explicit false for automatic backups correctly', () => {
    const env = validateEnv({
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/db?schema=public',
      JWT_ACCESS_SECRET: '12345678901234567890123456789012',
      JWT_REFRESH_SECRET: 'abcdefghijklmnopqrstuvwxyz123456',
      TOTP_ENCRYPTION_SECRET: 'totp-encryption-secret-1234567890',
      INITIAL_ADMIN_EMAIL: 'admin@example.com',
      INITIAL_ADMIN_USERNAME: 'admin',
      INITIAL_ADMIN_PASSWORD: 'super-secure-password',
      PANEL_PUBLIC_URL: 'https://panel.example.com:8443',
      XRAY_REALITY_PUBLIC_KEY: 'public-key',
      XRAY_SHORT_IDS: '0123456789abcdef',
      XRAY_DEFAULT_SNI: 'www.cloudflare.com',
      XRAY_SUBSCRIPTION_BASE_URL: 'https://panel.example.com:8443',
      BACKUP_AUTO_CREATE_ENABLED: 'false',
    });

    expect(env.BACKUP_AUTO_CREATE_ENABLED).toBe(false);
    expect(env.PANEL_TLS_MODE).toBe('ip');
  });
});
