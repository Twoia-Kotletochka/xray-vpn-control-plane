ALTER TABLE "Client"
ADD COLUMN "vlessEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "wireguardEnabled" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "WireguardPeer" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "assignedIpv4" TEXT NOT NULL,
  "privateKeyEnc" TEXT NOT NULL,
  "publicKey" TEXT NOT NULL,
  "presharedKeyEnc" TEXT,
  "observedRxBytes" BIGINT NOT NULL DEFAULT 0,
  "observedTxBytes" BIGINT NOT NULL DEFAULT 0,
  "lastHandshakeAt" TIMESTAMP(3),
  "lastObservedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "WireguardPeer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WireguardPeer_clientId_key" ON "WireguardPeer"("clientId");
CREATE UNIQUE INDEX "WireguardPeer_assignedIpv4_key" ON "WireguardPeer"("assignedIpv4");
CREATE UNIQUE INDEX "WireguardPeer_publicKey_key" ON "WireguardPeer"("publicKey");

ALTER TABLE "WireguardPeer"
ADD CONSTRAINT "WireguardPeer_clientId_fkey"
FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
