// Opens one job posting by URL for the in-app Browser and "Grill a URL".
// Known ATS links (Greenhouse, Lever, Ashby, Workday, SmartRecruiters) are read
// through their public job APIs, which give a clean description and, for
// Greenhouse, the real application questions. Other sites are fetched as HTML
// and read through schema.org JobPosting data or the page's main content.
import { fetchPublic, fetchPublicJson, frameAllowed } from './net';
import { formFields, jobPostingFromHtml, mainContent, sanitizeHtml, textToHtml, type FormField } from './html';
import { htmlToText, decodeEntities } from './text';
import { workdayPostedOn } from './scan/sources';
import { salaryFromText } from './salary';

export type JobPage = {
  url: string;              // the canonical posting URL
  applyUrl: string;         // where the person submits
  source: string;           // greenhouse, lever, ashby, workday, smartrecruiters, web
  ats: { type: string; slug: string } | null;
  title: string;
  company: string;
  location: string | null;
  remote: boolean;
  postedAt: string | null;
  salary: string | null;
  description: string;      // plain text, for the Grill and prompts
  html: string;             // sanitized, for the reader view
  fields: FormField[];      // application form fields, when the site exposes them
  embedUrl: string | null;  // an official embeddable application form (Greenhouse)
  frameable: boolean | null;
};

const nice = (s: string) => s.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export type AtsRef =
  | { type: 'greenhouse'; slug: string; id: string }
  | { type: 'lever'; slug: string; id: string }
  | { type: 'ashby'; slug: string; id: string }
  | { type: 'workday'; host: string; tenant: string; site: string; path: string }
  | { type: 'smartrecruiters'; slug: string; id: string };

// Recognises a single-posting URL on a known ATS.
export function atsRef(raw: string): AtsRef | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  const parts = u.pathname.split('/').filter(Boolean);
  if (/(^|\.)greenhouse\.io$/.test(host)) {
    const ghId = u.searchParams.get('gh_jid') || u.searchParams.get('token');
    const slug = u.searchParams.get('for') || parts[0];
    const i = parts.indexOf('jobs');
    const id = i >= 0 ? parts[i + 1] : ghId;
    if (slug && id && /^\d+$/.test(id) && slug !== 'embed') return { type: 'greenhouse', slug, id };
    return null;
  }
  if (/(^|\.)lever\.co$/.test(host) && parts.length >= 2 && /^[0-9a-f-]{36}$/i.test(parts[1])) {
    return { type: 'lever', slug: parts[0], id: parts[1] };
  }
  if (host === 'jobs.ashbyhq.com' && parts.length >= 2 && /^[0-9a-f-]{36}$/i.test(parts[1])) {
    return { type: 'ashby', slug: parts[0], id: parts[1] };
  }
  if (/\.myworkdayjobs\.com$|\.myworkdaysite\.com$/.test(host)) {
    const rest = /^[a-z]{2}-[A-Z]{2}$/.test(parts[0] || '') ? parts.slice(1) : parts;
    const j = rest.indexOf('job');
    if (rest[0] && j > 0) return { type: 'workday', host, tenant: host.split('.')[0], site: rest[0], path: `/${rest.slice(j).join('/')}` };
    return null;
  }
  if (/(^|\.)smartrecruiters\.com$/.test(host) && parts.length >= 2 && /^\d{6,}/.test(parts[1])) {
    return { type: 'smartrecruiters', slug: parts[0], id: parts[1].split('-')[0] };
  }
  return null;
}

// Test hook: lets e2e point the ATS APIs at a local mock.
const api = (url: string) => (process.env.ATS_API_BASE ? url.replace(/^https:\/\/[^/]+/, process.env.ATS_API_BASE) : url);

function emptyPage(url: string): JobPage {
  return { url, applyUrl: url, source: 'web', ats: null, title: '', company: '', location: null, remote: false, postedAt: null, salary: null, description: '', html: '', fields: [], embedUrl: null, frameable: null };
}

async function greenhouse(ref: Extract<AtsRef, { type: 'greenhouse' }>, url: string): Promise<JobPage> {
  const j = await fetchPublicJson(api(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(ref.slug)}/jobs/${ref.id}?questions=true`));
  const html = decodeEntities(j.content || '');
  const fields: FormField[] = (j.questions || []).flatMap((q: any) => (q.fields || []).slice(0, 1).map((f: any) => ({
    key: f.name,
    label: String(q.label || f.name).trim(),
    type: f.type === 'input_file' ? 'file' : f.type === 'textarea' ? 'textarea' : /select/.test(f.type) ? 'select' : 'text',
    required: Boolean(q.required),
    options: Array.isArray(f.values) && f.values.length ? f.values.map((v: any) => String(v.label)).slice(0, 40) : undefined,
  })));
  const page = emptyPage(j.absolute_url || url);
  return {
    ...page,
    source: 'greenhouse',
    ats: { type: 'greenhouse', slug: ref.slug },
    title: j.title || '',
    company: j.company_name || nice(ref.slug),
    location: j.location?.name || null,
    remote: /remote/i.test(j.location?.name || ''),
    postedAt: j.first_published || j.updated_at || null,
    description: htmlToText(html) || '',
    html: sanitizeHtml(html, page.url),
    fields,
    embedUrl: `https://boards.greenhouse.io/embed/job_app?for=${encodeURIComponent(ref.slug)}&token=${ref.id}`,
  };
}

async function lever(ref: Extract<AtsRef, { type: 'lever' }>, url: string): Promise<JobPage> {
  const j = await fetchPublicJson(api(`https://api.lever.co/v0/postings/${encodeURIComponent(ref.slug)}/${ref.id}`));
  const lists = (j.lists || []).map((l: any) => `<h3>${l.text}</h3><ul>${l.content}</ul>`).join('');
  const html = `${j.description || ''}${lists}${j.additional || ''}`;
  const locs = j.categories?.allLocations?.length ? j.categories.allLocations : [j.categories?.location].filter(Boolean);
  const applyUrl = j.applyUrl || `${j.hostedUrl || url}/apply`;
  let fields: FormField[] = [];
  try {
    const form = await fetchPublic(applyUrl);
    fields = formFields(form.body);
  } catch { /* the reader still works without the form */ }
  const page = emptyPage(j.hostedUrl || url);
  return {
    ...page,
    applyUrl,
    source: 'lever',
    ats: { type: 'lever', slug: ref.slug },
    title: j.text || '',
    company: nice(ref.slug),
    location: locs.join(' / ') || null,
    remote: j.workplaceType === 'remote' || /remote/i.test(locs.join(' ')),
    postedAt: j.createdAt ? new Date(j.createdAt).toISOString() : null,
    salary: j.salaryRange ? `${j.salaryRange.currency || ''} ${j.salaryRange.min ?? ''} – ${j.salaryRange.max ?? ''}`.trim() : null,
    description: htmlToText(html) || j.descriptionPlain || '',
    html: sanitizeHtml(html, page.url),
    fields,
  };
}

async function ashby(ref: Extract<AtsRef, { type: 'ashby' }>, url: string): Promise<JobPage> {
  const data = await fetchPublicJson(api(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(ref.slug)}?includeCompensation=true`));
  const j = (data.jobs || []).find((x: any) => x.id === ref.id || String(x.jobUrl || '').includes(ref.id));
  if (!j) throw Object.assign(new Error('closed'), { status: 404 });
  const page = emptyPage(j.jobUrl || url);
  return {
    ...page,
    applyUrl: j.applyUrl || `${page.url}/application`,
    source: 'ashby',
    ats: { type: 'ashby', slug: ref.slug },
    title: j.title || '',
    company: nice(ref.slug),
    location: [j.location, ...(j.secondaryLocations || []).map((s: any) => s.location)].filter(Boolean).join(' / ') || null,
    remote: j.isRemote === true,
    postedAt: j.publishedAt || null,
    salary: j.compensation?.compensationTierSummary || null,
    description: j.descriptionPlain || htmlToText(j.descriptionHtml) || '',
    html: sanitizeHtml(j.descriptionHtml || textToHtml(j.descriptionPlain || ''), page.url),
  };
}

async function workday(ref: Extract<AtsRef, { type: 'workday' }>, url: string): Promise<JobPage> {
  const data = await fetchPublicJson(api(`https://${ref.host}/wday/cxs/${ref.tenant}/${ref.site}${ref.path}`));
  const j = data.jobPostingInfo || {};
  const html = j.jobDescription || '';
  const page = emptyPage(j.externalUrl || url);
  return {
    ...page,
    source: 'workday',
    ats: { type: 'workday', slug: `${ref.host}|${ref.site}` },
    title: j.title || '',
    company: data.hiringOrganization?.name || nice(ref.tenant),
    location: [j.location, ...(j.additionalLocations || [])].filter(Boolean).join(' / ') || null,
    remote: /remote/i.test(`${j.location} ${j.remoteType || ''}`),
    postedAt: j.startDate || workdayPostedOn(j.postedOn),
    description: htmlToText(html) || '',
    html: sanitizeHtml(html, page.url),
  };
}

async function smartrecruiters(ref: Extract<AtsRef, { type: 'smartrecruiters' }>, url: string): Promise<JobPage> {
  const j = await fetchPublicJson(api(`https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(ref.slug)}/postings/${ref.id}`));
  const s = j.jobAd?.sections || {};
  const html = ['companyDescription', 'jobDescription', 'qualifications', 'additionalInformation']
    .map((k) => (s[k]?.text ? `<h3>${s[k].title || ''}</h3>${s[k].text}` : '')).join('');
  const loc = j.location || {};
  const page = emptyPage(j.postingUrl || url);
  return {
    ...page,
    applyUrl: j.applyUrl || url,
    source: 'smartrecruiters',
    ats: { type: 'smartrecruiters', slug: ref.slug },
    title: j.name || '',
    company: j.company?.name || nice(ref.slug),
    location: loc.fullLocation || [loc.city, loc.region, loc.country].filter(Boolean).join(', ') || null,
    remote: loc.remote === true,
    postedAt: j.releasedDate || null,
    description: htmlToText(html) || '',
    html: sanitizeHtml(html, page.url),
  };
}

async function generic(url: string): Promise<JobPage> {
  const res = await fetchPublic(url);
  if (res.status >= 400) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
  const ld = jobPostingFromHtml(res.body);
  const main = mainContent(res.body);
  const html = sanitizeHtml(main.html, res.url);
  const text = htmlToText(main.html) || '';
  const host = new URL(res.url).hostname.replace(/^www\./, '');
  return {
    ...emptyPage(res.url),
    title: ld?.title || main.title || host,
    company: ld?.company || nice(host.split('.')[0]),
    location: ld?.location || null,
    remote: ld?.remote ?? false,
    postedAt: ld?.postedAt || null,
    salary: ld?.salary || salaryFromText(ld?.description) || salaryFromText(text),
    // The JobPosting text is the posting itself; the page body may add menus and footers.
    description: (ld?.description && (ld.description.length > 200 || ld.description.length > text.length / 3) ? ld.description : text).slice(0, 20000),
    html: ld?.description && ld.description.length > text.length / 3 ? textToHtml(ld.description) : html,
    fields: formFields(res.body),
    frameable: frameAllowed(res.headers),
  };
}

// A board the scanner knows (the job's company row) identifies Greenhouse postings
// stored under the company's own careers link, such as acme.com/careers?gh_jid=123.
export type BoardHint = { atsType: string; atsSlug: string } | null | undefined;

function refFromBoard(url: string, board: BoardHint): AtsRef | null {
  if (board?.atsType !== 'greenhouse') return null;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const id = u.searchParams.get('gh_jid') || u.pathname.match(/\/(\d{3,})\/?$/)?.[1];
  return id && /^\d+$/.test(id) ? { type: 'greenhouse', slug: board.atsSlug, id } : null;
}

export async function loadJobPage(url: string, board?: BoardHint): Promise<JobPage> {
  const page = await readJobPage(url, board);
  return page.salary ? page : { ...page, salary: salaryFromText(page.description) };
}

async function readJobPage(url: string, board?: BoardHint): Promise<JobPage> {
  const ref = atsRef(url) ?? refFromBoard(url, board);
  if (ref) {
    try {
      if (ref.type === 'greenhouse') return await greenhouse(ref, url);
      if (ref.type === 'lever') return await lever(ref, url);
      if (ref.type === 'ashby') return await ashby(ref, url);
      if (ref.type === 'workday') return await workday(ref, url);
      return await smartrecruiters(ref, url);
    } catch (err) {
      // A closed posting, or an API change: fall back to reading the page itself.
      if ((err as { status?: number }).status === 404) throw err;
    }
  }
  return generic(url);
}

// Whether a site can be shown live inside the app.
export async function checkFrameable(url: string): Promise<boolean> {
  try {
    const res = await fetchPublic(url);
    return res.status < 400 && frameAllowed(res.headers);
  } catch {
    return false;
  }
}
