import { z } from 'zod';

const nodeEnvSchema = z.enum(['development', 'test', 'production']);
const envBooleanSchema = z.union([z.boolean(), z.string()]).transform((value, context) => {
  if (typeof value === 'boolean') {
    return value;
  }

  const normalized = value.trim().toLowerCase();

  if (normalized === 'true') {
    return true;
  }

  if (normalized === 'false') {
    return false;
  }

  context.addIssue({
    code: z.ZodIssueCode.custom,
    message: 'Expected a boolean string (true or false).',
  });

  return z.NEVER;
});

export const envSchema = z
  .object({
    NODE_ENV: nodeEnvSchema.default('development'),
    API_PORT: z.coerce.number().int().positive().default(3000),
    API_LOG_LEVEL: z.string().default('info'),
    API_CORS_ORIGIN: z.string().default('http://localhost:5173'),
    SESSION_COOKIE_NAME: z.string().default('svpn_admin'),
    ACCESS_TOKEN_TTL: z.string().default('15m'),
    REFRESH_TOKEN_TTL: z.string().default('30d'),
    BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(14).default(12),
    LOGIN_RATE_LIMIT_TTL_MS: z.coerce.number().int().positive().default(60_000),
    LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
    API_LOG_FILE: z.string().default('/var/log/server-vpn/api.log'),
    DATABASE_URL: z.string().min(1),
    DATABASE_DIRECT_URL: z.string().min(1).optional(),
    JWT_ACCESS_SECRET: z.string().min(32),
    JWT_REFRESH_SECRET: z.string().min(32),
    TOTP_ENCRYPTION_SECRET: z.string().min(32),
    INITIAL_ADMIN_EMAIL: z.string().email(),
    INITIAL_ADMIN_USERNAME: z.string().min(3),
    INITIAL_ADMIN_PASSWORD: z.string().min(12),
    PANEL_TLS_MODE: z.enum(['ip', 'domain']).default('ip'),
    PANEL_PUBLIC_URL: z.string().url(),
    XRAY_VLESS_PORT: z.coerce.number().int().positive().default(443),
    XRAY_INBOUND_TAG: z.string().default('vless-reality-main'),
    XRAY_API_TARGET: z.string().default('xray:10085'),
    XRAY_REALITY_PUBLIC_KEY: z.string().min(1),
    XRAY_SHORT_IDS: z.string().min(1),
    XRAY_DEFAULT_SNI: z.string().min(1),
    XRAY_DEFAULT_SPIDER_X: z.string().default('/'),
    XRAY_PUBLIC_HOST: z.string().optional(),
    XRAY_SUBSCRIPTION_BASE_URL: z.string().url(),
    XRAY_ACCESS_LOG_FILE: z.string().default('/var/log/server-vpn/xray-access.log'),
    XRAY_ERROR_LOG_FILE: z.string().default('/var/log/server-vpn/xray-error.log'),
    XRAY_USAGE_SNAPSHOT_INTERVAL_MS: z.coerce.number().int().positive().default(60_000),
    XRAY_CONTROL_SYNC_INTERVAL_MS: z.coerce.number().int().positive().default(60_000),
    SERVER_PUBLIC_IP: z.string().optional(),
    WIREGUARD_ENABLED: envBooleanSchema.default(false),
    WIREGUARD_INTERFACE: z.string().default('wg0'),
    WIREGUARD_PORT: z.coerce.number().int().positive().default(51820),
    WIREGUARD_SERVER_PRIVATE_KEY: z.string().optional(),
    WIREGUARD_SERVER_PUBLIC_KEY: z.string().optional(),
    WIREGUARD_SERVER_ADDRESS_CIDR: z.string().default('10.44.0.1/24'),
    WIREGUARD_PUBLIC_HOST: z.string().optional(),
    WIREGUARD_ALLOWED_IPS: z.string().default('0.0.0.0/0,::/0'),
    WIREGUARD_CLIENT_DNS: z.string().default('1.1.1.1,1.0.0.1'),
    WIREGUARD_PERSISTENT_KEEPALIVE: z.coerce.number().int().min(0).default(25),
    WIREGUARD_MTU: z.coerce.number().int().positive().default(1420),
    WIREGUARD_CONFIG_ENCRYPTION_SECRET: z.string().min(32).optional(),
    WIREGUARD_CONFIG_PATH: z
      .string()
      .default('/var/lib/server-vpn/wireguard/generated/wg0.conf'),
    WIREGUARD_RUNTIME_DUMP_PATH: z
      .string()
      .default('/var/lib/server-vpn/wireguard/runtime/wg-show.dump'),
    WIREGUARD_RUNTIME_SYNC_INTERVAL_MS: z.coerce.number().int().positive().default(60_000),
    WIREGUARD_EGRESS_INTERFACE: z.string().default('eth0'),
    WIREGUARD_AUTO_ENABLE_LEGACY_CLIENTS: envBooleanSchema.default(true),
    WIREGUARD_LOG_FILE: z.string().default('/var/log/server-vpn/wireguard.log'),
    CADDY_ACCESS_LOG_FILE: z.string().default('/var/log/server-vpn/caddy-access.log'),
    BACKUP_DIR: z.string().default('/var/backups/server-vpn'),
    BACKUP_HOST_DIR: z.string().default(''),
    BACKUP_AUTO_CREATE_ENABLED: envBooleanSchema.default(true),
    BACKUP_AUTO_CREATE_INTERVAL_DAYS: z.coerce.number().int().positive().default(5),
    BACKUP_AUTO_MAINTENANCE_INTERVAL_MS: z.coerce.number().int().positive().default(3_600_000),
    BACKUP_RETENTION_DAYS: z.coerce.number().int().positive().default(14),
  })
  .superRefine((env, context) => {
    if (!env.WIREGUARD_ENABLED) {
      return;
    }

    if (!env.WIREGUARD_SERVER_PRIVATE_KEY) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'WIREGUARD_SERVER_PRIVATE_KEY is required when WireGuard is enabled.',
        path: ['WIREGUARD_SERVER_PRIVATE_KEY'],
      });
    }

    if (!env.WIREGUARD_SERVER_PUBLIC_KEY) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'WIREGUARD_SERVER_PUBLIC_KEY is required when WireGuard is enabled.',
        path: ['WIREGUARD_SERVER_PUBLIC_KEY'],
      });
    }

    if (!env.WIREGUARD_CONFIG_ENCRYPTION_SECRET) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'WIREGUARD_CONFIG_ENCRYPTION_SECRET is required when WireGuard is enabled.',
        path: ['WIREGUARD_CONFIG_ENCRYPTION_SECRET'],
      });
    }
  });

export type AppEnv = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): AppEnv {
  return envSchema.parse(config);
}
