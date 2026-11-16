-- CreateEnum
CREATE TYPE "AttachmentState" AS ENUM ('PENDING', 'UPLOADING', 'UPLOADED', 'READY', 'DELETING');

-- CreateTable
CREATE TABLE "attachments" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "draftId" TEXT,
    "name" VARCHAR(120) NOT NULL,
    "mime" VARCHAR(80) NOT NULL,
    "bytes" INTEGER NOT NULL,
    "state" "AttachmentState" NOT NULL DEFAULT 'PENDING',
    "attemptId" TEXT,
    "sha256" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attachments_ownerId_draftId_state_idx" ON "attachments"("ownerId", "draftId", "state");

-- CreateIndex
CREATE INDEX "attachments_state_expiresAt_idx" ON "attachments"("state", "expiresAt");

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "draft_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Keep reservations bounded even for direct database writes.
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_bytes_bounded" CHECK ("bytes" > 0 AND "bytes" <= 52428800);
