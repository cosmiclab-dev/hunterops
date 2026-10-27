// Pipeline tracker: saved jobs, timeline events, and the legacy outreach log.
import { HttpError, json, str } from '../http.js';
import { assertUuid } from '../db.js';
import { ATS_TYPES, detectAts } from '../ats.js';

export const STATUSES = ['discovered', 'applied', 'contacted', 'screening', 'interview', 'offer', 'rejected', 'withdrawn'];
export const CHANNELS = ['linkedin_dm', 'email', 'referral'];

export function httpUrl(value, field = 'url') {
  const v = str(value, field, { required: true, max: 2048 });
  let parsed;
  try {
    parsed = new URL(v);
  } catch {
    throw new HttpError(400, `"${field}" must be a full URL starting with https://`);
  }
  if (!['https:', 'http:'].includes(parsed.protocol)) throw new HttpError(400, `"${field}" must be an http(s) URL.`);
  return parsed.toString();
}

export async function addEvent(sql, jobId, kind, detail) {
  await sql`INSERT INTO job_events (job_id, kind, detail) VALUES (${jobId}, ${kind}, ${detail})`;
}

// Shared by POST /api/jobs, feed "save", and the iOS Shortcut capture.
export async function createJob(sql, input, { eventDetail = 'Added' } = {}) {
  const title = str(input.title, 'title', { required: true, max: 300 });
  const company = str(input.company, 'company', { required: true, max: 200 });
  const url = httpUrl(input.url);
  const location = str(input.location, 'location', { max: 200 });
  const notes = str(input.notes, 'notes', { max: 5000 });
  const description = str(input.description, 'description', { max: 60000 });
  const salary = str(input.salary, 'salary', { max: 200 });
  const source = str(input.source, 'source', { max: 40 });
  let atsType = str(input.ats_type, 'ats_type', { max: 40 });
  atsType = atsType ? atsType.toLowerCase() : detectAts(url);
  if (!ATS_TYPES.includes(atsType)) throw new HttpError(400, `"ats_type" must be one of: ${ATS_TYPES.join(', ')}.`);
  const status = str(input.status, 'status', { max: 20 }) || 'discovered';
  if (!STATUSES.includes(status)) throw new HttpError(400, `"status" must be one of: ${STATUSES.join(', ')}.`);

  const inserted = await sql`
    INSERT INTO saved_jobs (title, company, ats_type, url, location, status, notes, description, salary, source,
                            applied_at)
    VALUES (${title}, ${company}, ${atsType}, ${url}, ${location}, ${status}, ${notes}, ${description}, ${salary}, ${source},
            ${status === 'applied' ? new Date().toISOString() : null})
    ON CONFLICT (url) DO NOTHING
    RETURNING *`;
  if (!inserted.length) {
    const [existing] = await sql`SELECT * FROM saved_jobs WHERE url = ${url}`;
    return { job: existing, created: false };
  }
  await addEvent(sql, inserted[0].id, 'created', eventDetail);
  return { job: { ...inserted[0], outreach_count: 0 }, created: true };
}

async function list(ctx) {
  const status = ctx.url.searchParams.get('status');
  if (status && !STATUSES.includes(status)) throw new HttpError(400, `"status" must be one of: ${STATUSES.join(', ')}.`);
  const rows = await ctx.sql`
    SELECT j.id, j.title, j.company, j.ats_type, j.url, j.location, j.status, j.discovered_at, j.notes,
           j.updated_at, j.applied_at, j.follow_up_on, j.salary, j.match_score, j.resume_id, j.source,
           (j.description IS NOT NULL) AS has_description,
           COALESCE(o.n, 0)::int + COALESCE(e.n, 0)::int AS outreach_count
    FROM saved_jobs j
    LEFT JOIN (SELECT job_id, COUNT(*) n FROM outreach_logs GROUP BY job_id) o ON o.job_id = j.id
    LEFT JOIN (SELECT job_id, COUNT(*) n FROM emails WHERE status = 'sent' GROUP BY job_id) e ON e.job_id = j.id
    WHERE (${status}::text IS NULL OR j.status = ${status})
    ORDER BY j.discovered_at DESC
    LIMIT 1000`;
  return json(200, { jobs: rows });
}

async function create(ctx) {
  const { job, created } = await createJob(ctx.sql, await ctx.body(128 * 1024));
  if (!created) return json(409, { error: `Already in your pipeline: ${job.title} at ${job.company} (${job.status}).`, job });
  return json(201, { job });
}

async function get(ctx) {
  const id = assertUuid(ctx.params.id);
  const [job] = await ctx.sql`SELECT * FROM saved_jobs WHERE id = ${id}`;
  if (!job) throw new HttpError(404, 'Job not found.');
  const [events, emails, contacts] = await Promise.all([
    ctx.sql`SELECT * FROM job_events WHERE job_id = ${id} ORDER BY created_at DESC LIMIT 200`,
    ctx.sql`SELECT id, to_email, subject, status, sent_at, created_at FROM emails WHERE job_id = ${id} ORDER BY created_at DESC`,
    ctx.sql`SELECT * FROM contacts WHERE job_id = ${id} OR (job_id IS NULL AND lower(company) = lower(${job.company})) ORDER BY created_at DESC LIMIT 50`,
  ]);
  return json(200, { job, events, emails, contacts });
}

async function update(ctx) {
  const id = assertUuid(ctx.params.id);
  const body = await ctx.body(128 * 1024);
  const has = (k) => Object.hasOwn(body, k);
  const [before] = await ctx.sql`SELECT * FROM saved_jobs WHERE id = ${id}`;
  if (!before) throw new HttpError(404, 'Job not found.');

  const status = has('status') ? str(body.status, 'status', { required: true, max: 20 }) : before.status;
  if (!STATUSES.includes(status)) throw new HttpError(400, `"status" must be one of: ${STATUSES.join(', ')}.`);
  const notes = has('notes') ? str(body.notes, 'notes', { max: 5000 }) : before.notes;
  const description = has('description') ? str(body.description, 'description', { max: 60000 }) : before.description;
  const title = has('title') ? str(body.title, 'title', { required: true, max: 300 }) : before.title;
  const company = has('company') ? str(body.company, 'company', { required: true, max: 200 }) : before.company;
  const location = has('location') ? str(body.location, 'location', { max: 200 }) : before.location;
  let followUp = before.follow_up_on;
  if (has('follow_up_on')) {
    followUp = body.follow_up_on || null;
    if (followUp && !/^\d{4}-\d{2}-\d{2}$/.test(followUp)) throw new HttpError(400, '"follow_up_on" must be YYYY-MM-DD.');
  }
  const appliedAt = status === 'applied' && !before.applied_at ? new Date().toISOString() : before.applied_at;

  const [job] = await ctx.sql`
    UPDATE saved_jobs SET status = ${status}, notes = ${notes}, description = ${description}, title = ${title},
      company = ${company}, location = ${location}, follow_up_on = ${followUp}, applied_at = ${appliedAt},
      updated_at = now()
    WHERE id = ${id} RETURNING *`;
  if (status !== before.status) await addEvent(ctx.sql, id, 'status', `${before.status} → ${status}`);
  if (has('notes') && notes !== before.notes && notes) await addEvent(ctx.sql, id, 'note', notes.slice(0, 500));
  if (has('follow_up_on') && followUp !== before.follow_up_on && followUp) await addEvent(ctx.sql, id, 'follow_up', `Follow up on ${followUp}`);
  return json(200, { job });
}

async function remove(ctx) {
  const id = assertUuid(ctx.params.id);
  const rows = await ctx.sql`DELETE FROM saved_jobs WHERE id = ${id} RETURNING id`;
  if (!rows.length) throw new HttpError(404, 'Job not found.');
  return json(200, { deleted: rows[0].id });
}

async function addNote(ctx) {
  const id = assertUuid(ctx.params.id);
  const { kind = 'note', detail } = await ctx.body();
  const text = str(detail, 'detail', { required: true, max: 2000 });
  if (!['note', 'call', 'interview', 'email', 'applied'].includes(kind)) throw new HttpError(400, 'Unknown event kind.');
  await addEvent(ctx.sql, id, kind, text);
  return json(201, { ok: true });
}

// ---- legacy outreach log (LinkedIn DMs and referrals sent by hand) --------

async function listOutreach(ctx) {
  const jobIdParam = ctx.url.searchParams.get('job_id');
  const jobId = jobIdParam ? assertUuid(jobIdParam, 'job_id') : null;
  const rows = await ctx.sql`
    SELECT o.*, j.title AS job_title, j.company AS job_company
    FROM outreach_logs o LEFT JOIN saved_jobs j ON j.id = o.job_id
    WHERE (${jobId}::uuid IS NULL OR o.job_id = ${jobId}::uuid)
    ORDER BY o.sent_at DESC LIMIT 200`;
  return json(200, { outreach: rows });
}

async function logOutreach(ctx) {
  const body = await ctx.body();
  const jobId = body.job_id ? assertUuid(String(body.job_id), 'job_id') : null;
  const recipientRole = str(body.recipient_role, 'recipient_role', { required: true, max: 120 });
  const channel = str(body.channel, 'channel', { required: true, max: 20 });
  if (!CHANNELS.includes(channel)) throw new HttpError(400, `"channel" must be one of: ${CHANNELS.join(', ')}.`);
  const message = str(body.message_sent, 'message_sent', { required: true, max: 4000 });
  if (jobId) {
    const exists = await ctx.sql`SELECT id FROM saved_jobs WHERE id = ${jobId}`;
    if (!exists.length) throw new HttpError(404, 'Linked job not found. It may have been deleted.');
  }
  const queries = [
    ctx.sql`INSERT INTO outreach_logs (job_id, recipient_role, channel, message_sent)
            VALUES (${jobId}, ${recipientRole}, ${channel}, ${message}) RETURNING *`,
  ];
  if (jobId && body.mark_contacted === true) {
    queries.push(ctx.sql`UPDATE saved_jobs SET status = 'contacted', updated_at = now()
                         WHERE id = ${jobId} AND status IN ('discovered', 'applied') RETURNING *`);
  }
  const [inserted, advanced] = await ctx.sql.transaction(queries);
  if (jobId) await addEvent(ctx.sql, jobId, 'email', `${channel.replace('_', ' ')} to ${recipientRole}`);
  return json(201, { outreach: inserted[0], job: advanced?.[0] ?? null });
}

export default [
  ['GET', '/api/jobs', list],
  ['POST', '/api/jobs', create],
  ['GET', '/api/jobs/:id', get],
  ['PATCH', '/api/jobs/:id', update],
  ['DELETE', '/api/jobs/:id', remove],
  ['POST', '/api/jobs/:id/events', addNote],
  ['GET', '/api/outreach', listOutreach],
  ['POST', '/api/outreach', logOutreach],
];
