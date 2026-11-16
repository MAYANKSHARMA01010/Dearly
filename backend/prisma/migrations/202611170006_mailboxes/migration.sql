-- CreateEnum
CREATE TYPE "MessageEventKind" AS ENUM ('BASELINE', 'CREATED', 'EDITED', 'SCHEDULED', 'RESCHEDULED', 'CANCELED', 'REOPENED', 'DISPATCH_STARTED', 'RETRY_SCHEDULED', 'RETRY_REQUESTED', 'DELIVERED', 'PARTIALLY_DELIVERED', 'FAILED', 'OPENED');

-- AlterTable
ALTER TABLE "inbox_items" ADD COLUMN     "openedAt" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "message_events" (
    "id" TEXT NOT NULL,
    "sequence" BIGSERIAL NOT NULL,
    "messageId" TEXT NOT NULL,
    "kind" "MessageEventKind" NOT NULL,
    "state" "MessageStatus" NOT NULL,
    "version" INTEGER NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "message_events_sequence_key" ON "message_events"("sequence");

-- CreateIndex
CREATE INDEX "message_events_messageId_sequence_idx" ON "message_events"("messageId", "sequence");

-- AddForeignKey
ALTER TABLE "message_events" ADD CONSTRAINT "message_events_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "draft_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Record the current state without inventing history for pre-tracking messages.
INSERT INTO "message_events" ("id", "messageId", "kind", "state", "version", "occurredAt")
SELECT gen_random_uuid()::text, "id", 'BASELINE', "status", "version", clock_timestamp()
FROM "draft_messages";
ALTER TABLE "message_events" ADD CONSTRAINT "message_events_positive_version" CHECK ("version" > 0);
ALTER TABLE "inbox_items" ADD CONSTRAINT "inbox_items_open_after_delivery" CHECK ("openedAt" IS NULL OR "openedAt" >= "deliveredAt");
