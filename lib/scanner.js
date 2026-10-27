// Job scanner: pulls postings from company ATS boards and public job boards,
// keeps recruiter-type roles in Bengaluru / remote, and stores new ones in job_feed.
import { ATS_FETCHERS, BOARD_FETCHERS } from './sources.js';
import { getSetting, saveInternal, csv } from './settings.js';
import { clip } from './text.js';

export const LOCATION_CLASSES = ['bengaluru', 'remote_india', 'remote_global', 'india', 'remote_other', 'other'];

const CONCURRENCY = 8;
const PER_SOURCE_RESERVE_MS = 14_000; // don't start a source with less time than this left
const BOARD_INTERVAL_MS = 2 * 60 * 60 * 1000;
const AUTO_INTERVAL_MS = 6 * 60 * 60 * 1000;
const MAX_AGE_DAYS = 45;

const BLR_RE = /\b(bengaluru|bangalore|blr)\b/;
const REMOTE_RE = /\b(remote|anywhere|work from home|wfh|distributed|fully remote)\b/;
const INDIA_RE = /\b(india|indian|mumbai|delhi|ncr|gurgaon|gurugram|noida|hyderabad|pune|chennai|kolkata|ahmedabad|kochi|jaipur|chandigarh|coimbatore|ist)\b/;
const APAC_RE = /\b(apac|asia|asia pacific|south asia)\b/;
const GLOBAL_RE = /\b(anywhere|worldwide|global|international|any location)\b/;

export function classifyLocation(location, remoteFlag = false) {
  const text = String(location || '').toLowerCase();
  if (BLR_RE.test(text)) return 'bengaluru';
  const remote = remoteFlag || REMOTE_RE.test(text);
  const india = INDIA_RE.test(text);
  if (remote) {
    if (india || APAC_RE.test(text)) return 'remote_india';
    const rest = text.replace(REMOTE_RE, ' ').replace(/[^a-z]+/g, ' ').trim();
    if (!rest || GLOBAL_RE.test(text)) return 'remote_global';
    return 'remote_other';
  }
  return india ? 'india' : 'other';
}

const norm = (s) => ` ${String(s || '').toLowerCase().replace(/[^a-z0-9+#]+/g, ' ').trim()} `;

export function titleMatcher(keywords, exclude) {
  const inc = keywords.map(norm).filter((k) => k.trim());
  const exc = exclude.map(norm).filter((k) => k.trim());
  return (title) => {
    const t = norm(title);
    if (exc.some((k) => t.includes(k))) return false;
    // keywords match on word boundaries, plus simple plurals ("recruiters")
    return inc.some((k) => t.includes(k) || t.includes(`${k.trimEnd()}s `));
  };
}

export function scanPrefs() {
  const keywords = csv(getSetting('feed_keywords')).map((k) => k.toLowerCase());
  const exclude = csv(getSetting('feed_exclude')).map((k) => k.toLowerCase());
  const locations = csv(getSetting('feed_locations')).filter((l) => LOCATION_CLASSES.includes(l));
  return {
    keywords,
    exclude,
    locations: locations.length ? locations : ['bengaluru', 'remote_india', 'remote_global'],
    // Search APIs (Workday, SmartRecruiters, boards) get the broadest few terms.
    searchTerms: keywords.length ? keywords.slice(0, 3) : ['recruiter'],
  };
}

// Keep a posting if the title matches, the location is wanted, and it isn't stale.
export function filterPostings(postings, prefs, now = Date.now()) {
  const matches = titleMatcher(prefs.keywords, prefs.exclude);
  const wanted = new Set(prefs.locations);
  const oldest = now - MAX_AGE_DAYS * 864e5;
  const out = [];
  for (const p of postings) {
    if (!p || !p.title || !p.url || !/^https?:\/\//i.test(p.url)) continue;
    if (!matches(p.title)) continue;
    const location_class = classifyLocation(p.location, p.remote);
    if (!wanted.has(location_class)) continue;
    if (p.posted_at && Date.parse(p.posted_at) < oldest) continue;
    out.push({ ...p, location_class });
  }
  return out;
}

const COLS = ['source', 'company', 'company_id', 'title', 'location', 'location_class', 'url', 'posted_at', 'description', 'salary'];
const TYPES = ['text', 'text', 'uuid', 'text', 'text', 'text', 'text', 'timestamptz', 'text', 'text'];

// Bulk insert in batches; existing URLs (including dismissed ones) are skipped.
export async function insertPostings(sql, rows) {
  const unique = [...new Map(rows.map((r) => [r.url, r])).values()];
  let inserted = 0;
  for (let i = 0; i < unique.length; i += 60) {
    const batch = unique.slice(i, i + 60);
    const params = COLS.map((col) => batch.map((r) => {
      const v = r[col] ?? null;
      if (col === 'title') return clip(String(v), 300);
      if (col === 'company') return clip(String(v || 'Unknown'), 200);
      if (col === 'location' || col === 'salary') return clip(v, 300);
      if (col === 'description') return clip(v, 20000);
      return v;
    }));
    const text = `
      INSERT INTO job_feed (${COLS.join(', ')})
      SELECT * FROM unnest(${TYPES.map((t, n) => `$${n + 1}::${t}[]`).join(', ')})
      ON CONFLICT (url) DO NOTHING
      RETURNING id`;
    const res = await sql.query(text, params);
    inserted += res.length;
  }
  return inserted;
}

// Runs tasks with a concurrency cap; stops starting new ones near the deadline.
async function pool(tasks, deadline) {
  const results = [];
  let next = 0;
  async function worker() {
    while (next < tasks.length) {
      const i = next++;
      if (Date.now() > deadline - PER_SOURCE_RESERVE_MS) {
        results[i] = { skipped: 'time budget' };
        continue;
      }
      try {
        results[i] = await tasks[i]();
      } catch (err) {
        results[i] = { error: err.message || String(err) };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, tasks.length) }, worker));
  return results;
}

async function lastRunAt(sql, filter) {
  const [row] = filter === 'boards'
    ? await sql`SELECT value FROM app_settings WHERE key = 'boards_scanned_at'`
    : await sql`SELECT started_at AS value FROM scan_runs ORDER BY started_at DESC LIMIT 1`;
  return row ? new Date(row.value).getTime() : 0;
}

/**
 * trigger: 'manual' | 'cron' | 'auto'
 * budgetMs: wall-clock budget for fetching (insert time comes on top).
 * force: scan boards even if they ran in the last 2 hours.
 * companyIds: scan only these companies (and no boards).
 */
export async function runScan(sql, { trigger = 'manual', budgetMs = 60_000, force = false, companyIds = null, companyLimit = 200 } = {}) {
  if (trigger === 'auto' && Date.now() - (await lastRunAt(sql, 'runs')) < AUTO_INTERVAL_MS) {
    return { skipped: 'A scan ran in the last 6 hours.' };
  }
  const started = Date.now();
  const deadline = started + budgetMs;
  const prefs = scanPrefs();
  const [run] = await sql`INSERT INTO scan_runs (trigger) VALUES (${trigger}) RETURNING id`;

  const companies = companyIds
    ? await sql`SELECT * FROM companies WHERE id = ANY(${companyIds}::uuid[])`
    : await sql`SELECT * FROM companies WHERE active ORDER BY last_scanned_at ASC NULLS FIRST LIMIT ${companyLimit}`;

  const scanBoards = !companyIds && (force || trigger === 'cron' || Date.now() - (await lastRunAt(sql, 'boards')) > BOARD_INTERVAL_MS);
  const ctx = {
    searchTerms: prefs.searchTerms,
    settings: { adzuna_app_id: getSetting('adzuna_app_id'), adzuna_app_key: getSetting('adzuna_app_key') },
  };

  const tasks = companies.map((c) => async () => {
    const fetcher = ATS_FETCHERS[c.ats_type];
    if (!fetcher) throw new Error(`No fetcher for ${c.ats_type}`);
    try {
      const postings = await fetcher(c, ctx);
      const kept = filterPostings(postings, prefs).map((p) => ({ ...p, company_id: c.id }));
      await sql`UPDATE companies SET last_scanned_at = now(), last_status = 'ok', last_error = NULL, last_found = ${kept.length}
                WHERE id = ${c.id}`;
      return { name: c.name, fetched: postings.length, kept };
    } catch (err) {
      await sql`UPDATE companies SET last_scanned_at = now(), last_status = 'error', last_error = ${clip(err.message, 500)}
                WHERE id = ${c.id}`;
      throw new Error(`${c.name}: ${err.message}`);
    }
  });
  const boardNames = scanBoards ? Object.keys(BOARD_FETCHERS) : [];
  for (const name of boardNames) {
    tasks.push(async () => {
      const res = await BOARD_FETCHERS[name](ctx);
      if (!Array.isArray(res)) return { name, fetched: 0, kept: [], note: res?.skipped };
      return { name, fetched: res.length, kept: filterPostings(res, prefs) };
    });
  }

  const results = await pool(tasks, deadline);
  if (scanBoards) await saveInternal(sql, 'boards_scanned_at', new Date().toISOString());

  const errors = [];
  const rows = [];
  let fetched = 0;
  let skipped = 0;
  results.forEach((r, i) => {
    const label = i < companies.length ? companies[i].name : boardNames[i - companies.length];
    if (r?.error) errors.push({ source: label, error: clip(r.error, 300) });
    else if (r?.skipped) skipped++;
    else if (r) {
      fetched += r.fetched;
      rows.push(...r.kept);
      if (r.note) errors.push({ source: label, error: r.note });
    }
  });
  const inserted = rows.length ? await insertPostings(sql, rows) : 0;

  const summary = {
    run_id: run.id,
    sources: tasks.length,
    skipped_for_time: skipped,
    fetched,
    matched: rows.length,
    inserted,
    errors: errors.slice(0, 50),
    boards: scanBoards,
    ms: Date.now() - started,
  };
  await sql`
    UPDATE scan_runs SET finished_at = now(), sources = ${tasks.length - skipped}, fetched = ${fetched},
           matched = ${rows.length}, inserted = ${inserted}, errors = ${JSON.stringify(summary.errors)}::jsonb
    WHERE id = ${run.id}`;
  return summary;
}
