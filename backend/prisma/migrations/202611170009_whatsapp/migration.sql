-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "MessageEventKind" ADD VALUE 'WHATSAPP_LINK_REVOKED';
ALTER TYPE "MessageEventKind" ADD VALUE 'WHATSAPP_NOTIFICATION_DELIVERED';
ALTER TYPE "MessageEventKind" ADD VALUE 'WHATSAPP_NOTIFICATION_READ';
ALTER TYPE "MessageEventKind" ADD VALUE 'WHATSAPP_NOTIFICATION_FAILED';

-- AlterTable
ALTER TABLE "delivery_intents" ADD COLUMN     "consentAt" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "email_deliveries" ADD COLUMN     "notificationAck" INTEGER,
ADD COLUMN     "notificationDeliveredAt" TIMESTAMPTZ(3),
ADD COLUMN     "notificationErrorAt" TIMESTAMPTZ(3),
ADD COLUMN     "notificationReadAt" TIMESTAMPTZ(3),
ADD COLUMN     "providerScope" VARCHAR(64);

-- CreateTable
CREATE TABLE "waha_receipts" (
    "id" TEXT NOT NULL,
    "scope" VARCHAR(64) NOT NULL,
    "eventId" VARCHAR(128) NOT NULL,
    "providerMessageId" VARCHAR(255) NOT NULL,
    "destination" VARCHAR(40),
    "ack" INTEGER NOT NULL,
    "observedAt" TIMESTAMPTZ(3) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "appliedAt" TIMESTAMPTZ(3),

    CONSTRAINT "waha_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "waha_receipts_scope_providerMessageId_idx" ON "waha_receipts"("scope", "providerMessageId");

-- CreateIndex
CREATE INDEX "waha_receipts_expiresAt_idx" ON "waha_receipts"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "waha_receipts_scope_eventId_key" ON "waha_receipts"("scope", "eventId");


ALTER TABLE "waha_receipts" ADD CONSTRAINT "waha_receipts_ack_bounds" CHECK ("ack" BETWEEN -1 AND 4);

CREATE UNIQUE INDEX "email_deliveries_providerScope_providerMessageId_key" ON "email_deliveries"("providerScope", "providerMessageId");
