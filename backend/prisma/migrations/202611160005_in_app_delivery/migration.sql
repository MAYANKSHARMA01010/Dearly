-- CreateEnum
CREATE TYPE "WorkState" AS ENUM ('READY', 'RUNNING', 'SUCCEEDED', 'FAILED', 'OBSOLETE');

-- CreateEnum
CREATE TYPE "AttemptState" AS ENUM ('STARTED', 'SUCCEEDED', 'RETRYABLE_FAILED', 'PERMANENT_FAILED', 'ABANDONED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "MessageStatus" ADD VALUE 'DISPATCHING';
ALTER TYPE "MessageStatus" ADD VALUE 'DELIVERED';
ALTER TYPE "MessageStatus" ADD VALUE 'PARTIALLY_DELIVERED';
ALTER TYPE "MessageStatus" ADD VALUE 'FAILED';

-- AlterTable
ALTER TABLE "draft_messages" ADD COLUMN     "deliveryEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "delivery_work" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "scheduleVersion" INTEGER NOT NULL,
    "state" "WorkState" NOT NULL DEFAULT 'READY',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "attemptLimit" INTEGER NOT NULL DEFAULT 5,
    "nextAttemptAt" TIMESTAMPTZ(3) NOT NULL,
    "leaseToken" TEXT,
    "leaseExpiresAt" TIMESTAMPTZ(3),
    "lastError" VARCHAR(40),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_work_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_attempts" (
    "id" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "intentId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "state" "AttemptState" NOT NULL DEFAULT 'STARTED',
    "errorCode" VARCHAR(40),
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMPTZ(3),

    CONSTRAINT "delivery_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inbox_items" (
    "id" TEXT NOT NULL,
    "intentId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deliveredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inbox_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "worker_heartbeats" (
    "id" TEXT NOT NULL,
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL,
    "stoppedAt" TIMESTAMPTZ(3),

    CONSTRAINT "worker_heartbeats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "delivery_work_state_nextAttemptAt_idx" ON "delivery_work"("state", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "delivery_work_state_leaseExpiresAt_idx" ON "delivery_work"("state", "leaseExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_work_messageId_scheduleVersion_key" ON "delivery_work"("messageId", "scheduleVersion");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_attempts_workId_intentId_number_key" ON "delivery_attempts"("workId", "intentId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "inbox_items_intentId_key" ON "inbox_items"("intentId");

-- CreateIndex
CREATE INDEX "inbox_items_userId_deliveredAt_id_idx" ON "inbox_items"("userId", "deliveredAt", "id");

-- CreateIndex
CREATE INDEX "worker_heartbeats_lastSeenAt_idx" ON "worker_heartbeats"("lastSeenAt");

-- AddForeignKey
ALTER TABLE "delivery_work" ADD CONSTRAINT "delivery_work_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "draft_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_attempts" ADD CONSTRAINT "delivery_attempts_workId_fkey" FOREIGN KEY ("workId") REFERENCES "delivery_work"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_attempts" ADD CONSTRAINT "delivery_attempts_intentId_fkey" FOREIGN KEY ("intentId") REFERENCES "delivery_intents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbox_items" ADD CONSTRAINT "inbox_items_intentId_fkey" FOREIGN KEY ("intentId") REFERENCES "delivery_intents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbox_items" ADD CONSTRAINT "inbox_items_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "draft_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbox_items" ADD CONSTRAINT "inbox_items_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Existing plans stay paused until explicitly reviewed again.
ALTER TABLE "draft_messages" DROP CONSTRAINT "draft_messages_schedule_shape";
ALTER TABLE "draft_messages" ADD CONSTRAINT "draft_messages_schedule_shape" CHECK (
  ("status"::text = 'DRAFT' AND "scheduledFor" IS NULL AND "scheduleTimezone" IS NULL AND "scheduleLocalDateTime" IS NULL AND "canceledAt" IS NULL AND NOT "deliveryEnabled") OR
  ("status"::text IN ('SCHEDULED', 'DISPATCHING', 'DELIVERED', 'PARTIALLY_DELIVERED', 'FAILED') AND "scheduledFor" IS NOT NULL AND "scheduleTimezone" IS NOT NULL AND "scheduleLocalDateTime" IS NOT NULL AND "canceledAt" IS NULL) OR
  ("status"::text = 'CANCELED' AND "scheduledFor" IS NOT NULL AND "scheduleTimezone" IS NOT NULL AND "scheduleLocalDateTime" IS NOT NULL AND "canceledAt" IS NOT NULL)
);
ALTER TABLE "delivery_work" ADD CONSTRAINT "delivery_work_attempt_bounds" CHECK ("attempts" >= 0 AND "attemptLimit" BETWEEN 5 AND 20 AND "attempts" <= "attemptLimit");
ALTER TABLE "delivery_work" ADD CONSTRAINT "delivery_work_lease_shape" CHECK (
  ("state"::text = 'RUNNING' AND "leaseToken" IS NOT NULL AND "leaseExpiresAt" IS NOT NULL) OR
  ("state"::text <> 'RUNNING' AND "leaseToken" IS NULL AND "leaseExpiresAt" IS NULL)
);

-- PHONE destinations may bind a verified account at explicit schedule confirmation.
ALTER TABLE "draft_recipients" DROP CONSTRAINT "draft_recipients_destination_shape";
ALTER TABLE "draft_recipients" ADD CONSTRAINT "draft_recipients_destination_shape" CHECK (
  ("type" IN ('SELF', 'USER') AND "phone" IS NULL AND "country" IS NULL AND "email" IS NULL) OR
  ("type" = 'PHONE' AND "phone" IS NOT NULL AND "country" IS NOT NULL AND "email" IS NULL) OR
  ("type" = 'EMAIL' AND "targetUserId" IS NULL AND "phone" IS NULL AND "country" IS NULL AND "email" IS NOT NULL)
);
