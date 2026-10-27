// Migration 002_v2: job feed, settings store, profile/resumes, contacts/emails, richer tracker.
export default `
ALTER TABLE saved_jobs DROP CONSTRAINT IF EXISTS saved_jobs_status_check;
ALTER TABLE saved_jobs ADD CONSTRAINT saved_jobs_status_check
    CHECK (status IN ('discovered', 'applied', 'contacted', 'screening', 'interview', 'offer', 'rejected', 'withdrawn'));
ALTER TABLE saved_jobs ADD COLUMN IF NOT EXISTS applied_at TIMESTAMPTZ;
ALTER TABLE saved_jobs ADD COLUMN IF NOT EXISTS follow_up_on DATE;
ALTER TABLE saved_jobs ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE saved_jobs ADD COLUMN IF NOT EXISTS salary TEXT;
ALTER TABLE saved_jobs ADD COLUMN IF NOT EXISTS match_score INT;
ALTER TABLE saved_jobs ADD COLUMN IF NOT EXISTS resume_id UUID;
ALTER TABLE saved_jobs ADD COLUMN IF NOT EXISTS source TEXT;

CREATE TABLE IF NOT EXISTS job_events (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id      UUID NOT NULL REFERENCES saved_jobs(id) ON DELETE CASCADE,
    kind        TEXT NOT NULL,
    detail      TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS job_events_job_idx ON job_events (job_id, created_at DESC);

CREATE TABLE IF NOT EXISTS app_settings (
    key         TEXT PRIMARY KEY,
    value       TEXT NOT NULL,
    is_secret   BOOLEAN NOT NULL DEFAULT false,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS companies (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name             TEXT NOT NULL,
    ats_type         TEXT NOT NULL,
    ats_slug         TEXT NOT NULL,
    domain           TEXT,
    active           BOOLEAN NOT NULL DEFAULT true,
    last_scanned_at  TIMESTAMPTZ,
    last_status      TEXT,
    last_error       TEXT,
    last_found       INT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT companies_ats_unique UNIQUE (ats_type, ats_slug)
);

CREATE TABLE IF NOT EXISTS job_feed (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source         TEXT NOT NULL,
    company        TEXT NOT NULL,
    company_id     UUID REFERENCES companies(id) ON DELETE SET NULL,
    title          TEXT NOT NULL,
    location       TEXT,
    location_class TEXT,
    url            TEXT NOT NULL,
    posted_at      TIMESTAMPTZ,
    first_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    description    TEXT,
    salary         TEXT,
    status         TEXT NOT NULL DEFAULT 'new',
    job_id         UUID REFERENCES saved_jobs(id) ON DELETE SET NULL,
    match_score    INT,
    CONSTRAINT job_feed_status_check CHECK (status IN ('new', 'saved', 'dismissed'))
);
CREATE UNIQUE INDEX IF NOT EXISTS job_feed_url_key ON job_feed (url);
CREATE INDEX IF NOT EXISTS job_feed_seen_idx ON job_feed (first_seen_at DESC);
CREATE INDEX IF NOT EXISTS job_feed_status_idx ON job_feed (status);

CREATE TABLE IF NOT EXISTS scan_runs (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trigger      TEXT NOT NULL,
    started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at  TIMESTAMPTZ,
    sources      INT,
    fetched      INT,
    matched      INT,
    inserted     INT,
    errors       JSONB
);

CREATE TABLE IF NOT EXISTS profile (
    id          INT PRIMARY KEY DEFAULT 1,
    data        JSONB NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT profile_single_row CHECK (id = 1)
);

CREATE TABLE IF NOT EXISTS resumes (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    job_id      UUID REFERENCES saved_jobs(id) ON DELETE SET NULL,
    template    TEXT NOT NULL DEFAULT 'classic',
    data        JSONB NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS jd_analyses (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id      UUID REFERENCES saved_jobs(id) ON DELETE SET NULL,
    title       TEXT,
    company     TEXT,
    jd_text     TEXT NOT NULL,
    score       INT,
    result      JSONB NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS contacts (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company          TEXT NOT NULL,
    domain           TEXT,
    name             TEXT,
    title            TEXT,
    email            TEXT,
    email_confidence INT,
    linkedin         TEXT,
    source           TEXT NOT NULL DEFAULT 'manual',
    job_id           UUID REFERENCES saved_jobs(id) ON DELETE SET NULL,
    notes            TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS contacts_email_key ON contacts (lower(email)) WHERE email IS NOT NULL;

CREATE TABLE IF NOT EXISTS emails (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_id   UUID REFERENCES contacts(id) ON DELETE SET NULL,
    job_id       UUID REFERENCES saved_jobs(id) ON DELETE SET NULL,
    to_email     TEXT NOT NULL,
    subject      TEXT NOT NULL,
    body         TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'draft',
    error        TEXT,
    message_id   TEXT,
    follow_up_of UUID REFERENCES emails(id) ON DELETE SET NULL,
    sent_at      TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT emails_status_check CHECK (status IN ('draft', 'sent', 'failed'))
);
CREATE INDEX IF NOT EXISTS emails_created_idx ON emails (created_at DESC);
`;
