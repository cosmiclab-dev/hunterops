import { hasAppSecret } from '@/lib/crypto';
import { prisma } from '@/lib/db';
import { ok, route } from '@/lib/http';
import { loadJobPage } from '@/lib/job-page';
import { chat, llmConfig } from '@/lib/llm/client';
import { PROVIDERS } from '@/lib/llm/providers';
import { gmailTransport } from '@/lib/mailer';
import { loadProfile, profileIsEmpty } from '@/lib/profile';
import { ATS_FETCHERS, BOARD_FETCHERS, type CompanyRow, type Posting, type ScanCtx } from '@/lib/scan/sources';
import { SEED_COMPANIES } from '@/lib/scan/seed-companies';
import { loadSettings } from '@/lib/settings';
import { bingSearch, duckSearch, searchConfig, SEARCH_PROVIDERS, webSearch } from '@/lib/websearch';
import { crawlerFrom, testCrawler, testHostedReader } from '@/lib/crawl4ai';

export const dynamic = 'force-dynamic';
// The checks run in parallel (30 s each at most), then the browser check (30 s).
export const maxDuration = 120;

type Check = { id: string; group: string; label: string; ok: boolean; skipped?: boolean; ms: number; detail: string };
class Skip extends Error {}

const CHECK_TIMEOUT_MS = 30_000;

async function run(id: string, group: string, label: string, fn: () => Promise<string>): Promise<Check> {
  const started = Date.now();
  try {
    const detail = await Promise.race([
      fn(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Took longer than 30 seconds.')), CHECK_TIMEOUT_MS)),
    ]);
    return { id, group, label, ok: true, ms: Date.now() - started, detail };
  } catch (err) {
    const skipped = err instanceof Skip;
    return { id, group, label, ok: false, skipped, ms: Date.now() - started, detail: (err as Error).message || 'Failed' };
  }
}

// One company per ATS: prefer one from the person's own list, else a built-in one.
async function sampleCompanies(): Promise<Record<string, CompanyRow>> {
  const rows = await prisma.company.findMany({ where: { active: true, lastStatus: 'ok' }, orderBy: { lastFound: 'desc' }, take: 200 });
  const out: Record<string, CompanyRow> = {};
  for (const r of rows) out[r.atsType] ??= { name: r.name, ats_type: r.atsType, ats_slug: r.atsSlug };
  for (const [name, ats_type, ats_slug] of SEED_COMPANIES) out[ats_type] ??= { name, ats_type, ats_slug };
  return out;
}

// Real calls against the live services this deploy depends on. Nothing is
// sent, saved or applied; the Gmail check only logs in.
export const POST = route(async () => {
  const settings = await loadSettings();
  const ctx: ScanCtx = {
    searchTerms: ['recruiter'],
    settings: { adzuna_app_id: settings.get('adzuna_app_id'), adzuna_app_key: settings.get('adzuna_app_key') },
  };
  const companies = await sampleCompanies();
  let greenhouseJobs: Posting[] = [];

  const ats = Object.keys(ATS_FETCHERS).filter((t) => companies[t]).map((t) =>
    run(`ats-${t}`, 'Company career sites', `${t[0].toUpperCase()}${t.slice(1)} (${companies[t].name})`, async () => {
      const jobs = await ATS_FETCHERS[t](companies[t], ctx);
      if (t === 'greenhouse') greenhouseJobs = jobs;
      // Workday and SmartRecruiters are searched for "recruiter"; the others list every role.
      if (t === 'workday' || t === 'smartrecruiters') {
        return jobs.length ? `${jobs.length} recruiter roles found.` : 'Connected. No recruiter roles open there right now.';
      }
      return `${jobs.length} open roles read.`;
    }));

  const boards = Object.keys(BOARD_FETCHERS).map((b) =>
    run(`board-${b}`, 'Job boards', b[0].toUpperCase() + b.slice(1), async () => {
      const out = await BOARD_FETCHERS[b](ctx);
      if ('skipped' in out) throw new Skip(out.skipped);
      return `${out.length} recruiter roles found.`;
    }));

  const first = await Promise.all([
    run('db', 'Your data', 'Database', async () => {
      const [jobs, contacts] = await Promise.all([prisma.job.count(), prisma.contact.count()]);
      return `Connected. ${jobs} jobs and ${contacts} contacts saved.`;
    }),
    run('signin', 'Your data', 'Sign-in protection', async () => {
      if (!process.env.APP_PASSWORD) throw new Error('No APP_PASSWORD is set, so anyone with the link can open this app and your saved keys. Add APP_PASSWORD in Vercel, Settings, Environment Variables, then redeploy.');
      if (!hasAppSecret()) throw new Error('APP_SECRET is missing or shorter than 32 characters, so API keys cannot be saved. Add a long random APP_SECRET in Vercel, then redeploy.');
      return 'Password sign-in is on and saved keys are encrypted.';
    }),
    run('profile', 'Your data', 'Profile', async () => {
      const p = await loadProfile();
      if (profileIsEmpty(p)) throw new Error('No profile yet. Fill it in on the Profile page so jobs can be scored.');
      return `${p!.name || 'Saved'}, ${p!.experience.length} roles, ${p!.skills.length} skills.`;
    }),
    run('scan', 'Your data', 'Last scan', async () => {
      const last = await prisma.scanRun.findFirst({ orderBy: { startedAt: 'desc' } });
      if (!last) throw new Skip('No scan has run yet. Press Scan on the Jobs page.');
      const errs = Array.isArray(last.errors) ? last.errors.length : 0;
      const at = last.startedAt.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });
      if (!last.finishedAt) {
        if (Date.now() - last.startedAt.getTime() < 5 * 60_000) return `A scan started at ${at} is running now.`;
        throw new Error(`The scan started ${at} never finished (it ran out of time). The next scan picks up where it stopped.`);
      }
      return `${at}: ${last.fetched ?? 0} read, ${last.inserted ?? 0} new, ${errs} sources failed.`;
    }),
    run('ai', 'AI', 'AI model', async () => {
      const cfg = llmConfig(settings);
      const out = await chat(cfg, [
        { role: 'system', content: 'Reply with the single word: ready' },
        { role: 'user', content: 'Status?' },
      ], { maxTokens: 1024, timeoutMs: 28_000 });
      return `${PROVIDERS[cfg.provider].label}, ${out.model}: "${out.content.trim().slice(0, 30)}"`;
    }),
    run('reader', 'Company career sites', crawlerFrom(settings) ? 'Page reader (your Crawl4AI)' : 'Page reader (built-in)', async () => {
      const crawler = crawlerFrom(settings);
      return crawler ? testCrawler(crawler) : testHostedReader();
    }),
    ...(() => {
      const cfg = searchConfig(settings);
      if (cfg.provider !== 'free') {
        return [run('search-api', 'Web search', SEARCH_PROVIDERS[cfg.provider].label, async () => {
          if (!cfg.key) throw new Error('Paste your API key in Settings, Web search.');
          const r = await webSearch(cfg, 'recruiter Bengaluru site:boards.greenhouse.io', 'w', 10);
          if (!r.length) throw new Error('Answered, but with no results.');
          return `${r.length} results.`;
        })];
      }
      // Free engines often refuse cloud servers; point to the fix rather than just failing.
      const tip = ' Bing and DuckDuckGo often refuse cloud servers. Get a free Serper key and pick Serper in Settings, Web search.';
      return [
        run('search-bing', 'Web search', 'Bing (free)', async () => {
          const r = await bingSearch('recruiter Bengaluru site:boards.greenhouse.io', 'w', 10).catch((e) => { throw new Error(e.message + tip); });
          if (!r.length) throw new Error('Answered, but with no results.' + tip);
          return `${r.length} results.`;
        }),
        run('search-ddg', 'Web search', 'DuckDuckGo (free)', async () => {
          const r = await duckSearch('recruiter Bengaluru site:boards.greenhouse.io', 'w').catch((e) => { throw new Error(e.message + tip); });
          if (!r.length) throw new Error('Answered, but with no results.' + tip);
          return `${r.length} results.`;
        }),
      ];
    })(),
    run('gmail', 'Email', 'Gmail sign-in', async () => {
      const user = settings.get('smtp_user');
      const pass = settings.get('smtp_app_password');
      if (!user || !pass) throw new Skip('Add your Gmail address and app password in Settings.');
      await gmailTransport(user, pass).verify();
      return `Signed in as ${user}. Nothing was sent.`;
    }),
    ...ats,
    ...boards,
  ]);

  // The in-app browser reads a real posting through the server.
  const browser = await run('browser', 'In-app browser', 'Open a live job page', async () => {
    const job = greenhouseJobs[0];
    if (!job) throw new Skip('Skipped because the Greenhouse check found no job to open.');
    const page = await loadJobPage(job.url, { atsType: 'greenhouse', atsSlug: companies.greenhouse.ats_slug });
    if (page.description.length < 200) throw new Error('The page opened but had almost no text.');
    return `"${page.title.slice(0, 60)}" read, ${page.description.length} characters.`;
  });

  const checks = [...first, browser];
  return ok({ ranAt: new Date().toISOString(), passed: checks.filter((c) => c.ok).length, failed: checks.filter((c) => !c.ok && !c.skipped).length, checks });
});
