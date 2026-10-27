// Migration 001_init. Plain SQL, kept as a JS module so it ships inside the function bundle.
export default `
-- HunterOps v1 schema
-- Neon Postgres schema. Idempotent: safe to run more than once.
-- gen_random_uuid() is built into Postgres 13+, which every Neon project runs.

CREATE TABLE IF NOT EXISTS users (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email       TEXT UNIQUE,
    created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS saved_jobs (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title          TEXT NOT NULL,
    company        TEXT NOT NULL,
    ats_type       TEXT NOT NULL,          -- greenhouse, ashby, lever, smartrecruiters, workday, successfactors, darwinbox, keka, zoho, other
    url            TEXT NOT NULL,
    location       TEXT,
    status         TEXT DEFAULT 'discovered',  -- discovered, contacted, screening, rejected, offer
    discovered_at  TIMESTAMPTZ DEFAULT now(),
    notes          TEXT,
    updated_at     TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT saved_jobs_status_check
        CHECK (status IN ('discovered', 'contacted', 'screening', 'rejected', 'offer'))
);

-- One row per posting URL, so the same lead can't be added twice.
CREATE UNIQUE INDEX IF NOT EXISTS saved_jobs_url_key ON saved_jobs (url);
CREATE INDEX IF NOT EXISTS saved_jobs_status_idx ON saved_jobs (status);
CREATE INDEX IF NOT EXISTS saved_jobs_discovered_at_idx ON saved_jobs (discovered_at DESC);

CREATE TABLE IF NOT EXISTS outreach_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id          UUID REFERENCES saved_jobs(id) ON DELETE CASCADE,
    recipient_role  TEXT NOT NULL,
    channel         TEXT NOT NULL,         -- linkedin_dm, email, referral
    message_sent    TEXT NOT NULL,
    sent_at         TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT outreach_logs_channel_check
        CHECK (channel IN ('linkedin_dm', 'email', 'referral'))
);

CREATE INDEX IF NOT EXISTS outreach_logs_job_id_idx ON outreach_logs (job_id);
CREATE INDEX IF NOT EXISTS outreach_logs_sent_at_idx ON outreach_logs (sent_at DESC);
`;
