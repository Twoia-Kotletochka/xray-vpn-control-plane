import { ClientStatus, TransportProfile } from '@prisma/client';
import { z } from 'zod';

const numericStringSchema = z.string().regex(/^\d+$/);

const exportedClientSchema = z.object({
  id: z.string().min(1).optional(),
  uuid: z.string().uuid(),
  emailTag: z.string().min(1),
  displayName: z.string().min(2),
  note: z.string().nullish(),
  tags: z.array(z.string()).max(16).default([]),
  status: z.nativeEnum(ClientStatus).default(ClientStatus.ACTIVE),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
  startsAt: z.string().datetime().nullish(),
  expiresAt: z.string().datetime().nullish(),
  durationDays: z.number().int().positive().nullish(),
  trafficLimitBytes: z.union([numericStringSchema, z.number().int().positive()]).nullish(),
  isTrafficUnlimited: z.boolean().default(false),
  trafficUsedBytes: z.union([numericStringSchema, z.number().int().nonnegative()]).default('0'),
  incomingBytes: z.union([numericStringSchema, z.number().int().nonnegative()]).default('0'),
  outgoingBytes: z.union([numericStringSchema, z.number().int().nonnegative()]).default('0'),
  remainingTrafficBytes: z.union([numericStringSchema, z.number().int().nonnegative()]).nullish(),
  deviceLimit: z.number().int().min(1).max(32).nullish(),
  ipLimit: z.number().int().min(1).max(32).nullish(),
  vlessEnabled: z.boolean().default(true),
  wireguardEnabled: z.boolean().default(false),
  subscriptionToken: z.string().min(16),
  transportProfile: z.nativeEnum(TransportProfile).default(TransportProfile.VLESS_REALITY_TCP),
  xrayInboundTag: z.string().min(1).default('vless-reality-main'),
  activeConnections: z.number().int().nonnegative().default(0),
  lastActivatedAt: z.string().datetime().nullish().optional(),
  lastSeenAt: z.string().datetime().nullish().optional(),
  wireguardIpv4Address: z.string().nullish().optional(),
  wireguardLastHandshakeAt: z.string().datetime().nullish().optional(),
  hasWireguardProfile: z.boolean().optional(),
});

export const importClientsSchema = z.object({
  schemaVersion: z.number().int().positive().default(1),
  exportedAt: z.string().datetime().optional(),
  overwriteExisting: z.boolean().default(false),
  items: z.array(exportedClientSchema).min(1).max(1_000),
});

export type ImportedClientBundle = z.infer<typeof importClientsSchema>;
export type ImportedClientRecord = ImportedClientBundle['items'][number];
