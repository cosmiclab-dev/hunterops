-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('PREPARING', 'PENDING', 'APPROVED', 'SUBMITTED', 'FAILED');

-- CreateTable
CREATE TABLE "applications" (
    "id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'PREPARING',
    "answers" JSONB,
    "resume_id" UUID,
    "cover_letter" TEXT,
    "apply_url" TEXT,
    "embed_url" TEXT,
    "notes" JSONB NOT NULL DEFAULT '[]',
    "error" TEXT,
    "auto" BOOLEAN NOT NULL DEFAULT false,
    "prepared_at" TIMESTAMP(3),
    "approved_at" TIMESTAMP(3),
    "submitted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "applications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "applications_job_id_key" ON "applications"("job_id");

-- CreateIndex
CREATE INDEX "applications_status_idx" ON "applications"("status");

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
