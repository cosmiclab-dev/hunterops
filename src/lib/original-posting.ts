// Job boards like Adzuna list a job with a short snippet and send people
// through their own pages to reach the employer. Those pages refuse apps
// (Adzuna answers "Access Denied"), so the application form is never visible
// there. This finds the same job on the employer's own ATS instead: first on
// a company board HunterOps already knows, then with a free web search.
import { prisma } from './db';
import { atsRef } from './job-page';
import { ATS_FETCHERS, type ScanCtx } from './scan/sources';
import { searchConfig, splitResultTitle, webSearch } from './websearch';
import type { Settings } from './settings';

const AGGREGATORS = /(^|\.)(adzuna\.[a-z.]+|jooble\.org|careerjet\.[a-z.]+|indeed\.[a-z.]+|naukri\.com|linkedin\.com|glassdoor\.[a-z.]+|foundit\.in|shine\.com)$/i;

export function isAggregatorUrl(url: string) {
  try {
    return AGGREGATORS.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

const words = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter((w) => w.length > 1 && !['the', 'and', 'for', 'of', 'in', 'at', 'with', 'india', 'remote', 'bangalore', 'bengaluru'].includes(w)));

// Share of the listing's title words that the candidate title also has.
export function titleOverlap(a: string, b: string) {
  const x = words(a);
  const y = words(b);
  if (!x.size) return 0;
  let hit = 0;
  for (const w of x) if (y.has(w)) hit++;
  return hit / Math.max(x.size, y.size);
}

const companyKey = (s: string) => s.toLowerCase().replace(/\b(pvt|private|ltd|limited|llp|inc|india|technologies|technology|solutions|services|global|group|corp|corporation)\b/g, '').replace(/[^a-z0-9]/g, '');

export type Original = { url: string; via: 'board' | 'search' };

export async function findOriginalPosting(job: { title: string; company: string }, settings: Settings): Promise<Original | null> {
  const key = companyKey(job.company);
  if (key.length >= 3) {
    // A board HunterOps already scans for this company.
    const boards = await prisma.company.findMany({ where: { active: true }, select: { id: true, name: true, atsType: true, atsSlug: true } });
    const board = boards.find((b) => companyKey(b.name) === key || companyKey(b.atsSlug.split('|')[0]) === key);
    const fetcher = board && ATS_FETCHERS[board.atsType];
    if (board && fetcher) {
      try {
        const ctx: ScanCtx = { searchTerms: [job.title], settings: { adzuna_app_id: null, adzuna_app_key: null }, deadline: Date.now() + 20_000 };
        const postings = await fetcher({ id: board.id, name: board.name, ats_type: board.atsType, ats_slug: board.atsSlug }, ctx);
        const best = postings.map((p) => ({ p, s: titleOverlap(job.title, p.title) })).sort((a, b) => b.s - a.s)[0];
        if (best && best.s >= 0.75) return { url: best.p.url, via: 'board' };
      } catch { /* fall through to search */ }
    }
  }
  // The same title and company on a public ATS, found with a web search.
  const sites = ['job-boards.greenhouse.io', 'boards.greenhouse.io', 'jobs.lever.co', 'jobs.ashbyhq.com', 'myworkdayjobs.com', 'jobs.smartrecruiters.com'];
  const q = `"${job.title}" "${job.company}" (${sites.map((s) => `site:${s}`).join(' OR ')})`;
  try {
    const results = await webSearch(searchConfig(settings), q, 'w', 10);
    const hit = results.find((r) => atsRef(r.url) && titleOverlap(job.title, splitResultTitle(r.title, r.url).role) >= 0.6);
    return hit ? { url: hit.url, via: 'search' } : null;
  } catch {
    return null;
  }
}
