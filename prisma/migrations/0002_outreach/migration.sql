-- CreateTable
CREATE TABLE "outreach_logs" (
    "id" UUID NOT NULL,
    "job_id" UUID,
    "company" TEXT NOT NULL,
    "recipient_name" TEXT,
    "recipient_role" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'linkedin_dm',
    "kind" TEXT NOT NULL DEFAULT 'custom',
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'drafted',
    "sent_at" TIMESTAMP(3),
    "follow_up_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outreach_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "outreach_logs_created_at_idx" ON "outreach_logs"("created_at" DESC);

-- CreateIndex
CREATE INDEX "outreach_logs_status_follow_up_at_idx" ON "outreach_logs"("status", "follow_up_at");

-- AddForeignKey
ALTER TABLE "outreach_logs" ADD CONSTRAINT "outreach_logs_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

