-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('SUPER_ADMIN', 'OPERATOR', 'READ_ONLY');

-- CreateEnum
CREATE TYPE "ClientStatus" AS ENUM ('ACTIVE', 'DISABLED', 'EXPIRED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "TransportProfile" AS ENUM ('VLESS_REALITY_TCP', 'VLESS_WS_TLS');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM (
  'LOGIN_SUCCESS',
  'LOGIN_FAILED',
  'ADMIN_CREATED',
  'ADMIN_UPDATED',
  'CLIENT_CREATED',
  'CLIENT_UPDATED',
  'CLIENT_DISABLED',
  'CLIENT_DELETED',
  'CLIENT_TRAFFIC_RESET',
  'CLIENT_EXTENDED',
  'XRAY_RELOAD',
  'BACKUP_CREATED',
  'BACKUP_RESTORED',
  'SETTINGS_UPDATED'
);

-- CreateTable
CREATE TABLE "AdminUser" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "username" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "role" "AdminRole" NOT NULL DEFAULT 'SUPER_ADMIN',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "totpSecretEnc" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminSession" (
  "id" TEXT NOT NULL,
  "adminUserId" TEXT NOT NULL,
  "refreshTokenHash" TEXT NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AdminSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
  "id" TEXT NOT NULL,
  "uuid" TEXT NOT NULL,
  "emailTag" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "note" TEXT,
  "tags" JSONB,
  "status" "ClientStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "startsAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "durationDays" INTEGER,
  "trafficLimitBytes" BIGINT,
  "isTrafficUnlimited" BOOLEAN NOT NULL DEFAULT false,
  "deviceLimit" INTEGER,
  "ipLimit" INTEGER,
  "subscriptionToken" TEXT NOT NULL,
  "transportProfile" "TransportProfile" NOT NULL DEFAULT 'VLESS_REALITY_TCP',
  "xrayInboundTag" TEXT NOT NULL DEFAULT 'vless-reality-main',
  "lastActivatedAt" TIMESTAMP(3),
  "lastSeenAt" TIMESTAMP(3),

  CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyClientUsage" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "bucketDate" TIMESTAMP(3) NOT NULL,
  "incomingBytes" BIGINT NOT NULL DEFAULT 0,
  "outgoingBytes" BIGINT NOT NULL DEFAULT 0,
  "totalBytes" BIGINT NOT NULL DEFAULT 0,
  "activeConnections" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "DailyClientUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
  "id" TEXT NOT NULL,
  "actorAdminId" TEXT,
  "action" "AuditAction" NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT,
  "summary" TEXT NOT NULL,
  "metadata" JSONB,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BackupSnapshot" (
  "id" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "checksumSha256" TEXT NOT NULL,
  "fileSizeBytes" BIGINT NOT NULL,
  "status" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "restoredAt" TIMESTAMP(3),
  "notes" TEXT,

  CONSTRAINT "BackupSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemSetting" (
  "key" TEXT NOT NULL,
  "value" JSONB NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_email_key" ON "AdminUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_username_key" ON "AdminUser"("username");

-- CreateIndex
CREATE INDEX "AdminSession_adminUserId_idx" ON "AdminSession"("adminUserId");

-- CreateIndex
CREATE INDEX "AdminSession_expiresAt_idx" ON "AdminSession"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Client_uuid_key" ON "Client"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "Client_emailTag_key" ON "Client"("emailTag");

-- CreateIndex
CREATE UNIQUE INDEX "Client_subscriptionToken_key" ON "Client"("subscriptionToken");

-- CreateIndex
CREATE INDEX "Client_status_idx" ON "Client"("status");

-- CreateIndex
CREATE INDEX "Client_expiresAt_idx" ON "Client"("expiresAt");

-- CreateIndex
CREATE INDEX "DailyClientUsage_bucketDate_idx" ON "DailyClientUsage"("bucketDate");

-- CreateIndex
CREATE UNIQUE INDEX "DailyClientUsage_clientId_bucketDate_key" ON "DailyClientUsage"(
  "clientId",
  "bucketDate"
);

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "AdminSession"
ADD CONSTRAINT "AdminSession_adminUserId_fkey"
FOREIGN KEY ("adminUserId")
REFERENCES "AdminUser"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyClientUsage"
ADD CONSTRAINT "DailyClientUsage_clientId_fkey"
FOREIGN KEY ("clientId")
REFERENCES "Client"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog"
ADD CONSTRAINT "AuditLog_actorAdminId_fkey"
FOREIGN KEY ("actorAdminId")
REFERENCES "AdminUser"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
