-- CreateTable
CREATE TABLE "email_relay_submissions" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(3),
    "result" JSONB,

    CONSTRAINT "email_relay_submissions_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "email_relay_submissions" ADD CONSTRAINT "email_relay_submissions_id_fkey" FOREIGN KEY ("id") REFERENCES "email_deliveries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

