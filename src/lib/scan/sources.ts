// Job sources. Each fetcher returns normalized postings:
//   { source, source_id, company, title, location, remote, url, posted_at, description, salary }
// ATS fetchers take a company row ({ name, ats_type, ats_slug }); board fetchers take settings.
// All endpoints are public JSON APIs published by the ATS or job board.
import { htmlToText } from '../text';
import { clip } from '../utils';

export type Posting = {
  source: string;
  source_id: string;
  company: string;
  title: string;
  location: string | null;
  remote: boolean;
  url: string;
  posted_at: string | null;
  description: string | null;
  salary: string | null;
};
export type CompanyRow = { id?: string; name: string; ats_type: string; ats_slug: string };
export type ScanCtx = { searchTerms: string[]; settings: { adzuna_app_id: string | null; adzuna_app_key: string | null } };
type Json = any;

const UA = 'HunterOps/2.0 (personal job search; +https://github.com/cosmiclab-dev/hunterops)';
export const FETCH_TIMEOUT_MS = 12_000;

export async function getJson(url: string, init: RequestInit = {}): Promise<Json> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      ...init,
      headers: { 'User-Agent': UA, Accept: 'application/json', ...((init.headers as Record<string, string>) || {}) },
      signal: controller.signal,
    });
    if (res.status === 404) throw new SourceError('Board not found (check the slug)', 404);
    if (!res.ok) throw new SourceError(`HTTP ${res.status}`, res.status);
    return await res.json();
  } catch (err: any) {
    if (err.name === 'AbortError') throw new SourceError('Timed out');
    if (err instanceof SourceError) throw err;
    throw new SourceError(err.message || 'Network error');
  } finally {
    clearTimeout(timer);
  }
}

export class SourceError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
  }
}

const iso = (v: unknown): string | null => {
  if (v === null || v === undefined || v === '') return null;
  const d = typeof v === 'number' ? new Date(v < 1e12 ? v * 1000 : v) : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

const money = (min: unknown, max: unknown, cur?: string | null) => {
  if (!min && !max) return null;
  const f = (n: unknown) => Number(n).toLocaleString('en-IN');
  return `${cur ? `${cur} ` : ''}${min ? f(min) : ''}${min && max ? ' – ' : ''}${max ? f(max) : ''}`.trim();
};

// ---- ATS ------------------------------------------------------------------

async function greenhouse(c: CompanyRow): Promise<Posting[]> {
  const data = await getJson(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(c.ats_slug)}/jobs?content=true`);
  return (data.jobs || []).map((j: Json) => ({
    source: 'greenhouse',
    source_id: String(j.id),
    company: c.name,
    title: j.title,
    location: j.location?.name || null,
    remote: /remote/i.test(j.location?.name || ''),
    url: j.absolute_url,
    posted_at: iso(j.first_published || j.updated_at),
    description: htmlToText(j.content),
    salary: null,
  }));
}

async function lever(c: CompanyRow): Promise<Posting[]> {
  const data = await getJson(`https://api.lever.co/v0/postings/${encodeURIComponent(c.ats_slug)}?mode=json`);
  return (Array.isArray(data) ? data : []).map((j: Json) => {
    const locs = j.categories?.allLocations?.length ? j.categories.allLocations : [j.categories?.location].filter(Boolean);
    return {
      source: 'lever',
      source_id: j.id,
      company: c.name,
      title: j.text,
      location: locs.join(' / ') || null,
      remote: j.workplaceType === 'remote' || /remote/i.test(locs.join(' ')),
      url: j.hostedUrl,
      posted_at: iso(j.createdAt),
      description: clip(j.descriptionPlain || htmlToText(j.description), 20000),
      salary: j.salaryRange ? money(j.salaryRange.min, j.salaryRange.max, j.salaryRange.currency) : null,
    };
  });
}

async function ashby(c: CompanyRow): Promise<Posting[]> {
  const data = await getJson(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(c.ats_slug)}?includeCompensation=true`);
  return (data.jobs || []).filter((j: Json) => j.isListed !== false).map((j: Json) => {
    const locs = [j.location, ...(j.secondaryLocations || []).map((s: Json) => s.location)].filter(Boolean);
    return {
      source: 'ashby',
      source_id: j.id || j.jobUrl,
      company: c.name,
      title: j.title,
      location: locs.join(' / ') || null,
      remote: j.isRemote === true || /remote/i.test(j.workplaceType || ''),
      url: j.jobUrl,
      posted_at: iso(j.publishedAt),
      description: clip(j.descriptionPlain || htmlToText(j.descriptionHtml), 20000),
      salary: j.compensation?.compensationTierSummary || null,
    };
  });
}

async function smartrecruiters(c: CompanyRow, ctx: ScanCtx): Promise<Posting[]> {
  const out: Posting[] = [];
  for (const q of ctx.searchTerms.slice(0, 3)) {
    const data = await getJson(`https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(c.ats_slug)}/postings?limit=100&q=${encodeURIComponent(q)}`);
    for (const j of data.content || []) {
      const loc = j.location || {};
      out.push({
        source: 'smartrecruiters',
        source_id: j.id,
        company: j.company?.name || c.name,
        title: j.name,
        location: loc.fullLocation || [loc.city, loc.region, loc.country?.toUpperCase()].filter(Boolean).join(', ') || null,
        remote: loc.remote === true,
        url: `https://jobs.smartrecruiters.com/${encodeURIComponent(c.ats_slug)}/${j.id}`,
        posted_at: iso(j.releasedDate),
        description: null,
        salary: null,
      });
    }
  }
  return out;
}

// "Posted Today", "Posted Yesterday", "Posted 3 Days Ago", "Posted 30+ Days Ago"
export function workdayPostedOn(text: string | null | undefined, now = Date.now()) {
  if (!text) return null;
  if (/today/i.test(text)) return new Date(now).toISOString();
  if (/yesterday/i.test(text)) return new Date(now - 864e5).toISOString();
  const m = text.match(/(\d+)\+?\s*days?/i);
  return m ? new Date(now - Number(m[1]) * 864e5).toISOString() : null;
}

async function workday(c: CompanyRow, ctx: ScanCtx): Promise<Posting[]> {
  const [host, site] = c.ats_slug.split('|');
  if (!host || !site) throw new SourceError('Workday slug must look like "tenant.wd3.myworkdayjobs.com|Site"');
  const tenant = host.split('.')[0];
  const endpoint = `https://${host}/wday/cxs/${tenant}/${site}/jobs`;
  const seen = new Map<string, Posting>();
  for (const q of ctx.searchTerms.slice(0, 3)) {
    for (let offset = 0; offset < 60; offset += 20) {
      const data = await getJson(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appliedFacets: {}, limit: 20, offset, searchText: q }),
      });
      const posts = data.jobPostings || [];
      for (const j of posts) {
        if (!j.externalPath || seen.has(j.externalPath)) continue;
        seen.set(j.externalPath, {
          source: 'workday',
          source_id: j.externalPath,
          company: c.name,
          title: j.title,
          location: j.locationsText || null,
          remote: /remote/i.test(j.locationsText || ''),
          url: `https://${host}/${site}${j.externalPath}`,
          posted_at: workdayPostedOn(j.postedOn),
          description: null,
          salary: null,
        });
      }
      if (posts.length < 20) break;
    }
  }
  return [...seen.values()];
}

async function recruitee(c: CompanyRow): Promise<Posting[]> {
  const data = await getJson(`https://${encodeURIComponent(c.ats_slug)}.recruitee.com/api/offers/`);
  return (data.offers || []).map((j: Json) => ({
    source: 'recruitee',
    source_id: String(j.id),
    company: j.company_name || c.name,
    title: j.title,
    location: j.location || [j.city, j.country].filter(Boolean).join(', ') || null,
    remote: j.remote === true,
    url: j.careers_url,
    posted_at: iso(j.published_at || j.created_at),
    description: htmlToText(j.description),
    salary: null,
  }));
}

async function workable(c: CompanyRow): Promise<Posting[]> {
  const data = await getJson(`https://www.workable.com/api/accounts/${encodeURIComponent(c.ats_slug)}?details=true`);
  return (data.jobs || []).map((j: Json) => ({
    source: 'workable',
    source_id: j.shortcode || j.url,
    company: data.name || c.name,
    title: j.title,
    location: [j.city, j.state, j.country].filter(Boolean).join(', ') || null,
    remote: j.telecommuting === true,
    url: j.url || j.application_url,
    posted_at: iso(j.published_on || j.created_at),
    description: htmlToText(j.description),
    salary: null,
  }));
}

export const ATS_FETCHERS: Record<string, (c: CompanyRow, ctx: ScanCtx) => Promise<Posting[]>> = { greenhouse, lever, ashby, smartrecruiters, workday, recruitee, workable };

// ---- Job boards -------------------------------------------------------------

async function adzuna(ctx: ScanCtx): Promise<Posting[] | { skipped: string }> {
  const id = ctx.settings.adzuna_app_id;
  const key = ctx.settings.adzuna_app_key;
  if (!id || !key) return { skipped: 'Add an Adzuna app ID and key in Settings' };
  const out: Posting[] = [];
  const queries = [
    ...ctx.searchTerms.slice(0, 3).map((what) => ({ what, where: 'Bangalore' })),
    { what: 'remote recruiter', where: '' },
  ];
  for (const q of queries) {
    const params = new URLSearchParams({
      app_id: id, app_key: key, results_per_page: '50', what: q.what, max_days_old: '7', sort_by: 'date',
    });
    if (q.where) params.set('where', q.where);
    const data = await getJson(`https://api.adzuna.com/v1/api/jobs/in/search/1?${params}`);
    for (const j of data.results || []) {
      out.push({
        source: 'adzuna',
        source_id: String(j.id),
        company: j.company?.display_name || 'Unknown',
        title: htmlToText(j.title, 300) || '',
        location: j.location?.display_name || null,
        remote: /remote|work from home/i.test(`${j.title} ${j.description}`),
        url: j.redirect_url,
        posted_at: iso(j.created),
        description: htmlToText(j.description),
        salary: money(j.salary_min, j.salary_max, 'INR'),
      });
    }
  }
  return out;
}

async function remotive(ctx: ScanCtx): Promise<Posting[] | { skipped: string }> {
  const out: Posting[] = [];
  for (const q of ctx.searchTerms.slice(0, 2)) {
    const data = await getJson(`https://remotive.com/api/remote-jobs?search=${encodeURIComponent(q)}&limit=100`);
    for (const j of data.jobs || []) {
      out.push({
        source: 'remotive',
        source_id: String(j.id),
        company: j.company_name,
        title: j.title,
        location: `Remote${j.candidate_required_location ? ` (${j.candidate_required_location})` : ''}`,
        remote: true,
        url: j.url,
        posted_at: iso(j.publication_date),
        description: htmlToText(j.description),
        salary: j.salary || null,
      });
    }
  }
  return out;
}

async function remoteok(): Promise<Posting[]> {
  const data = await getJson('https://remoteok.com/api?tag=recruiter');
  return (Array.isArray(data) ? data : []).filter((j: Json) => j && j.id && j.position).map((j: Json) => ({
    source: 'remoteok',
    source_id: String(j.id),
    company: j.company,
    title: j.position,
    location: `Remote${j.location ? ` (${j.location})` : ''}`,
    remote: true,
    url: j.url || `https://remoteok.com/remote-jobs/${j.id}`,
    posted_at: iso(j.date || j.epoch),
    description: htmlToText(j.description),
    salary: money(j.salary_min, j.salary_max, 'USD'),
  }));
}

async function himalayas(ctx: ScanCtx): Promise<Posting[] | { skipped: string }> {
  const out: Posting[] = [];
  for (const q of ctx.searchTerms.slice(0, 2)) {
    const data = await getJson(`https://himalayas.app/jobs/api/search?q=${encodeURIComponent(q)}&limit=50`);
    for (const j of data.jobs || []) {
      const restrictions = (j.locationRestrictions || []).map((r: Json) => (typeof r === 'string' ? r : r?.name)).filter(Boolean);
      out.push({
        source: 'himalayas',
        source_id: j.guid || j.applicationLink,
        company: j.companyName,
        title: j.title,
        location: `Remote${restrictions.length ? ` (${restrictions.join(', ')})` : ' (Anywhere)'}`,
        remote: true,
        url: j.applicationLink || j.guid,
        posted_at: iso(j.pubDate),
        description: htmlToText(j.description || j.excerpt),
        salary: money(j.minSalary, j.maxSalary, j.currency),
      });
    }
  }
  return out;
}

export const BOARD_FETCHERS: Record<string, (ctx: ScanCtx) => Promise<Posting[] | { skipped: string }>> = { adzuna, remotive, remoteok, himalayas };

// ---- Careers URL -> ATS + slug ---------------------------------------------

export function parseCareersUrl(raw: string): { ats_type: string; ats_slug: string; name: string } | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  const parts = u.pathname.split('/').filter(Boolean);
  const nice = (s: string) => s.replace(/[-_]+/g, ' ').replace(/\b\w/g, (ch: string) => ch.toUpperCase());
  if (/(^|\.)greenhouse\.io$/.test(host)) {
    const slug = host.startsWith('boards-api') ? parts[2] : (u.searchParams.get('for') || parts[0]);
    return slug ? { ats_type: 'greenhouse', ats_slug: slug.toLowerCase(), name: nice(slug) } : null;
  }
  if (/(^|\.)lever\.co$/.test(host) && parts[0]) {
    const slug = host.startsWith('api.') ? parts[2] : parts[0];
    return slug ? { ats_type: 'lever', ats_slug: slug, name: nice(slug) } : null;
  }
  if (/(^|\.)ashbyhq\.com$/.test(host) && parts[0]) {
    const slug = host.startsWith('api.') ? parts[2] : parts[0];
    return slug ? { ats_type: 'ashby', ats_slug: slug, name: nice(slug) } : null;
  }
  if (/(^|\.)smartrecruiters\.com$/.test(host) && parts[0]) {
    const slug = host.startsWith('api.') ? parts[2] : parts[0];
    return slug ? { ats_type: 'smartrecruiters', ats_slug: slug, name: nice(slug) } : null;
  }
  if (/\.myworkdayjobs\.com$|\.myworkdaysite\.com$/.test(host)) {
    // https://tenant.wd3.myworkdayjobs.com/en-US/Site/job/...  or  /Site
    const rest = /^[a-z]{2}-[A-Z]{2}$/.test(parts[0] || '') ? parts.slice(1) : parts;
    const site = rest[0];
    return site ? { ats_type: 'workday', ats_slug: `${host}|${site}`, name: nice(host.split('.')[0]) } : null;
  }
  if (/\.recruitee\.com$/.test(host)) {
    const slug = host.split('.')[0];
    return { ats_type: 'recruitee', ats_slug: slug, name: nice(slug) };
  }
  if (/(^|\.)workable\.com$/.test(host)) {
    const slug = host === 'apply.workable.com' ? parts[0] : host.split('.')[0];
    return slug && slug !== 'www' ? { ats_type: 'workable', ats_slug: slug, name: nice(slug) } : null;
  }
  return null;
}
