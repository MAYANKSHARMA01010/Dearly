CREATE TABLE "operations_runs" (
  "id" UUID NOT NULL,
  "state" VARCHAR(16) NOT NULL,
  "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMPTZ(3),
  "counts" JSONB,
  CONSTRAINT "operations_runs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "operations_runs_state" CHECK ("state" IN ('RUNNING','SUCCEEDED','FAILED','INTERRUPTED'))
);
CREATE INDEX "operations_runs_startedAt_idx" ON "operations_runs"("startedAt");
