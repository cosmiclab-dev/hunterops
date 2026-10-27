-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('NEW', 'SAVED', 'APPLIED', 'INTERVIEW', 'OFFER', 'REJECTED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "WorkMode" AS ENUM ('REMOTE', 'HYBRID', 'ONSITE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('DRAFT', 'APPROVED', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "profile" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT NOT NULL DEFAULT '',
    "headline" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "location" TEXT NOT NULL DEFAULT '',
    "linkedin" TEXT NOT NULL DEFAULT '',
    "portfolio" TEXT NOT NULL DEFAULT '',
    "summary" TEXT NOT NULL DEFAULT '',
    "years_experience" DOUBLE PRECISION,
    "skills" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "accept_remote" BOOLEAN NOT NULL DEFAULT true,
    "accept_hybrid" BOOLEAN NOT NULL DEFAULT true,
    "onsite_cities" TEXT[] DEFAULT ARRAY['Bengaluru']::TEXT[],
    "data" JSONB NOT NULL DEFAULT '{}',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companies" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "ats_type" TEXT NOT NULL,
    "ats_slug" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "last_scanned_at" TIMESTAMP(3),
    "last_status" TEXT,
    "last_error" TEXT,
    "last_found" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" UUID NOT NULL,
    "source" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "company_id" UUID,
    "title" TEXT NOT NULL,
    "location" TEXT,
    "location_class" TEXT,
    "work_mode" "WorkMode" NOT NULL DEFAULT 'UNKNOWN',
    "url" TEXT NOT NULL,
    "posted_at" TIMESTAMP(3),
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT,
    "salary" TEXT,
    "status" "JobStatus" NOT NULL DEFAULT 'NEW',
    "grill_score" INTEGER,
    "grill_breakdown" JSONB,
    "grilled_at" TIMESTAMP(3),
    "notes" TEXT,
    "applied_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resumes" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "job_id" UUID,
    "density" TEXT NOT NULL DEFAULT 'standard',
    "data" JSONB NOT NULL,
    "slop_score" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "resumes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacts" (
    "id" UUID NOT NULL,
    "company" TEXT NOT NULL,
    "name" TEXT,
    "title" TEXT,
    "email" TEXT,
    "linkedin" TEXT,
    "job_id" UUID,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "emails" (
    "id" UUID NOT NULL,
    "job_id" UUID,
    "contact_id" UUID,
    "kind" TEXT NOT NULL DEFAULT 'cold',
    "framework" TEXT NOT NULL DEFAULT 'plain',
    "to_email" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "EmailStatus" NOT NULL DEFAULT 'DRAFT',
    "slop_score" INTEGER,
    "error" TEXT,
    "message_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "emails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scan_runs" (
    "id" UUID NOT NULL,
    "trigger" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "sources" INTEGER,
    "fetched" INTEGER,
    "matched" INTEGER,
    "inserted" INTEGER,
    "errors" JSONB,

    CONSTRAINT "scan_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_settings" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "is_secret" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "companies_ats_type_ats_slug_key" ON "companies"("ats_type", "ats_slug");

-- CreateIndex
CREATE UNIQUE INDEX "jobs_url_key" ON "jobs"("url");

-- CreateIndex
CREATE INDEX "jobs_status_first_seen_at_idx" ON "jobs"("status", "first_seen_at" DESC);

-- CreateIndex
CREATE INDEX "jobs_grill_score_idx" ON "jobs"("grill_score" DESC);

-- CreateIndex
CREATE INDEX "emails_created_at_idx" ON "emails"("created_at" DESC);

-- CreateIndex
CREATE INDEX "scan_runs_started_at_idx" ON "scan_runs"("started_at" DESC);

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resumes" ADD CONSTRAINT "resumes_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emails" ADD CONSTRAINT "emails_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emails" ADD CONSTRAINT "emails_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

