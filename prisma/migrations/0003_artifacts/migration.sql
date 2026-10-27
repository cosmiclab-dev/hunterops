-- CreateTable
CREATE TABLE "artifacts" (
    "id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "cover_letter_text" TEXT,
    "resume_pdf_path" TEXT,
    "email_drafts" JSONB NOT NULL DEFAULT '[]',
    "autofill" JSONB,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "artifacts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "artifacts_job_id_key" ON "artifacts"("job_id");

-- AddForeignKey
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

