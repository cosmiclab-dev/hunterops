// Live checks against the real internet: the free search engines, every ATS
// the scanner reads, the job boards, the page reader and DNS. Runs on GitHub
// Actions (open network), not in `npm test`. Each check prints what it saw so
// the run log doubles as a health report. Nothing is sent or saved.
import { appendFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bingSearch, duckSearch } from '@/lib/websearch';
import { ATS_FETCHERS, BOARD_FETCHERS, type Posting, type ScanCtx } from '@/lib/scan/sources';
import { SEED_COMPANIES } from '@/lib/scan/seed-companies';
import { loadJobPage } from '@/lib/job-page';
import { hostedReadPage } from '@/lib/crawl4ai';
import { hasMx } from '@/lib/email-guess';

const ctx: ScanCtx = { searchTerms: ['recruiter', 'talent acquisition'], settings: { adzuna_app_id: null, adzuna_app_key: null } };
const lines: string[] = [];
const report = (line: string) => {
  lines.push(line);
  console.log(line);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${line}\n`);
};

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) {
      const k = i++;
      out[k] = await fn(items[k]);
    }
  }));
  return out;
}

describe('free web search', () => {
  it('Bing or DuckDuckGo answers with results', async () => {
    const q = 'recruiter Bengaluru site:boards.greenhouse.io';
    const [bing, ddg] = await Promise.allSettled([bingSearch(q, 'w', 10), duckSearch(q, 'w')]);
    const show = (r: PromiseSettledResult<unknown[]>) => (r.status === 'fulfilled' ? `${r.value.length} results` : `failed: ${(r.reason as Error).message}`);
    report(`| Search | Bing: ${show(bing)} | DuckDuckGo: ${show(ddg)} |`);
    const total = (bing.status === 'fulfilled' ? bing.value.length : 0) + (ddg.status === 'fulfilled' ? ddg.value.length : 0);
    expect(total, 'both free search engines returned nothing').toBeGreaterThan(0);
  }, 60_000);
});

let greenhouseJob: Posting | null = null;

describe('company career sites (every starter board)', () => {
  it('each ATS type reads, and most starter boards answer', async () => {
    const results = await pool(SEED_COMPANIES, 8, async ([name, ats_type, ats_slug]) => {
      try {
        const jobs = await ATS_FETCHERS[ats_type]({ name, ats_type, ats_slug }, ctx);
        if (ats_type === 'greenhouse' && jobs.length && !greenhouseJob) greenhouseJob = jobs[0];
        return { name, ats_type, ats_slug, ok: true, n: jobs.length, err: '' };
      } catch (e) {
        return { name, ats_type, ats_slug, ok: false, n: 0, err: (e as Error).message.slice(0, 80) };
      }
    });
    report('\n| ATS | boards | answered | failed |\n|---|---|---|---|');
    const types = [...new Set(results.map((r) => r.ats_type))];
    for (const t of types) {
      const rs = results.filter((r) => r.ats_type === t);
      report(`| ${t} | ${rs.length} | ${rs.filter((r) => r.ok).length} | ${rs.filter((r) => !r.ok).length} |`);
    }
    const failed = results.filter((r) => !r.ok);
    if (failed.length) {
      report('\nBoards that failed (the scanner pauses these on 404):');
      for (const f of failed) report(`- ${f.name} (${f.ats_type}/${f.ats_slug}): ${f.err}`);
    }
    for (const t of types) expect(results.some((r) => r.ats_type === t && r.ok), `no ${t} board answered`).toBe(true);
    expect(failed.length / results.length, 'more than a third of starter boards failed').toBeLessThan(0.34);
  }, 300_000);
});

describe('job boards', () => {
  it('each board answers or says why it is skipped', async () => {
    for (const [name, fn] of Object.entries(BOARD_FETCHERS)) {
      try {
        const out = await fn(ctx);
        report(`| Board ${name} | ${'skipped' in out ? `skipped: ${out.skipped}` : `${out.length} recruiter roles`} |`);
      } catch (e) {
        report(`| Board ${name} | FAILED: ${(e as Error).message.slice(0, 100)} |`);
        throw e;
      }
    }
  }, 120_000);
});

describe('in-app browser', () => {
  it('opens a real Greenhouse posting with its questions', async () => {
    expect(greenhouseJob, 'no Greenhouse job found to open').toBeTruthy();
    const page = await loadJobPage(greenhouseJob!.url);
    report(`| Browser | ${page.title} at ${page.company}: ${page.description.length} chars, ${page.fields.length} form fields |`);
    expect(page.description.length).toBeGreaterThan(300);
  }, 60_000);
});

describe('built-in page reader', () => {
  it('renders a JavaScript-only job posting through the hosted reader', async () => {
    // An Ashby posting page is built entirely by JavaScript; a plain fetch gets an empty shell.
    const board = await fetch('https://api.ashbyhq.com/posting-api/job-board/deel').then((r) => r.json()) as { jobs: { jobUrl: string }[] };
    const url = board.jobs[0].jobUrl;
    const page = await hostedReadPage(url);
    report(`| Page reader | ${page.title || '(no title)'}: ${page.markdown.length} chars from ${url} |`);
    if (page.markdown.length <= 400) report(`| Page reader text | ${page.markdown.replace(/\s+/g, ' ').slice(0, 300)} |`);
    expect(page.markdown.length).toBeGreaterThan(400);
  }, 60_000);
});

describe('email guesses', () => {
  it('checks mail servers with DNS', async () => {
    const ok = await hasMx('gmail.com');
    report(`| DNS MX | gmail.com: ${ok ? 'found' : 'missing'} |`);
    expect(ok).toBe(true);
  }, 30_000);
});
