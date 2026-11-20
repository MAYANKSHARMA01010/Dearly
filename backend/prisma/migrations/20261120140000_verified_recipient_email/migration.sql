ALTER TABLE "users" ADD COLUMN "verifiedEmail" TEXT, ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "users_verifiedEmail_key" ON "users"("verifiedEmail");
CREATE TABLE "email_verifications" (
 "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "email" VARCHAR(254) NOT NULL,
 "codeHash" CHAR(64) NOT NULL, "attempts" INTEGER NOT NULL DEFAULT 0,
 "dispatchStatus" TEXT NOT NULL DEFAULT 'PENDING', "expiresAt" TIMESTAMPTZ(3) NOT NULL,
 "consumedAt" TIMESTAMPTZ(3), "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "email_verifications_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "email_verifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "email_verifications_userId_createdAt_idx" ON "email_verifications"("userId", "createdAt");
CREATE INDEX "email_verifications_email_createdAt_idx" ON "email_verifications"("email", "createdAt");
