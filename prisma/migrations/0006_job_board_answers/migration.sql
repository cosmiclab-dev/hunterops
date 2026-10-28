-- Applications prepared from a job board's own page (Adzuna's country picker)
-- instead of the employer's form go back to "try again", so they are prepared
-- again from the employer's posting or the standard questions.
UPDATE "applications"
SET "status" = 'FAILED',
    "error" = 'This was prepared from the job board''s page, not the employer''s form. Tap Try again.'
WHERE "status" IN ('PENDING', 'APPROVED')
  AND "answers" @> '[{"key": "country-selector"}]'::jsonb;
