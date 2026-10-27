// HunterOps data API on Neon Postgres (HTTP driver, no connection pool to exhaust).
//
//   GET    /api/jobs[?status=contacted]   list leads, newest first
//   POST   /api/jobs                      add a discovered lead
//   PATCH  /api/jobs/:id                  update status and/or notes
//   DELETE /api/jobs/:id                  remove a lead (and its outreach log)
//   GET    /api/outreach[?job_id=uuid]    list outreach log, newest first
//   POST   /api/outreach                  save a sent message
//   GET    /api/health                    which env vars are configured, and DB reachability
import { neon } from '@neondatabase/serverless';
import { HttpError, json, readJson, requireAccess, handleError, str } from '../lib/http.js';
import { ATS_TYPES, detectAts } from '../lib/ats.js';
import { modelConfig, OPENCODE_GO_CHAT_MODELS } from '../lib/models.js';

export const STATUSES = ['discovered', 'contacted', 'screening', 'rejected', 'offer'];
export const CHANNELS = ['linkedin_dm', 'email', 'referral'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let cachedSql;
function getSql() {
  if (!process.env.DATABASE_URL) {
    throw new HttpError(503, 'DATABASE_URL is not set. Add it in Netlify > Site configuration > Environment variables.');
  }
  cachedSql ??= neon(process.env.DATABASE_URL);
  return cachedSql;
}

// Works for both the rewritten path (/.netlify/functions/db/jobs/<id>) and the
// original one (/api/jobs/<id>): find the resource segment, take what follows.
function route(req) {
  const parts = new URL(req.url).pathname.split('/').filter(Boolean);
  const idx = parts.findIndex((p) => p === 'jobs' || p === 'outreach' || p === 'health');
  if (idx === -1) return { resource: null, id: null };
  return { resource: parts[idx], id: parts[idx + 1] ? decodeURIComponent(parts[idx + 1]) : null };
}

function assertUuid(id, field = 'id') {
  if (!id || !UUID_RE.test(id)) throw new HttpError(400, `"${field}" must be a UUID.`);
  return id.toLowerCase();
}

function httpUrl(value, field) {
  const v = str(value, field, { required: true, max: 2048 });
  let parsed;
  try {
    parsed = new URL(v);
  } catch {
    throw new HttpError(400, `"${field}" must be a full URL starting with https://`);
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new HttpError(400, `"${field}" must be an http(s) URL.`);
  }
  return parsed.toString();
}

// ---- jobs ----------------------------------------------------------------

async function listJobs(sql, url) {
  const status = url.searchParams.get('status');
  if (status && !STATUSES.includes(status)) {
    throw new HttpError(400, `"status" must be one of: ${STATUSES.join(', ')}.`);
  }
  const rows = await sql`
    SELECT j.*,
           COALESCE(o.outreach_count, 0)::int AS outreach_count,
           o.last_outreach_at
    FROM saved_jobs j
    LEFT JOIN (
      SELECT job_id, COUNT(*) AS outreach_count, MAX(sent_at) AS last_outreach_at
      FROM outreach_logs GROUP BY job_id
    ) o ON o.job_id = j.id
    WHERE (${status}::text IS NULL OR j.status = ${status})
    ORDER BY j.discovered_at DESC
    LIMIT 500`;
  return json(200, { jobs: rows });
}

async function createJob(sql, req) {
  const body = await readJson(req);
  const title = str(body.title, 'title', { required: true, max: 300 });
  const company = str(body.company, 'company', { required: true, max: 200 });
  const url = httpUrl(body.url, 'url');
  const location = str(body.location, 'location', { max: 200 });
  const notes = str(body.notes, 'notes', { max: 5000 });
  let atsType = str(body.ats_type, 'ats_type', { max: 40 });
  atsType = atsType ? atsType.toLowerCase() : detectAts(url);
  if (!ATS_TYPES.includes(atsType)) {
    throw new HttpError(400, `"ats_type" must be one of: ${ATS_TYPES.join(', ')}.`);
  }
  const status = str(body.status, 'status', { max: 20 }) || 'discovered';
  if (!STATUSES.includes(status)) throw new HttpError(400, `"status" must be one of: ${STATUSES.join(', ')}.`);

  const inserted = await sql`
    INSERT INTO saved_jobs (title, company, ats_type, url, location, status, notes)
    VALUES (${title}, ${company}, ${atsType}, ${url}, ${location}, ${status}, ${notes})
    ON CONFLICT (url) DO NOTHING
    RETURNING *`;
  if (inserted.length === 0) {
    const [existing] = await sql`SELECT * FROM saved_jobs WHERE url = ${url}`;
    return json(409, { error: `Already in your pipeline: ${existing.title} at ${existing.company} (${existing.status}).`, job: existing });
  }
  return json(201, { job: { ...inserted[0], outreach_count: 0, last_outreach_at: null } });
}

async function updateJob(sql, req, id) {
  const jobId = assertUuid(id);
  const body = await readJson(req);
  const hasStatus = Object.hasOwn(body, 'status');
  const hasNotes = Object.hasOwn(body, 'notes');
  if (!hasStatus && !hasNotes) throw new HttpError(400, 'Send "status" and/or "notes" to update.');

  const status = hasStatus ? str(body.status, 'status', { required: true, max: 20 }) : null;
  if (hasStatus && !STATUSES.includes(status)) {
    throw new HttpError(400, `"status" must be one of: ${STATUSES.join(', ')}.`);
  }
  // notes: "" or null clears them; absent leaves them alone.
  const notes = hasNotes ? (str(body.notes, 'notes', { max: 5000 }) ?? '') : null;

  const rows = await sql`
    UPDATE saved_jobs SET
      status = COALESCE(${status}::text, status),
      notes = CASE WHEN ${hasNotes}::boolean THEN NULLIF(${notes}::text, '') ELSE notes END,
      updated_at = now()
    WHERE id = ${jobId}
    RETURNING *`;
  if (rows.length === 0) throw new HttpError(404, 'Job not found.');
  return json(200, { job: rows[0] });
}

async function deleteJob(sql, id) {
  const jobId = assertUuid(id);
  const rows = await sql`DELETE FROM saved_jobs WHERE id = ${jobId} RETURNING id`;
  if (rows.length === 0) throw new HttpError(404, 'Job not found.');
  return json(200, { deleted: rows[0].id });
}

// ---- outreach ------------------------------------------------------------

async function listOutreach(sql, url) {
  const jobIdParam = url.searchParams.get('job_id');
  const jobId = jobIdParam ? assertUuid(jobIdParam, 'job_id') : null;
  const rows = await sql`
    SELECT o.*, j.title AS job_title, j.company AS job_company
    FROM outreach_logs o
    LEFT JOIN saved_jobs j ON j.id = o.job_id
    WHERE (${jobId}::uuid IS NULL OR o.job_id = ${jobId}::uuid)
    ORDER BY o.sent_at DESC
    LIMIT 200`;
  return json(200, { outreach: rows });
}

async function createOutreach(sql, req) {
  const body = await readJson(req);
  const jobId = body.job_id ? assertUuid(String(body.job_id), 'job_id') : null;
  const recipientRole = str(body.recipient_role, 'recipient_role', { required: true, max: 120 });
  const channel = str(body.channel, 'channel', { required: true, max: 20 });
  if (!CHANNELS.includes(channel)) throw new HttpError(400, `"channel" must be one of: ${CHANNELS.join(', ')}.`);
  const message = str(body.message_sent, 'message_sent', { required: true, max: 4000 });
  const advance = body.mark_contacted === true;

  if (jobId) {
    const exists = await sql`SELECT id FROM saved_jobs WHERE id = ${jobId}`;
    if (exists.length === 0) throw new HttpError(404, 'Linked job not found. It may have been deleted.');
  }

  // Log the message and, if asked, move a still-"discovered" lead to "contacted".
  const queries = [
    sql`INSERT INTO outreach_logs (job_id, recipient_role, channel, message_sent)
        VALUES (${jobId}, ${recipientRole}, ${channel}, ${message})
        RETURNING *`,
  ];
  if (jobId && advance) {
    queries.push(sql`
      UPDATE saved_jobs SET status = 'contacted', updated_at = now()
      WHERE id = ${jobId} AND status = 'discovered'
      RETURNING *`);
  }
  const [inserted, advanced] = await sql.transaction(queries);
  return json(201, { outreach: inserted[0], job: advanced?.[0] ?? null });
}

// ---- health --------------------------------------------------------------

async function health() {
  const models = modelConfig();
  const result = {
    database: { configured: Boolean(process.env.DATABASE_URL), reachable: false },
    ai: {
      // True when the server has its own key. Users can also bring a key in Settings.
      configured: Boolean(process.env.OPENCODE_API_KEY),
      model: models.defaultModel,
      models: models.allowed,
      catalog: OPENCODE_GO_CHAT_MODELS,
    },
    access_gate: Boolean(process.env.APP_ACCESS_TOKEN),
  };
  if (result.database.configured) {
    try {
      const sql = getSql();
      const [row] = await sql`SELECT to_regclass('public.saved_jobs') IS NOT NULL AS has_schema`;
      result.database.reachable = true;
      result.database.schema_ready = row.has_schema;
    } catch (err) {
      console.error('[db health]', err);
      result.database.error = 'Could not reach Neon with DATABASE_URL.';
    }
  }
  return json(200, result);
}

// ---- entry ---------------------------------------------------------------

export default async (req) => {
  try {
    requireAccess(req);
    const url = new URL(req.url);
    const { resource, id } = route(req);
    const method = req.method.toUpperCase();

    if (resource === 'health' && method === 'GET') return await health();

    if (resource === 'jobs') {
      const sql = getSql();
      if (!id && method === 'GET') return await listJobs(sql, url);
      if (!id && method === 'POST') return await createJob(sql, req);
      if (id && method === 'PATCH') return await updateJob(sql, req, id);
      if (id && method === 'DELETE') return await deleteJob(sql, id);
      throw new HttpError(405, `${method} is not supported on this path.`);
    }

    if (resource === 'outreach') {
      const sql = getSql();
      if (!id && method === 'GET') return await listOutreach(sql, url);
      if (!id && method === 'POST') return await createOutreach(sql, req);
      throw new HttpError(405, `${method} is not supported on this path.`);
    }

    throw new HttpError(404, 'Unknown API path. Use /api/jobs, /api/outreach or /api/health.');
  } catch (err) {
    return handleError(err, 'db');
  }
};
