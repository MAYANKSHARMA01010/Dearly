-- Additive SMS evidence; preserve existing email/WhatsApp access records.
ALTER TYPE "MessageEventKind" ADD VALUE 'SMS_LINK_REVOKED';
ALTER TYPE "MessageEventKind" ADD VALUE 'SMS_NOTIFICATION_SENT';
ALTER TYPE "MessageEventKind" ADD VALUE 'SMS_NOTIFICATION_DELIVERED';
ALTER TYPE "MessageEventKind" ADD VALUE 'SMS_NOTIFICATION_FAILED';
ALTER TABLE "email_deliveries" ADD COLUMN "notificationSentAt" TIMESTAMPTZ(3);
CREATE TABLE "sms_receipts" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "scope" VARCHAR(64) NOT NULL,
  "eventId" VARCHAR(128) NOT NULL,
  "deliveryId" TEXT NOT NULL REFERENCES "email_deliveries"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "kind" VARCHAR(16) NOT NULL CHECK ("kind" IN ('SENT', 'DELIVERED', 'FAILED')),
  "partsCount" INTEGER,
  "observedAt" TIMESTAMPTZ(3) NOT NULL,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "appliedAt" TIMESTAMPTZ(3)
);
CREATE UNIQUE INDEX "sms_receipts_scope_eventId_key" ON "sms_receipts"("scope", "eventId");
CREATE INDEX "sms_receipts_deliveryId_idx" ON "sms_receipts"("deliveryId");
CREATE INDEX "sms_receipts_expiresAt_idx" ON "sms_receipts"("expiresAt");
