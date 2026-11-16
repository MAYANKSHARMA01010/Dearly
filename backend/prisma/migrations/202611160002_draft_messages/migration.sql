-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('DRAFT');

-- CreateEnum
CREATE TYPE "RecipientType" AS ENUM ('SELF', 'USER', 'PHONE', 'EMAIL');

-- CreateTable
CREATE TABLE "draft_messages" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "status" "MessageStatus" NOT NULL DEFAULT 'DRAFT',
    "subject" VARCHAR(160),
    "text" TEXT NOT NULL DEFAULT '',
    "occasion" VARCHAR(80),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "draft_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "draft_recipients" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "type" "RecipientType" NOT NULL,
    "destinationKey" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "label" VARCHAR(80),
    "targetUserId" TEXT,
    "phone" VARCHAR(16),
    "country" CHAR(2),
    "email" VARCHAR(254),

    CONSTRAINT "draft_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "draft_messages_ownerId_status_createdAt_id_idx" ON "draft_messages"("ownerId", "status", "createdAt", "id");

-- CreateIndex
CREATE INDEX "draft_recipients_messageId_position_idx" ON "draft_recipients"("messageId", "position");

-- CreateIndex
CREATE INDEX "draft_recipients_targetUserId_idx" ON "draft_recipients"("targetUserId");

-- CreateIndex
CREATE UNIQUE INDEX "draft_recipients_messageId_destinationKey_key" ON "draft_recipients"("messageId", "destinationKey");

-- AddForeignKey
ALTER TABLE "draft_messages" ADD CONSTRAINT "draft_messages_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "draft_recipients" ADD CONSTRAINT "draft_recipients_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "draft_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "draft_recipients" ADD CONSTRAINT "draft_recipients_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Keep directly written records within the same bounds as the API.
ALTER TABLE "draft_messages" ADD CONSTRAINT "draft_messages_version_positive" CHECK ("version" > 0);
ALTER TABLE "draft_messages" ADD CONSTRAINT "draft_messages_text_bounded" CHECK (char_length("text") <= 20000);
ALTER TABLE "draft_recipients" ADD CONSTRAINT "draft_recipients_position_nonnegative" CHECK ("position" >= 0);
-- User targets may become null after account deletion. That does not authorize
-- another account or convert them to phone/email recipients.
ALTER TABLE "draft_recipients" ADD CONSTRAINT "draft_recipients_destination_shape" CHECK (
  ("type" IN ('SELF', 'USER') AND "phone" IS NULL AND "country" IS NULL AND "email" IS NULL) OR
  ("type" = 'PHONE' AND "targetUserId" IS NULL AND "phone" IS NOT NULL AND "country" IS NOT NULL AND "email" IS NULL) OR
  ("type" = 'EMAIL' AND "targetUserId" IS NULL AND "phone" IS NULL AND "country" IS NULL AND "email" IS NOT NULL)
);
