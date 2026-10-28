// The user journey, start to finish, on an iPhone screen and by tapping only:
// sign in, connect the AI, upload the CV, add pay and notice, run the first
// scan, find the jobs on the Jobs tab, apply with AI, approve, submit on the
// company's site, and see it as Applied. Starts from an empty database.
// Run by e2e.sh after the API and screen checks (MOCK_BOARDS=1 on the mock web).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

const { chromium, devices } = createRequire(import.meta.url)('playwright');

const BASE = process.env.BASE || 'http://localhost:3100';
const SHOTS = process.env.SHOTS || '/tmp/hunterops-shots';
fs.mkdirSync(SHOTS, { recursive: true });
const sql = (q) => execFileSync('psql', [process.env.DATABASE_URL, '-tAc', q]).toString().trim();

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 14'], baseURL: BASE });
const page = await ctx.newPage();
// Keep the run on this machine: the Apply-form view frames the employer's real
// form (Greenhouse), whose own scripts fail for a mock job and are not the app's.
await ctx.route((url) => !['localhost', '127.0.0.1'].includes(url.hostname), (r) => r.abort());
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
let n = 0;
const shot = (name) => page.screenshot({ path: `${SHOTS}/j${String(++n).padStart(2, '0')}-${name}.png`, fullPage: true });
const ok = (msg) => console.log(`  ✓ ${msg}`);
async function step(name, fn) {
  try {
    await fn();
    ok(name);
  } catch (err) {
    await shot('FAILED').catch(() => {});
    console.error(`  ✗ ${name}\n`, err);
    await browser.close();
    process.exit(1);
  }
}
const tabs = page.getByRole('navigation', { name: 'Tabs' });
const tab = (label) => tabs.getByRole('link', { name: label, exact: true });
// Waits for the app's answer to a tap, so a step never races the server.
const answered = (pathPart, method = 'PUT') => page.waitForResponse((r) => r.url().includes(pathPart) && r.request().method() === method, { timeout: 120_000 });

console.log(`User journey on iPhone 14 against ${BASE}`);

await step('sign in with the app password', async () => {
  await page.goto('/');
  await page.waitForURL(/\/login/);
  await page.fill('#pw', 'letmein');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(`${BASE}/`);
  await page.getByTestId('setup-card').waitFor();
  assert.equal(await page.locator('[data-step][data-done=true]').count(), 0, 'a fresh app has no setup step done');
  await shot('home-first-run');
});

await step('the phone tabs are Home, Jobs, Apply, Track and Me, and every page is in one of them', async () => {
  for (const label of ['Home', 'Jobs', 'Apply', 'Track', 'Me']) await tab(label).waitFor();
  await tab('Me').click();
  await page.waitForURL(/\/profile$/);
  const strip = page.getByTestId('section-tabs');
  for (const label of ['Profile', 'Settings', 'Alerts', 'All pages']) await strip.getByRole('link', { name: label }).waitFor();
  await strip.getByRole('link', { name: 'All pages' }).click();
  await page.waitForURL(/\/more$/);
  for (const label of ['Jobs', 'Discover', 'Applications', 'Resume', 'Browser', 'Pipeline', 'Mailroom', 'Insights', 'Profile', 'Settings', 'Alerts']) await page.getByRole('link', { name: new RegExp(`^${label}`) }).first().waitFor();
  await tab('Apply').click();
  await page.waitForURL(/\/apply$/);
  for (const label of ['Applications', 'Resume', 'Browser']) await strip.getByRole('link', { name: label }).waitFor();
  await tab('Track').click();
  await page.waitForURL(/\/pipeline$/);
  for (const label of ['Pipeline', 'Mailroom', 'Insights']) await strip.getByRole('link', { name: label }).waitFor();
  await shot('more');
  await tab('Me').click();
  await strip.getByRole('link', { name: 'All pages' }).click();
  await page.waitForURL(/\/more$/);
});

await step('connect the AI in Settings, and the Home step ticks', async () => {
  await page.getByRole('link', { name: /^Settings/ }).first().click();
  await page.waitForURL(/\/settings/);
  await page.selectOption('#provider', 'custom');
  await page.fill('#base', 'http://127.0.0.1:4010/v1');
  await page.fill('#model', 'deepseek-v4.1-flash');
  await page.fill('#key', 'e2e-key');
  const saved = answered('/api/settings');
  await page.locator('section', { has: page.locator('#provider') }).getByRole('button', { name: 'Save', exact: true }).click();
  assert.equal((await saved).status(), 200);
  // Adzuna, so the scan also reads a job board listing. Settings shows one group at a time.
  await page.getByRole('navigation', { name: 'Settings sections' }).getByRole('button', { name: 'Job search' }).click();
  await page.fill('#az1', 'e2e-app');
  await page.fill('#az2', 'adzuna-e2e');
  const feed = answered('/api/settings');
  await page.locator('section', { has: page.locator('#az1') }).getByRole('button', { name: 'Save', exact: true }).click();
  assert.equal((await feed).status(), 200);
  await tab('Home').click();
  await page.locator('[data-step=ai][data-done=true]').waitFor();
});

await step('upload the CV on Home: the profile fills in and the step ticks', async () => {
  await page.getByTestId('cv-input').setInputFiles(new URL('./fixtures/resume.pdf', import.meta.url).pathname);
  await page.locator('[data-step=cv][data-done=true]').waitFor({ timeout: 90_000 });
  await shot('home-cv-done');
});

await step('add expected CTC 7.5 and notice period in Profile, and the Home step ticks', async () => {
  const add = page.locator('[data-step=prefs]').getByRole('link', { name: 'Add in Profile' });
  await add.click();
  await page.waitForURL(/\/profile/);
  await page.fill('#expected', '7.5');
  await page.fill('#current', '6.5');
  // An empty pick list says so; it never looks filled in.
  assert.equal(await page.locator('#notice').inputValue(), '');
  await page.selectOption('#notice', 'Immediate (0 days)');
  const saved = answered('/api/profile');
  await page.getByRole('button', { name: 'Save profile' }).click();
  assert.equal((await saved).status(), 200);
  await page.getByText(/^Saved\./).waitFor();
  await page.reload();
  assert.equal(await page.locator('#expected').inputValue(), '7.5');
  assert.equal(await page.locator('#current').inputValue(), '6.5');
  assert.equal(await page.locator('#notice').inputValue(), 'Immediate (0 days)');
  await tab('Home').click();
  await page.locator('[data-step=prefs][data-done=true]').waitFor();
  await shot('home-prefs-done');
});

await step('run the first scan: real-shaped boards, the result says how many and links to them', async () => {
  const scanned = answered('/api/scan', 'POST');
  await page.locator('[data-step=scan]').getByTestId('scan').click();
  const res = await scanned;
  const s = await res.json();
  assert.equal(res.status(), 200, JSON.stringify(s));
  assert.ok(s.inserted >= 4, `inserted ${s.inserted}: ${JSON.stringify(s.errors.slice(0, 5))}`);
  // The scan step is the last one: the setup card is gone once it is done.
  await page.getByTestId('setup-card').waitFor({ state: 'detached' });
  await page.getByTestId('top-matches').waitFor();
  await shot('home-after-scan');
  // The engineer role is filtered out; the Workday posting came with its description.
  assert.equal(sql("SELECT count(*) FROM jobs WHERE title = 'Software Engineer, Infrastructure'"), '0');
  assert.match(sql("SELECT description FROM jobs WHERE title = 'Talent Sourcer'"), /Boolean search/);
  assert.notEqual(sql("SELECT grill_score FROM jobs WHERE title = 'Talent Sourcer'"), '');
});

await step('the Jobs tab lists every new job as a card with Apply with AI', async () => {
  await tab('Jobs').click();
  await page.waitForURL(/\/jobs/);
  const cards = page.getByTestId('job-card');
  await cards.first().waitFor();
  assert.ok((await cards.count()) >= 4, `cards: ${await cards.count()}`);
  for (const t of ['Senior Technical Recruiter', 'Talent Acquisition Partner, GTM', 'Talent Sourcer', 'Senior Talent Acquisition Partner']) await cards.filter({ hasText: t }).first().waitFor();
  assert.equal(await cards.first().getByTestId('card-apply').count(), 1);
  await shot('jobs');
});

await step('Apply with AI on a Greenhouse job: the real form questions, resume, cover letter and Career-Ops evaluation', async () => {
  await page.getByTestId('job-card').filter({ hasText: 'Senior Technical Recruiter' }).getByTestId('card-apply').click();
  await page.waitForURL(/\/apply\//);
  const prepared = answered('/api/applications', 'POST');
  await page.getByTestId('prepare-application').click();
  assert.equal((await prepared).status(), 202);
  // The steps show on the page while it works.
  await page.getByTestId('apply-progress').getByTestId('task-steps').waitFor();
  await shot('apply-progress');
  await page.locator('[data-testid=apply-view][data-status=PENDING]').waitFor({ timeout: 120_000 });
  const labels = await page.getByTestId('apply-answer').allInnerTexts();
  const values = await page.getByTestId('apply-answer').locator('input, textarea').evaluateAll((els) => els.map((e) => e.value));
  assert.ok(labels.some((l) => /What is your notice period\?/.test(l)), 'the form’s own question is there');
  assert.ok(values.some((v) => /Immediate/.test(v)), `notice answered from the profile: ${values.join(' | ')}`);
  assert.ok(!labels.some((l) => /country-selector/.test(l)));
  await page.getByTestId('apply-resume').waitFor();
  await page.getByTestId('apply-evaluation').waitFor();
  await shot('apply-pending');
});

await step('the Apply tab shows it as Approval pending', async () => {
  await tab('Apply').click();
  await page.waitForURL(/\/apply$/);
  const row = page.getByTestId('apply-row').filter({ hasText: 'Senior Technical Recruiter' });
  await row.getByText('Approval pending').waitFor();
  await shot('apply-hub');
  await row.click();
  await page.waitForURL(/\/apply\//);
});

await step('approve, open the company form, submit there, then mark it submitted', async () => {
  await page.getByTestId('approve-application').click();
  await page.getByTestId('confirm-approve').click();
  await page.locator('[data-testid=apply-view][data-status=APPROVED]').waitFor();
  assert.equal(await page.getByTestId('open-form').count(), 1);
  await page.getByTestId('mark-submitted').click();
  await page.locator('[data-testid=apply-view][data-status=SUBMITTED]').waitFor();
  assert.equal(sql("SELECT status FROM jobs WHERE title = 'Senior Technical Recruiter'"), 'APPLIED');
});

await step('the Pipeline shows it in Applied', async () => {
  await tab('Track').click();
  await page.waitForURL(/\/pipeline/);
  await page.locator('[data-column=applied]').getByText('Senior Technical Recruiter').first().waitFor();
  await shot('pipeline');
});

await step('Apply with AI on an Adzuna job finds the employer’s own posting and its real questions', async () => {
  await tab('Jobs').click();
  await page.getByTestId('job-card').filter({ hasText: 'Senior Talent Acquisition Partner' }).filter({ hasText: 'adzuna' }).getByTestId('card-apply').click();
  await page.waitForURL(/\/apply\//);
  await page.getByTestId('prepare-application').click();
  await page.locator('[data-testid=apply-view][data-status=PENDING]').waitFor({ timeout: 120_000 });
  await page.getByText(/Found the employer's own posting/).waitFor();
  const labels = await page.getByTestId('apply-answer').allInnerTexts();
  assert.ok(labels.some((l) => /Why do you want to join Acme Cloud\?/.test(l)), labels.join(' | '));
  // The employer's full posting replaced the job board's snippet, so the resume and evaluation were made.
  await page.getByTestId('apply-resume').waitFor();
  await page.getByTestId('apply-evaluation').waitFor();
  assert.ok(!labels.some((l) => /country-selector/.test(l)));
  await shot('apply-adzuna');
});

await step('open the Adzuna job in the Browser: the employer’s own posting and form open instead of the blocked page', async () => {
  const jobId = page.url().split('/apply/')[1].split(/[?#]/)[0];
  await page.goto(`/browser/${jobId}`);
  await page.getByTestId('employer-banner').waitFor({ timeout: 60_000 });
  await page.getByTestId('employer-banner').getByText(/hides the application form/).waitFor();
  assert.equal(await page.getByTestId('frame-blocked').count(), 0);
  await page.getByRole('tab', { name: 'Apply form', selected: true }).waitFor();
  await shot('browser-employer-form');
});

await step('start Apply, press back: the progress stays on every screen, then a pop-up and the bell say it is ready', async () => {
  await tab('Jobs').click();
  await page.getByTestId('job-card').filter({ hasText: 'Talent Acquisition Partner, GTM' }).getByTestId('card-apply').click();
  await page.waitForURL(/\/apply\//);
  const started = answered('/api/applications', 'POST');
  await page.getByTestId('prepare-application').click();
  assert.equal((await started).status(), 202);
  await page.goBack();
  await page.waitForURL(/\/jobs/);
  const bar = page.getByTestId('activity-bar');
  await bar.waitFor();
  await bar.getByText('Preparing application').waitFor();
  await shot('progress-bar-after-back');
  // It follows to other tabs.
  await tab('Track').click();
  await bar.waitFor();
  // Done: the bar goes, a pop-up links to it, the bell counts it.
  await bar.waitFor({ state: 'detached', timeout: 120_000 });
  await page.getByTestId('toast').filter({ hasText: /Ready for your approval: Figma: Talent Acquisition Partner, GTM/ }).waitFor();
  await shot('toast-ready');
  const count = Number(await page.locator('[data-testid=bell-count]:visible').innerText());
  assert.ok(count >= 2, `bell count ${count}`);
  await page.locator('[data-testid=bell]:visible').click();
  await page.waitForURL(/\/notifications/);
  const note = page.getByTestId('notification').filter({ hasText: 'Talent Acquisition Partner, GTM' }).first();
  await note.waitFor();
  await page.getByTestId('push-card').waitFor();
  await shot('notifications');
  // Seen: the bell clears.
  await page.locator('[data-testid=bell-count]:visible').waitFor({ state: 'detached' });
  // Everything was made: no "Not made" in the notification.
  assert.doesNotMatch(await note.innerText(), /Not made/);
  await note.click();
  await page.waitForURL(/\/apply\//);
  await page.locator('[data-testid=apply-view][data-status=PENDING]').waitFor();
  await page.getByTestId('apply-resume').waitFor();
  await page.getByTestId('apply-evaluation').waitFor();
});

await step('Prepare my top matches on the Apply tab prepares the rest for approval', async () => {
  await tab('Apply').click();
  const done = answered('/api/applications/auto', 'POST');
  await page.getByTestId('prepare-top').first().click();
  const out = await (await done).json();
  assert.ok(out.started.length >= 1, JSON.stringify(out));
  await page.getByText(/Preparing \d+ application/).waitFor();
  await page.getByTestId('activity-bar').waitFor();
  await page.getByTestId('activity-bar').waitFor({ state: 'detached', timeout: 150_000 });
  await page.getByTestId('apply-row').filter({ hasText: 'Approval pending' }).first().waitFor();
  await shot('apply-hub-after');
});

await step('a job board listing that refuses apps still opens in the Browser, as the scan saved it', async () => {
  const id = sql("SELECT id FROM jobs WHERE company = 'Quietfirm Talent'");
  assert.ok(id, 'the second Adzuna job is on the board');
  await page.goto(`/browser/${id}`);
  await page.getByTestId('saved-banner').waitFor({ timeout: 90_000 });
  await page.getByTestId('reader-frame').waitFor();
  assert.match(await page.getByTestId('reader-frame').getAttribute('srcdoc'), /Boolean sourcing/);
  await shot('browser-saved-posting');
});

await step('the Resume page makes the master resume and lists the tailored one', async () => {
  await tab('Apply').click();
  await page.getByTestId('section-tabs').getByRole('link', { name: 'Resume' }).click();
  await page.waitForURL(/\/resume$/);
  await page.getByTestId('master-resume').waitFor();
  const file = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download PDF' }).click();
  assert.match((await file).suggestedFilename(), /\.pdf$/);
  assert.ok(await page.getByTestId('saved-resume').count() >= 1, 'the resume Apply with AI made is listed');
  await shot('resume');
});

await step('no screen scrolls sideways and no script errors along the way', async () => {
  for (const path of ['/', '/jobs', '/apply', '/resume', '/pipeline', '/more', '/profile', '/settings', '/notifications']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    const w = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    assert.ok(w[0] <= w[1], `${path} scrolls sideways (${w[0]} > ${w[1]})`);
  }
  assert.deepEqual(errors, []);
});

await browser.close();
console.log(`\nUser journey passed. Screenshots in ${SHOTS}`);
