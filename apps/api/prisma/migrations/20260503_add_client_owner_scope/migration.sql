ALTER TABLE "Client"
ADD COLUMN "createdByAdminUserId" TEXT;

UPDATE "Client"
SET "createdByAdminUserId" = (
  SELECT "id"
  FROM "AdminUser"
  ORDER BY
    CASE
      WHEN "role" = 'SUPER_ADMIN'::"AdminRole" THEN 0
      ELSE 1
    END,
    "createdAt" ASC
  LIMIT 1
)
WHERE "createdByAdminUserId" IS NULL;

CREATE INDEX "Client_createdByAdminUserId_idx" ON "Client"("createdByAdminUserId");

ALTER TABLE "Client"
ADD CONSTRAINT "Client_createdByAdminUserId_fkey"
FOREIGN KEY ("createdByAdminUserId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
