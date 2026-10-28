-- The employer's own posting for a job board listing (Adzuna and the like).
-- Not copied from older applications: some matched the wrong company.
ALTER TABLE "jobs" ADD COLUMN "employer_url" TEXT;
