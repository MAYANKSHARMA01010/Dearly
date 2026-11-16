-- CreateEnum
CREATE TYPE "DeliveryChannel" AS ENUM ('IN_APP', 'WHATSAPP', 'SMS', 'EMAIL');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "MessageStatus" ADD VALUE 'SCHEDULED';
ALTER TYPE "MessageStatus" ADD VALUE 'CANCELED';

-- AlterTable
ALTER TABLE "draft_messages" ADD COLUMN     "canceledAt" TIMESTAMPTZ(3),
ADD COLUMN     "scheduleLocalDateTime" VARCHAR(16),
ADD COLUMN     "scheduleRequestHash" CHAR(64),
ADD COLUMN     "scheduleTimezone" VARCHAR(80),
ADD COLUMN     "scheduledFor" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "delivery_intents" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "channel" "DeliveryChannel" NOT NULL,

    CONSTRAINT "delivery_intents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "delivery_intents_messageId_recipientId_channel_key" ON "delivery_intents"("messageId", "recipientId", "channel");

-- CreateIndex
CREATE INDEX "draft_messages_status_scheduledFor_id_idx" ON "draft_messages"("status", "scheduledFor", "id");

-- CreateIndex
CREATE UNIQUE INDEX "draft_recipients_id_messageId_key" ON "draft_recipients"("id", "messageId");

-- AddForeignKey
ALTER TABLE "delivery_intents" ADD CONSTRAINT "delivery_intents_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "draft_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_intents" ADD CONSTRAINT "delivery_intents_recipientId_messageId_fkey" FOREIGN KEY ("recipientId", "messageId") REFERENCES "draft_recipients"("id", "messageId") ON DELETE CASCADE ON UPDATE CASCADE;


-- Schedule state and metadata stay consistent even for direct writes.
ALTER TABLE "draft_messages" ADD CONSTRAINT "draft_messages_schedule_shape" CHECK (
  ("status"::text = 'DRAFT' AND "scheduledFor" IS NULL AND "scheduleTimezone" IS NULL AND "scheduleLocalDateTime" IS NULL AND "canceledAt" IS NULL) OR
  ("status"::text = 'SCHEDULED' AND "scheduledFor" IS NOT NULL AND "scheduleTimezone" IS NOT NULL AND "scheduleLocalDateTime" IS NOT NULL AND "canceledAt" IS NULL) OR
  ("status"::text = 'CANCELED' AND "scheduledFor" IS NOT NULL AND "scheduleTimezone" IS NOT NULL AND "scheduleLocalDateTime" IS NOT NULL AND "canceledAt" IS NOT NULL)
);
