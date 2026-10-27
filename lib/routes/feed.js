// Job feed: scanned postings, scan runs, the company source list, and the daily cron.
import { HttpError, json, str } from '../http.js';
import { assertUuid } from '../db.js';
import { safeEqual } from '../crypto.js';
import { ATS_FETCHERS, parseCareersUrl } from '../sources.js';
import { runScan, scanPrefs, filterPostings, LOCATION_CLASSES } from '../scanner.js';
import { seedCompanies } from '../seed-companies.js';
import { createJob, addEvent } from './jobs.js';

const FEED_STATUSES = ['new', 'saved', 'dismissed'];

async function list(ctx) {
  const p = ctx.url.searchParams;
  const status = p.get('status') || 'new';
  if (!FEED_STATUSES.includes(status)) throw new HttpError(400, `"status" must be one of: ${FEED_STATUSES.join(', ')}.`);
  const locs = (p.get('loc') || '').split(',').filter((l) => LOCATION_CLASSES.includes(l));
  const q = (p.get('q') || '').trim().slice(0, 100);
  const days = Math.min(Math.max(Number(p.get('days')) || 0, 0), 90);
  const limit = Math.min(Math.max(Number(p.get('limit')) || 50, 1), 200);
  const offset = Math.max(Number(p.get('offset')) || 0, 0);
  const like = q ? `%${q.replace(/[%_\\]/g, (m) => `\\${m}`)}%` : null;

  const rows = await ctx.sql`
    SELECT id, source, company, title, location, location_class, url, posted_at, first_seen_at, salary, status,
           job_id, match_score, (description IS NOT NULL) AS has_description
    FROM job_feed
    WHERE status = ${status}
      AND (${locs.length === 0} OR location_class = ANY(${locs}::text[]))
      AND (${like}::text IS NULL OR title ILIKE ${like} OR company ILIKE ${like})
      AND (${days} = 0 OR COALESCE(posted_at, first_seen_at) > now() - make_interval(days => ${days}))
    ORDER BY COALESCE(posted_at, first_seen_at) DESC
    LIMIT ${limit} OFFSET ${offset}`;
  const counts = await ctx.sql`
    SELECT location_class, COUNT(*)::int AS n FROM job_feed WHERE status = ${status} GROUP BY location_class`;
  const [last] = await ctx.sql`SELECT * FROM scan_runs ORDER BY started_at DESC LIMIT 1`;
  return json(200, {
    items: rows,
    counts: Object.fromEntries(counts.map((c) => [c.location_class, c.n])),
    last_run: last || null,
    has_more: rows.length === limit,
  });
}

async function getItem(ctx) {
  const id = assertUuid(ctx.params.id);
  const [row] = await ctx.sql`SELECT * FROM job_feed WHERE id = ${id}`;
  if (!row) throw new HttpError(404, 'Feed item not found.');
  return json(200, { item: row });
}

async function patchItem(ctx) {
  const id = assertUuid(ctx.params.id);
  const { status } = await ctx.body();
  if (!['new', 'dismissed'].includes(status)) throw new HttpError(400, '"status" must be "new" or "dismissed".');
  const [row] = await ctx.sql`UPDATE job_feed SET status = ${status} WHERE id = ${id} RETURNING id, status`;
  if (!row) throw new HttpError(404, 'Feed item not found.');
  return json(200, { item: row });
}

async function dismissMany(ctx) {
  const { ids } = await ctx.body();
  if (!Array.isArray(ids) || !ids.length || ids.length > 500) throw new HttpError(400, 'Send { "ids": [...] } (1-500).');
  const clean = ids.map((id) => assertUuid(id));
  const rows = await ctx.sql`UPDATE job_feed SET status = 'dismissed' WHERE id = ANY(${clean}::uuid[]) AND status = 'new' RETURNING id`;
  return json(200, { dismissed: rows.length });
}

// Feed item -> pipeline job (status discovered), keeping the description for the JD grill.
async function saveItem(ctx) {
  const id = assertUuid(ctx.params.id);
  const [item] = await ctx.sql`SELECT * FROM job_feed WHERE id = ${id}`;
  if (!item) throw new HttpError(404, 'Feed item not found.');
  const { job, created } = await createJob(ctx.sql, {
    title: item.title,
    company: item.company,
    url: item.url,
    location: item.location,
    description: item.description,
    salary: item.salary,
    source: item.source,
  }, { eventDetail: `Saved from feed (${item.source})` });
  await ctx.sql`UPDATE job_feed SET status = 'saved', job_id = ${job.id} WHERE id = ${id}`;
  if (!created) await addEvent(ctx.sql, job.id, 'note', 'Seen again in the job feed');
  return json(created ? 201 : 200, { job, created });
}

async function scanNow(ctx) {
  const body = await ctx.body();
  const result = await runScan(ctx.sql, {
    trigger: body.auto ? 'auto' : 'manual',
    force: Boolean(body.force),
    budgetMs: 100_000,
  });
  return json(200, result);
}

async function runs(ctx) {
  const rows = await ctx.sql`SELECT * FROM scan_runs ORDER BY started_at DESC LIMIT 20`;
  return json(200, { runs: rows });
}

// Vercel Cron calls this with Authorization: Bearer $CRON_SECRET.
async function cron(ctx) {
  const secret = process.env.CRON_SECRET;
  const given = (ctx.req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!secret || !given || !safeEqual(given, secret)) throw new HttpError(401, 'Bad cron secret.');
  const result = await runScan(ctx.sql, { trigger: 'cron', budgetMs: 240_000 });
  console.log('[cron scan]', JSON.stringify({ ...result, errors: result.errors?.length }));
  return json(200, result);
}

// ---- Sources (companies) ------------------------------------------------------

async function listCompanies(ctx) {
  const rows = await ctx.sql`SELECT * FROM companies ORDER BY lower(name)`;
  return json(200, { companies: rows, ats_types: Object.keys(ATS_FETCHERS) });
}

function companyInput(body) {
  if (body.url) {
    const parsed = parseCareersUrl(String(body.url));
    if (!parsed) {
      throw new HttpError(400, 'Could not read that link. Paste a Greenhouse, Lever, Ashby, SmartRecruiters, Workday, Recruitee or Workable careers URL.');
    }
    return { ...parsed, name: str(body.name, 'name', { max: 200 }) || parsed.name };
  }
  const name = str(body.name, 'name', { required: true, max: 200 });
  const atsType = str(body.ats_type, 'ats_type', { required: true, max: 40 });
  if (!ATS_FETCHERS[atsType]) throw new HttpError(400, `"ats_type" must be one of: ${Object.keys(ATS_FETCHERS).join(', ')}.`);
  const slug = str(body.ats_slug, 'ats_slug', { required: true, max: 300 });
  return { name, ats_type: atsType, ats_slug: slug };
}

async function addCompany(ctx) {
  const c = companyInput(await ctx.body());
  const rows = await ctx.sql`
    INSERT INTO companies (name, ats_type, ats_slug) VALUES (${c.name}, ${c.ats_type}, ${c.ats_slug})
    ON CONFLICT (ats_type, ats_slug) DO NOTHING RETURNING *`;
  if (!rows.length) throw new HttpError(409, `${c.name} is already in your sources.`);
  return json(201, { company: rows[0] });
}

async function patchCompany(ctx) {
  const id = assertUuid(ctx.params.id);
  const body = await ctx.body();
  const name = body.name === undefined ? null : str(body.name, 'name', { required: true, max: 200 });
  const active = typeof body.active === 'boolean' ? body.active : null;
  const [row] = await ctx.sql`
    UPDATE companies SET name = COALESCE(${name}, name), active = COALESCE(${active}, active)
    WHERE id = ${id} RETURNING *`;
  if (!row) throw new HttpError(404, 'Source not found.');
  return json(200, { company: row });
}

async function deleteCompany(ctx) {
  const id = assertUuid(ctx.params.id);
  const rows = await ctx.sql`DELETE FROM companies WHERE id = ${id} RETURNING id`;
  if (!rows.length) throw new HttpError(404, 'Source not found.');
  return json(200, { deleted: id });
}

// Fetch one board right now: shows how many postings exist and which ones match.
async function testCompany(ctx) {
  const id = assertUuid(ctx.params.id);
  const [c] = await ctx.sql`SELECT * FROM companies WHERE id = ${id}`;
  if (!c) throw new HttpError(404, 'Source not found.');
  const prefs = scanPrefs();
  const postings = await ATS_FETCHERS[c.ats_type](c, { searchTerms: prefs.searchTerms });
  const kept = filterPostings(postings, prefs);
  return json(200, {
    fetched: postings.length,
    matched: kept.length,
    sample: postings.slice(0, 8).map((p) => ({ title: p.title, location: p.location })),
    matches: kept.slice(0, 20).map((p) => ({ title: p.title, location: p.location, location_class: p.location_class, url: p.url })),
  });
}

async function scanCompany(ctx) {
  const id = assertUuid(ctx.params.id);
  return json(200, await runScan(ctx.sql, { trigger: 'manual', companyIds: [id], budgetMs: 40_000 }));
}

async function seed(ctx) {
  return json(200, { added: await seedCompanies(ctx.sql) });
}

export default [
  ['GET', '/api/feed', list],
  ['GET', '/api/feed/runs', runs],
  ['POST', '/api/feed/scan', scanNow],
  ['POST', '/api/feed/dismiss', dismissMany],
  ['GET', '/api/feed/:id', getItem],
  ['PATCH', '/api/feed/:id', patchItem],
  ['POST', '/api/feed/:id/save', saveItem],
  ['GET', '/api/cron/scan', cron, { public: true }],
  ['GET', '/api/companies', listCompanies],
  ['POST', '/api/companies', addCompany],
  ['POST', '/api/companies/seed', seed],
  ['PATCH', '/api/companies/:id', patchCompany],
  ['DELETE', '/api/companies/:id', deleteCompany],
  ['POST', '/api/companies/:id/test', testCompany],
  ['POST', '/api/companies/:id/scan', scanCompany],
];
