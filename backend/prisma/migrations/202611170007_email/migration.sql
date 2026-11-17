-- CreateEnum
CREATE TYPE "EmailState" AS ENUM ('SUBMITTING', 'ACCEPTED', 'REJECTED', 'RETRYABLE', 'UNKNOWN');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "MessageStatus" ADD VALUE 'SUBMITTED';
ALTER TYPE "MessageStatus" ADD VALUE 'PARTIALLY_SUBMITTED';
ALTER TYPE "MessageStatus" ADD VALUE 'DELIVERY_UNKNOWN';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "MessageEventKind" ADD VALUE 'SUBMITTED';
ALTER TYPE "MessageEventKind" ADD VALUE 'PARTIALLY_SUBMITTED';
ALTER TYPE "MessageEventKind" ADD VALUE 'DELIVERY_UNKNOWN';

-- CreateTable
CREATE TABLE "email_deliveries" (
    "id" TEXT NOT NULL,
    "intentId" TEXT NOT NULL,
    "state" "EmailState" NOT NULL DEFAULT 'SUBMITTING',
    "providerMessageId" VARCHAR(255),
    "errorCode" VARCHAR(40),
    "submittedAt" TIMESTAMPTZ(3),
    "openedAt" TIMESTAMPTZ(3),
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_budgets" (
    "id" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "resetsAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "email_budgets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "email_deliveries_intentId_key" ON "email_deliveries"("intentId");

-- AddForeignKey
ALTER TABLE "email_deliveries" ADD CONSTRAINT "email_deliveries_intentId_fkey" FOREIGN KEY ("intentId") REFERENCES "delivery_intents"("id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "draft_messages" DROP CONSTRAINT "draft_messages_schedule_shape";
ALTER TABLE "draft_messages" ADD CONSTRAINT "draft_messages_schedule_shape" CHECK (
  ("status"::text = 'DRAFT' AND "scheduledFor" IS NULL AND "scheduleTimezone" IS NULL AND "scheduleLocalDateTime" IS NULL AND "canceledAt" IS NULL AND NOT "deliveryEnabled") OR
  ("status"::text IN ('SCHEDULED','DISPATCHING','DELIVERED','PARTIALLY_DELIVERED','FAILED','SUBMITTED','PARTIALLY_SUBMITTED','DELIVERY_UNKNOWN') AND "scheduledFor" IS NOT NULL AND "scheduleTimezone" IS NOT NULL AND "scheduleLocalDateTime" IS NOT NULL AND "canceledAt" IS NULL) OR
  ("status"::text = 'CANCELED' AND "scheduledFor" IS NOT NULL AND "scheduleTimezone" IS NOT NULL AND "scheduleLocalDateTime" IS NOT NULL AND "canceledAt" IS NOT NULL)
);
ALTER TABLE "email_budgets" ADD CONSTRAINT "email_budget_nonnegative" CHECK ("count" >= 0);
