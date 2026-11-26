-- Scope deletion to newly tracked OTPs from the exact sender; no legacy backfill.
ALTER TABLE "otp_challenges"
  ADD COLUMN "deletionScope" TEXT,
  ADD COLUMN "deleteAfter" TIMESTAMP(3),
  ADD COLUMN "deleteAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "deletedAt" TIMESTAMP(3);
CREATE INDEX "otp_challenges_deletionScope_deleteAfter_idx"
  ON "otp_challenges"("deletionScope", "deleteAfter");
