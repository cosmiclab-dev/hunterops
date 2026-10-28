// Job scanner: pulls postings from company ATS boards and public job boards,
// keeps recruiter-type roles in Bengaluru / remote, stores new ones and grills them.
import type { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { saveInternal, type Settings } from '../settings';
import { clip, csv } from '../utils';
import { classifyLocation, detectWorkMode, LOCATION_CLASSES, type LocationClass } from '../location';
import { ATS_FETCHERS, BOARD_FETCHERS, type Posting, type ScanCtx } from './sources';
import { RETIRED_COMPANIES, SEED_COMPANIES, SEED_VERSION } from './seed-companies';
import { grill } from '../modules/grill';
import { loadProfile, profileIsEmpty, toGrillProfile } from '../profile';

const CONCURRENCY = 8;
const PER_SOURCE_RESERVE_MS = 14_000; // don't start a source with less time than this left
// Job boards (Adzuna, Remotive, ...) are searched at most every 10 minutes.
const BOARD_INTERVAL_MS = 10 * 60 * 1000;
const MAX_AGE_DAYS = 45;

const norm = (s: string) => ` ${String(s || '').toLowerCase().replace(/[^a-z0-9+#]+/g, ' ').trim()} `;

export function titleMatcher(keywords: string[], exclude: string[]) {
  // "recruiter" also finds "Recruiting Coordinator", "sourcer" finds "Sourcing Specialist".
  const stems = keywords.flatMap((k) => (/^[a-z]+er$/i.test(k.trim()) ? [k.trim().replace(/er$/i, 'ing')] : []));
  const inc = [...keywords, ...stems].map(norm).filter((k) => k.trim());
  const exc = exclude.map(norm).filter((k) => k.trim());
  return (title: string) => {
    const t = norm(title);
    if (exc.some((k) => t.includes(k))) return false;
    // keywords match on word boundaries, plus simple plurals ("recruiters")
    return inc.some((k) => t.includes(k) || t.includes(`${k.trimEnd()}s `));
  };
}

export type ScanPrefs = { keywords: string[]; exclude: string[]; locations: LocationClass[]; searchTerms: string[] };

export function scanPrefs(settings: Settings): ScanPrefs {
  const keywords = csv(settings.get('feed_keywords')).map((k) => k.toLowerCase());
  const exclude = csv(settings.get('feed_exclude')).map((k) => k.toLowerCase());
  const locations = csv(settings.get('feed_locations')).filter((l): l is LocationClass => (LOCATION_CLASSES as readonly string[]).includes(l));
  return {
    keywords,
    exclude,
    locations: locations.length ? locations : ['bengaluru', 'remote_india', 'remote_global'],
    // Search APIs (Workday, SmartRecruiters, boards) get the broadest few terms.
    searchTerms: keywords.length ? keywords.slice(0, 3) : ['recruiter'],
  };
}

export type Kept = Posting & { location_class: LocationClass; company_id?: string };

// Keep a posting if the title matches, the location is wanted, and it isn't stale.
export function filterPostings(postings: Posting[], prefs: ScanPrefs, now = Date.now()): Kept[] {
  const matches = titleMatcher(prefs.keywords, prefs.exclude);
  const wanted = new Set(prefs.locations);
  const oldest = now - MAX_AGE_DAYS * 864e5;
  const out: Kept[] = [];
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

// Inserts new postings (existing URLs, including dismissed ones, are skipped)
// and grills each new one against the profile.
export async function insertPostings(rows: Kept[]) {
  const unique = [...new Map(rows.map((r) => [r.url, r])).values()];
  const profile = await loadProfile();
  const gp = profile && !profileIsEmpty(profile) ? toGrillProfile(profile) : null;
  let inserted = 0;
  for (let i = 0; i < unique.length; i += 100) {
    const data: Prisma.JobCreateManyInput[] = unique.slice(i, i + 100).map((r) => {
      const workMode = detectWorkMode(r.location, r.description, r.remote);
      const g = gp ? grill(gp, { title: r.title, location: r.location, description: r.description, workMode, salary: r.salary }) : null;
      return {
        source: r.source,
        company: clip(r.company || 'Unknown', 200) as string,
        companyId: r.company_id ?? null,
        title: clip(r.title, 300) as string,
        location: clip(r.location, 300),
        locationClass: r.location_class,
        workMode,
        url: r.url,
        postedAt: r.posted_at ? new Date(r.posted_at) : null,
        description: clip(r.description, 20000),
        salary: clip(r.salary, 300),
        grillScore: g?.score ?? null,
        grillBreakdown: g ? (g as unknown as Prisma.InputJsonValue) : undefined,
        grilledAt: g ? new Date() : null,
      };
    });
    const res = await prisma.job.createMany({ data, skipDuplicates: true });
    inserted += res.count;
  }
  return inserted;
}

// Runs tasks with a concurrency cap; stops starting new ones near the deadline.
async function pool<T>(tasks: (() => Promise<T>)[], deadline: number) {
  const results: (T | { error: string } | { skipped: string })[] = [];
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
        results[i] = { error: (err as Error).message || String(err) };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, tasks.length) }, worker));
  return results;
}

// Adds starter boards that are missing (new ones ship with app updates) and pauses retired ones.
export async function seedCompanies() {
  const res = await prisma.company.createMany({
    data: SEED_COMPANIES.map(([name, atsType, atsSlug]) => ({ name, atsType, atsSlug })),
    skipDuplicates: true,
  });
  await prisma.company.updateMany({
    where: { OR: RETIRED_COMPANIES.map(([atsType, atsSlug]) => ({ atsType, atsSlug })) },
    data: { active: false },
  });
  await saveInternal('seed_version', String(SEED_VERSION));
  return res.count;
}

// Adds boards from a newer starter list; boards the person removed stay removed
// only if they deleted them after this version (paused ones stay paused).
export async function syncSeedCompanies(settings: Settings) {
  if (Number(settings.get('seed_version') || 0) >= SEED_VERSION) return 0;
  return seedCompanies();
}

type TaskResult = { name: string; fetched: number; kept: Kept[]; note?: string };

/**
 * trigger: 'manual' | 'cron'
 * budgetMs: wall-clock budget for fetching (insert time comes on top).
 * force: scan boards even if they ran in the last 2 hours.
 * companyIds: scan only these companies (and no boards).
 */
export async function runScan(settings: Settings, opts: { trigger?: string; budgetMs?: number; force?: boolean; companyIds?: string[] | null; companyLimit?: number } = {}) {
  const { trigger = 'manual', budgetMs = 45_000, force = false, companyIds = null, companyLimit = 200 } = opts;
  const started = Date.now();
  const deadline = started + budgetMs;
  const prefs = scanPrefs(settings);
  const run = await prisma.scanRun.create({ data: { trigger } });

  if (!companyIds) await syncSeedCompanies(settings);
  const companies = companyIds
    ? await prisma.company.findMany({ where: { id: { in: companyIds } } })
    : await prisma.company.findMany({ where: { active: true }, orderBy: { lastScannedAt: { sort: 'asc', nulls: 'first' } }, take: companyLimit });

  const boardsAt = settings.get('boards_scanned_at');
  const scanBoards = !companyIds && (force || trigger === 'cron' || !boardsAt || Date.now() - Date.parse(boardsAt) > BOARD_INTERVAL_MS);
  const ctx: ScanCtx = {
    deadline,
    searchTerms: prefs.searchTerms,
    settings: { adzuna_app_id: settings.get('adzuna_app_id'), adzuna_app_key: settings.get('adzuna_app_key') },
  };

  // Job boards go first: they are few and cover many companies, so a slow
  // company board never pushes them out of the time budget.
  const boardNames = scanBoards ? Object.keys(BOARD_FETCHERS) : [];
  const tasks: (() => Promise<TaskResult>)[] = boardNames.map((name) => async () => {
    const res = await BOARD_FETCHERS[name](ctx);
    if (!Array.isArray(res)) return { name, fetched: 0, kept: [], note: res?.skipped };
    return { name, fetched: res.length, kept: filterPostings(res, prefs) };
  });
  const labels = [...boardNames, ...companies.map((c) => c.name)];
  tasks.push(...companies.map((c) => async () => {
    const fetcher = ATS_FETCHERS[c.atsType];
    try {
      if (!fetcher) throw new Error(`No fetcher for ${c.atsType}`);
      const postings = await fetcher({ id: c.id, name: c.name, ats_type: c.atsType, ats_slug: c.atsSlug }, ctx);
      const kept = filterPostings(postings, prefs).map((p) => ({ ...p, company_id: c.id }));
      await prisma.company.update({
        where: { id: c.id },
        data: { lastScannedAt: new Date(), lastStatus: 'ok', lastError: null, lastFound: kept.length },
      });
      return { name: c.name, fetched: postings.length, kept };
    } catch (err) {
      // A board that no longer exists is paused so it stops costing scan time.
      const gone = (err as { status?: number }).status === 404;
      await prisma.company.update({
        where: { id: c.id },
        data: { lastScannedAt: new Date(), lastStatus: 'error', lastError: clip(gone ? `${(err as Error).message}. Paused automatically; resume it after fixing the link.` : (err as Error).message, 500), ...(gone ? { active: false } : {}) },
      });
      throw new Error(`${c.name}: ${(err as Error).message}`);
    }
  }));

  const results = await pool(tasks, deadline);
  // Only count the boards as checked if at least one of them actually ran.
  if (scanBoards && results.slice(0, boardNames.length).some((r) => !('skipped' in r))) await saveInternal('boards_scanned_at', new Date().toISOString());

  const errors: { source: string; error: string }[] = [];
  const rows: Kept[] = [];
  let fetched = 0;
  let skipped = 0;
  results.forEach((r, i) => {
    const label = labels[i];
    if ('error' in r) errors.push({ source: label, error: clip(r.error, 300) as string });
    else if ('skipped' in r) skipped++;
    else {
      fetched += r.fetched;
      rows.push(...r.kept);
      if (r.note) errors.push({ source: label, error: r.note });
    }
  });
  const inserted = rows.length ? await insertPostings(rows) : 0;

  const summary = {
    run_id: run.id,
    sources: tasks.length,
    skipped_for_time: skipped,
    fetched,
    matched: rows.length,
    inserted,
    already_on_board: Math.max(0, new Set(rows.map((r) => r.url)).size - inserted),
    errors: errors.slice(0, 50),
    boards: scanBoards,
    ms: Date.now() - started,
  };
  await prisma.scanRun.update({
    where: { id: run.id },
    data: { finishedAt: new Date(), sources: tasks.length - skipped, fetched, matched: rows.length, inserted, errors: summary.errors },
  });
  return summary;
}
