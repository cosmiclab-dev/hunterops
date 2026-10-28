// The same user journey against the real internet: real company boards and
// job sites for the scan, real ATS pages for Apply with AI, and the free web
// search for Discover. Only the AI is the local stand-in (no key in CI).
// Runs in GitHub Actions (e2e-live.sh); the sandbox where HunterOps is built
// cannot reach these sites. Assertions allow for a live market that changes daily.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

const { chromium, devices } = createRequire(import.meta.url)('playwright');

const BASE = process.env.BASE || 'http://localhost:3100';
const SHOTS = process.env.SHOTS || '/tmp/hunterops-shots';
fs.mkdirSync(SHOTS, { recursive: true });
// A real AI when the workflow provides one (GitHub Models), else the local stand-in.
const REAL_AI = Boolean(process.env.REAL_AI_KEY);
const AI = REAL_AI
  ? { base: process.env.REAL_AI_BASE, model: process.env.REAL_AI_MODEL, key: process.env.REAL_AI_KEY }
  : { base: 'http://127.0.0.1:4010/v1', model: 'deepseek-v4.1-flash', key: 'e2e-key' };
const sql = (q) => execFileSync('psql', [process.env.DATABASE_URL, '-tAc', q]).toString().trim();

const browser = await chromium.launch();
const page = await (await browser.newContext({ ...devices['iPhone 14'], baseURL: BASE })).newPage();
let n = 0;
const shot = (name) => page.screenshot({ path: `${SHOTS}/live${String(++n).padStart(2, '0')}-${name}.png`, fullPage: true });
async function step(name, fn) {
  try {
    const note = await fn();
    console.log(`  ✓ ${name}${note ? ` (${note})` : ''}`);
  } catch (err) {
    await shot('FAILED').catch(() => {});
    console.error(`  ✗ ${name}\n`, err);
    process.exit(1);
  }
}
const tab = (label) => page.getByRole('navigation', { name: 'Tabs' }).getByRole('link', { name: label, exact: true });
const answered = (part, method) => page.waitForResponse((r) => r.url().includes(part) && r.request().method() === method, { timeout: 180_000 });

console.log(`Live user journey against the real job sites, app at ${BASE}, AI: ${REAL_AI ? `${AI.model} (real)` : 'local stand-in'}`);

await step('sign in, connect the AI, upload the CV, add pay and notice', async () => {
  await page.goto('/login');
  await page.fill('#pw', 'letmein');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(`${BASE}/`);
  await page.goto('/settings');
  await page.selectOption('#provider', 'custom');
  await page.fill('#base', AI.base);
  await page.fill('#model', AI.model);
  await page.fill('#key', AI.key);
  const saved = answered('/api/settings', 'PUT');
  await page.locator('section', { has: page.locator('#provider') }).getByRole('button', { name: 'Save', exact: true }).click();
  assert.equal((await saved).status(), 200);
  await tab('Home').click();
  await page.getByTestId('cv-input').setInputFiles(new URL('./fixtures/resume.pdf', import.meta.url).pathname);
  await page.locator('[data-step=cv][data-done=true]').waitFor({ timeout: 90_000 });
  await page.goto('/profile');
  await page.fill('#expected', '7.5');
  await page.selectOption('#notice', 'Immediate (0 days)');
  const p = answered('/api/profile', 'PUT');
  await page.getByRole('button', { name: 'Save profile' }).click();
  assert.equal((await p).status(), 200);
});

let summary;
await step('Scan now reads the real company boards and job sites and saves recruiter jobs', async () => {
  await tab('Home').click();
  const scanned = answered('/api/scan', 'POST');
  await page.locator('[data-step=scan]').getByTestId('scan').click();
  const res = await scanned;
  summary = await res.json();
  assert.equal(res.status(), 200, JSON.stringify(summary));
  assert.ok(summary.fetched > 1000, `only ${summary.fetched} postings fetched`);
  assert.ok(summary.inserted >= 5, `only ${summary.inserted} jobs saved; errors: ${JSON.stringify(summary.errors.slice(0, 8))}`);
  await page.getByTestId('top-matches').waitFor();
  await shot('home');
  return `${summary.fetched} postings from ${summary.sources} sources, ${summary.inserted} saved, ${summary.errors.length} sources failed`;
});

await step('Workday jobs come with their full description', async () => {
  const total = Number(sql("SELECT count(*) FROM jobs WHERE source = 'workday'"));
  const withText = Number(sql("SELECT count(*) FROM jobs WHERE source = 'workday' AND length(description) > 300"));
  if (total) assert.ok(withText >= Math.ceil(total / 2), `${withText} of ${total} Workday jobs have a description`);
  return `${withText} of ${total}`;
});

await step('the Jobs tab lists them', async () => {
  await tab('Jobs').click();
  const cards = page.getByTestId('job-card');
  await cards.first().waitFor();
  assert.ok((await cards.count()) >= Math.min(5, summary.inserted));
  await shot('jobs');
  return `${await cards.count()} cards`;
});

await step('Apply with AI on a real Greenhouse, Lever or Ashby job reads its real application form', async () => {
  const row = sql("SELECT id || '|' || title || '|' || company FROM jobs WHERE source IN ('greenhouse', 'lever', 'ashby') AND url NOT LIKE '%gh_jid%' ORDER BY grill_score DESC NULLS LAST LIMIT 1");
  if (!row) return 'no Greenhouse, Lever or Ashby job in today’s scan: skipped';
  const [id, title, company] = row.split('|');
  await page.goto(`/apply/${id}`);
  const prepared = answered('/api/applications', 'POST');
  await page.getByTestId('prepare-application').click();
  const res = await prepared;
  assert.equal(res.status(), 202, await res.text());
  await page.locator('[data-testid=apply-view]:not([data-status=PREPARING])').waitFor({ timeout: Number(process.env.APPLY_WAIT_MS) || 280_000 });
  const status = await page.getByTestId('apply-view').getAttribute('data-status');
  const app = JSON.parse(sql(`SELECT row_to_json(a) FROM (SELECT status, error, notes, resume_id, length(cover_letter) AS letter FROM applications WHERE job_id = '${id}') a`));
  assert.equal(status, 'PENDING', JSON.stringify(app));
  const labels = await page.getByTestId('apply-answer').allInnerTexts();
  assert.ok(labels.length >= 3, labels.join(' | '));
  assert.ok(labels.some((l) => /e-?mail/i.test(l)), `no email question: ${labels.join(' | ')}`);
  await shot('apply');
  // With a real AI, every part must be there: nothing quietly missing.
  if (REAL_AI) {
    assert.ok(app.resume_id, `no tailored resume: ${JSON.stringify(app.notes)}`);
    assert.ok(app.letter > 200, `no cover letter: ${JSON.stringify(app.notes)}`);
    const score = sql(`SELECT score FROM reports WHERE job_id = '${id}' ORDER BY created_at DESC LIMIT 1`);
    assert.ok(Number(score) >= 1, `evaluation without a score (${score}): ${JSON.stringify(app.notes)}`);
    await page.getByTestId('apply-evaluation').waitFor();
  }
  return `${title} at ${company}: ${labels.length} questions${REAL_AI ? ', resume, cover letter and a scored evaluation' : ''}`;
});

await step('Discover finds live postings with the free web search', async () => {
  const body = await page.evaluate(async () => {
    const r = await fetch('/api/discover/search', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ roles: ['Talent Acquisition'], locations: ['bengaluru'], window: 'w' }) });
    return { status: r.status, ...(await r.json()) };
  });
  assert.equal(body.status, 200, JSON.stringify(body));
  assert.ok(body.web.length > 0, `no web results; engines said: ${JSON.stringify(body.errors)}`);
  return `${body.web.length} web results, ${body.board.length} from the board${body.errors.length ? `; ${body.errors.join('; ')}` : ''}`;
});

await browser.close();
console.log('\nLive user journey passed.');
