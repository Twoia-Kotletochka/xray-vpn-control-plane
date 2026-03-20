import { z } from 'zod';

const nodeEnvSchema = z.enum(['development', 'test', 'production']);

export const envSchema = z.object({
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
  DATABASE_URL: z.string().min(1),
  DATABASE_DIRECT_URL: z.string().min(1).optional(),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  INITIAL_ADMIN_EMAIL: z.string().email(),
  INITIAL_ADMIN_USERNAME: z.string().min(3),
  INITIAL_ADMIN_PASSWORD: z.string().min(12),
  PANEL_PUBLIC_URL: z.string().url(),
  XRAY_VLESS_PORT: z.coerce.number().int().positive().default(443),
  XRAY_INBOUND_TAG: z.string().default('vless-reality-main'),
  XRAY_SUBSCRIPTION_BASE_URL: z.string().url(),
});

export type AppEnv = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): AppEnv {
  return envSchema.parse(config);
}
