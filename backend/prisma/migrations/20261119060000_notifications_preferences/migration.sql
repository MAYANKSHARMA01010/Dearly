-- CreateTable
CREATE TABLE "account_preferences" (
    "userId" TEXT NOT NULL,
    "inAppAlerts" BOOLEAN NOT NULL DEFAULT true,
    "pushAlerts" BOOLEAN NOT NULL DEFAULT false,
    "defaultPhoneChannel" VARCHAR(16) NOT NULL DEFAULT 'WHATSAPP',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_preferences_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "dedupeKey" VARCHAR(180) NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" VARCHAR(48) NOT NULL,
    "targetId" TEXT NOT NULL,
    "targetType" VARCHAR(16) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMPTZ(3),

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_devices" (
    "id" VARCHAR(36) NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "token" VARCHAR(255) NOT NULL,
    "platform" VARCHAR(8) NOT NULL,
    "disabledAt" TIMESTAMPTZ(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "push_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_jobs" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "state" VARCHAR(24) NOT NULL DEFAULT 'READY',
    "ticketId" VARCHAR(128),
    "errorCode" VARCHAR(48),
    "submittedAt" TIMESTAMPTZ(3),
    "checkedAt" TIMESTAMPTZ(3),

    CONSTRAINT "push_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notifications_dedupeKey_key" ON "notifications"("dedupeKey");

-- CreateIndex
CREATE INDEX "notifications_userId_createdAt_id_idx" ON "notifications"("userId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "push_devices_token_key" ON "push_devices"("token");

-- CreateIndex
CREATE INDEX "push_devices_sessionId_idx" ON "push_devices"("sessionId");

-- CreateIndex
CREATE INDEX "push_jobs_state_submittedAt_idx" ON "push_jobs"("state", "submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "push_jobs_notificationId_deviceId_key" ON "push_jobs"("notificationId", "deviceId");

-- AddForeignKey
ALTER TABLE "account_preferences" ADD CONSTRAINT "account_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_devices" ADD CONSTRAINT "push_devices_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_devices" ADD CONSTRAINT "push_devices_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_jobs" ADD CONSTRAINT "push_jobs_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_jobs" ADD CONSTRAINT "push_jobs_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "push_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

