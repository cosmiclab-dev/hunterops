// Browser pass, run after run.mjs: a 1280px desktop pass through every screen
// (sidebar, Discover, Pipeline drag and drop, in-app Browser, job page, Mailroom,
// profile, settings), then an iPhone pass for layout, and dark theme on both.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

// Playwright is not an app dependency; install it (npm i -D playwright) to run this file.
const { chromium, devices } = createRequire(import.meta.url)('playwright');

const BASE = process.env.BASE || 'http://localhost:3100';
const SHOTS = process.env.SHOTS || '/tmp/hunterops-shots';
fs.mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch();
const errors = [];
const ok = (msg) => console.log(`  ✓ ${msg}`);
// On a failure, keep a screenshot of the page as it was.
let current = null;
process.on('uncaughtException', async (err) => {
  console.error(err);
  if (current) await current.screenshot({ path: `${SHOTS}/FAILED.png`, fullPage: true }).catch(() => {});
  process.exit(1);
});

async function open(viewport) {
  const ctx = await browser.newContext(viewport);
  const page = await ctx.newPage();
  current = page;
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`${BASE}/`);
  await page.waitForURL(/\/login/);
  await page.fill('#pw', 'letmein');
  await page.click('button[type=submit]');
  await page.waitForURL(`${BASE}/`);
  return page;
}
const noSideScroll = async (page, where) => {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(over <= 0, `${where} scrolls sideways by ${over}px`);
};

// ---------------- Desktop ----------------
const page = await open({ viewport: { width: 1280, height: 860 } });
const shot = (name) => page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });

// run.mjs leaves the daily cap at 2 (and used it up); lift it for this pass.
await page.request.put(`${BASE}/api/settings`, { data: { values: { daily_email_cap: '20' } } });

await page.goto(`${BASE}/`);
await page.getByText('to your 31 December offer goal').waitFor();
await page.getByText('Follow up with Practice Head').waitFor();
const sidebar = page.getByRole('complementary', { name: 'Sidebar' });
for (const label of ['Discover', 'Pipeline', 'Browser', 'Mailroom']) await sidebar.getByRole('link', { name: label }).waitFor();
assert.ok((await sidebar.boundingBox()).x === 0, 'sidebar not fixed on the left');
await noSideScroll(page, 'home');
await shot('d00-home');
ok('desktop home: fixed sidebar with Discover, Pipeline, Browser, Mailroom');

// Discover: results arrive inside the app, nothing sends you to Google.
await sidebar.getByRole('link', { name: 'Discover' }).click();
await page.waitForURL(/\/discover/);
await page.getByTestId('discover-search').click();
const web = page.getByTestId('web-results');
await web.getByTestId('web-result').first().waitFor();
assert.equal(await page.locator('a[href*="google."]').count(), 0, 'Google link on Discover');
await shot('d01-discover');
const lever = web.getByTestId('web-result').filter({ hasText: 'Talent Acquisition Specialist' });
await lever.getByTestId('add-result').click();
await lever.getByRole('button', { name: 'Added' }).waitFor();
ok('discover: in-app X-Ray results, Add saves a job, no Google links');

// Pipeline: four columns and a real drag with dnd-kit.
await sidebar.getByRole('link', { name: 'Pipeline' }).click();
await page.waitForURL(/\/pipeline/);
for (const name of ['Scouted', 'Grilled 75+', 'Applied', 'Rejected']) await page.getByRole('region', { name }).waitFor();
const scouted = page.getByRole('region', { name: 'Scouted' });
const grilled = page.getByRole('region', { name: 'Grilled 75+' });
const card = (await grilled.getByTestId('kanban-card').count()) ? grilled.getByTestId('kanban-card').first() : scouted.getByTestId('kanban-card').first();
await card.waitFor();
const jobId = await card.getAttribute('data-job');
const from = await card.boundingBox();
const target = await page.locator('[data-column=applied]').boundingBox();
// Grab the card by its grip (the title and Open links don't start a drag).
const grip = await card.locator('svg.lucide-grip-vertical').boundingBox();
await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
await page.mouse.down();
await page.mouse.move(grip.x + 20, grip.y + 20, { steps: 5 });
await page.mouse.move(target.x + target.width / 2, target.y + 80, { steps: 15 });
await page.mouse.up();
const applied = page.getByRole('region', { name: 'Applied' });
await applied.locator(`[data-job="${jobId}"]`).waitFor();
await shot('d02-pipeline');
await page.reload();
await page.getByRole('region', { name: 'Applied' }).locator(`[data-job="${jobId}"]`).waitFor();
ok('pipeline: drag a card into Applied and it sticks after reload');

// Rejected via the "Move to" fallback, then back.
const moving = page.getByRole('region', { name: 'Applied' }).locator(`[data-job="${jobId}"]`);
await moving.locator('select').selectOption('rejected');
await page.getByRole('region', { name: 'Rejected' }).locator(`[data-job="${jobId}"]`).waitFor();
ok('pipeline: Move to… select works without dragging');

// In-app Browser on the imported Greenhouse job.
await sidebar.getByRole('link', { name: 'Browser' }).click();
await page.waitForURL(/\/browser$/);
await page.getByTestId('browser-job').filter({ hasText: 'Acme Cloud' }).first().click();
await page.waitForURL(/\/browser\/[0-9a-f-]{36}/);
await page.getByTestId('browser').waitFor();
const reader = page.frameLocator('[data-testid=reader-frame]');
await reader.getByText('Bengaluru GCC').first().waitFor();
assert.equal(await reader.locator('script').count(), 0);
const panel = page.getByRole('complementary', { name: 'HunterOps control panel' });
await panel.getByTestId('analyze').click();
await panel.getByTestId('score-gauge').waitFor();
assert.notEqual(await panel.getByTestId('score-gauge').getAttribute('data-band'), 'none');
await panel.getByTestId('grill-breakdown').getByText('Salary fit').waitFor();
// Analyze re-reads the posting through the ATS, so pay and location still count.
assert.match(await panel.getByTestId('grill-breakdown').innerText(), /Pays 22-30 LPA/);
await shot('d03-browser-analyze');
await panel.getByRole('tab', { name: 'Auto-fill' }).click();
await panel.getByTestId('autofill').click();
await panel.getByTestId('answer-sheet').waitFor();
assert.equal(await panel.getByTestId('answer').count(), 7);
await panel.getByTestId('answer').filter({ hasText: 'First Name' }).getByText('Divya').waitFor();
await panel.getByTestId('answer').filter({ hasText: 'Why do you want to join' }).getByText(/Capgemini/).waitFor();
await shot('d04-browser-autofill');
await panel.getByRole('tab', { name: 'Cover letter' }).click();
await panel.getByRole('button', { name: 'Write cover letter' }).click();
await panel.getByTestId('cover-letter').getByRole('button', { name: 'Plain English' }).waitFor();
await shot('d05-browser-cover');
ok('browser: reader view (no scripts), Analyze gauge, Auto-fill sheet, cover letter');

// A careers page that refuses framing: Live view explains instead of a blank box.
await page.goto(`${BASE}/browser?url=${encodeURIComponent('http://127.0.0.1:4020/careers/senior-recruiter')}`);
await page.frameLocator('[data-testid=reader-frame]').getByText('Own tech hiring').first().waitFor();
await page.getByRole('tab', { name: 'Live page' }).click();
await page.getByText('does not allow being shown inside other apps').waitFor();
ok('browser: pasted link opens through the proxy; framing refusal is explained');

// Job page: GrillCard with radial gauge, red missing keywords, Generate resume.
await page.goto(`${BASE}/jobs?view=all`);
const cards = page.getByTestId('job-card');
assert.ok((await cards.count()) >= 4);
const bands = await page.locator('[data-band]').evaluateAll((els) => els.map((e) => [e.getAttribute('data-band'), getComputedStyle(e).backgroundColor]));
assert.ok(bands.some(([b, c]) => b === 'green' && c === 'rgb(22, 163, 74)'), JSON.stringify(bands));
assert.ok(bands.some(([b, c]) => b === 'red' && c === 'rgb(220, 38, 38)'), JSON.stringify(bands));
await shot('d06-jobs');
await cards.filter({ hasText: 'Technical Recruiter' }).first().getByRole('link').first().click();
await page.waitForURL(/\/jobs\//);
const gcard = page.getByTestId('grill-card');
await gcard.getByTestId('score-gauge').waitFor();
await gcard.getByTestId('grill-breakdown').waitFor();
await gcard.getByTestId('missing-keywords').waitFor();
await gcard.getByTestId('generate-resume').waitFor();
await shot('d07-job');
ok('job page: Grill card with gauge, four dimensions, missing keywords, Generate resume');
const jobUrl = page.url();
await page.getByRole('tab', { name: 'Evaluate' }).click();
await page.getByRole('button', { name: 'Run full evaluation' }).click();
await page.getByTestId('eval-score').waitFor({ timeout: 60_000 });
assert.equal(await page.getByTestId('eval-score').innerText(), '4.2');
await page.getByText('Draft answers for the application form').waitFor();
await shot('d07b-evaluation');
await page.reload();
await page.getByTestId('eval-score').waitFor();
ok('job page: Career-Ops A-H evaluation runs and opens by default afterwards');
await page.getByRole('tab', { name: 'Prep' }).click();
await page.getByRole('radio', { name: /Who to contact/ }).click();
await page.getByRole('button', { name: 'Run who to contact' }).click();
await page.getByTestId('mode-report').waitFor({ timeout: 60_000 });
await page.getByRole('radio', { name: /Read an offer letter/ }).click();
assert.equal(await page.getByRole('button', { name: 'Run read an offer letter' }).isDisabled(), true);
await shot('d07c-prep');
await page.goto(`${BASE}/insights`);
await page.getByRole('radio', { name: /Adjacent job titles/ }).click();
await page.getByRole('button', { name: 'Run adjacent job titles' }).click();
await page.getByRole('button', { name: 'Talent Partner' }).click();
await page.getByRole('button', { name: 'Add 1 to job feed' }).click();
await page.getByText('Added 1 titles to your job feed').waitFor();
await page.getByRole('tab', { name: /Story bank/ }).click();
await page.getByTestId('story-bank').waitFor();
await shot('d07d-insights');
ok('Prep tab runs a tool; Insights adds a suggested title to the feed; story bank opens');
await page.goto(jobUrl);

await page.getByRole('tab', { name: 'Email' }).click();
await page.fill('#to', 'lead@beta.example');
await page.fill('#rname', 'Ravi Kumar');
await page.selectOption('#fw', 'pas');
const drafts = await page.getByTestId('email-draft').count();
await page.getByRole('button', { name: 'Write draft' }).click();
await page.getByTestId('email-draft').nth(drafts).waitFor();
const draft = page.getByTestId('email-draft').first();
await draft.getByTestId('slop-clean').waitFor();
await draft.getByRole('button', { name: 'Review and send' }).click();
await page.getByRole('dialog').getByText('Nothing is sent until you press Approve and send').waitFor();
await shot('d08-email-approve');
await page.getByTestId('approve-send').click();
await draft.getByText('sent', { exact: true }).waitFor();
ok('email: draft → review → approve and send from the UI');

await page.getByRole('tab', { name: 'Slop check' }).click();
await page.getByLabel('Text to check').fill('I spearheaded a game-changer in the hiring landscape.');
await page.getByTestId('slop-report').waitFor();
assert.match(await page.getByTestId('slop-report').innerText(), /3 flagged/);
ok('slop checker flags phrases live');

// Mailroom: LinkedIn scripts, follow-ups, plain English.
await sidebar.getByRole('link', { name: 'Mailroom' }).click();
await page.waitForURL(/\/mailroom/);
await page.getByTestId('email-compose').waitFor();
await page.getByRole('tab', { name: /LinkedIn/ }).click();
await page.fill('#o-company', 'Acme');
await page.fill('#o-name', 'Asha Rao');
await page.getByRole('button', { name: 'Write messages' }).click();
await page.getByTestId('script-card').nth(2).waitFor();
await page.getByTestId('script-card').first().getByRole('button', { name: 'Mark sent' }).click();
await page.getByText("You'll get a follow-up reminder in 5 days.").waitFor();
await shot('d09-mailroom-linkedin');
await page.getByRole('tab', { name: /Follow-ups/ }).click();
assert.ok((await page.getByTestId('log-item').count()) >= 2);
await page.getByRole('tab', { name: 'Plain English' }).click();
await page.getByLabel('Text to simplify').fill('We leveraged synergies to spearhead a paradigm shift.');
await page.getByRole('button', { name: 'Rewrite in plain English' }).click();
await page.getByTestId('plain-output').getByText('We hired 120 engineers').waitFor();
await shot('d10-mailroom-plain');
ok('mailroom: LinkedIn scripts, follow-up log, plain English rewrite');

await page.goto(`${BASE}/profile?tab=roast`);
await page.getByRole('button', { name: 'Roast my bullets' }).click();
await page.getByTestId('roast-row').nth(1).waitFor();
ok('CV roaster: before/after rows');

await page.goto(`${BASE}/profile`);
assert.equal(await page.inputValue('#name'), 'Divya Sharma');
await page.fill('#years', '');
await page.locator('#years').pressSequentially('6.5');
assert.equal(await page.inputValue('#years'), '6.5');
await page.getByRole('button', { name: 'Save profile' }).click();
await page.getByText(/jobs? re-scored|Saved/).first().waitFor();
await page.getByRole('link', { name: 'Home' }).first().click();
await page.waitForURL(`${BASE}/`);
await page.getByRole('link', { name: 'Profile' }).first().click();
await page.waitForURL(`${BASE}/profile`);
assert.equal(await page.inputValue('#years'), '6.5');
await shot('d11-profile');
await page.goto(`${BASE}/settings`);
assert.equal(await page.inputValue('#provider'), 'custom');
await page.locator('#search').waitFor();
await shot('d12-settings');
await page.getByRole('button', { name: 'Run self-test' }).click();
await page.getByTestId('selftest-results').waitFor({ timeout: 60_000 });
assert.equal(await page.locator('[data-check="db"]').getAttribute('data-ok'), 'true');
await shot('d13-selftest');
ok('profile: 6.5 years saves and shows after leaving the page; settings self-test runs');

await page.getByRole('radio', { name: 'Dark' }).click();
assert.equal(await page.evaluate(() => document.documentElement.classList.contains('dark')), true);
for (const [path, name] of [['/', 'd20-home-dark'], ['/pipeline', 'd21-pipeline-dark'], [`/browser/${jobId}`, 'd22-browser-dark'], ['/discover', 'd23-discover-dark'], ['/mailroom', 'd24-mailroom-dark']]) {
  await page.goto(BASE + path);
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains('dark')), true);
  await noSideScroll(page, path);
  await shot(name);
}
const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
assert.notEqual(bg, 'rgb(255, 255, 255)');
ok('desktop dark theme: persists across pages, no sideways scroll');
await page.context().close();

// ---------------- iPhone ----------------
const phone = await open({ ...devices['iPhone 14'] });
const pshot = (name) => phone.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
for (const [path, name] of [['/', 'p00-home'], ['/discover', 'p01-discover'], ['/pipeline', 'p02-pipeline'], ['/browser', 'p03-browser'], [`/browser/${jobId}`, 'p04-browser-job'], ['/mailroom', 'p05-mailroom'], ['/jobs?view=all', 'p06-jobs'], ['/profile', 'p07-profile'], ['/settings', 'p08-settings'], ['__job__', 'p09-evaluation'], ['/insights', 'p10-insights']]) {
  await phone.goto(path === '__job__' ? jobUrl : BASE + path);
  await phone.waitForLoadState('networkidle');
  await noSideScroll(phone, `phone ${path}`);
  await pshot(name);
}
const tabs = phone.getByRole('navigation', { name: 'Tabs' });
for (const label of ['Home', 'Discover', 'Pipeline', 'Browser', 'Mailroom']) await tabs.getByRole('link', { name: label }).waitFor();
ok('iPhone: bottom tabs, every screen fits without sideways scroll');

assert.deepEqual(errors.filter((e) => !/favicon|Failed to load resource|greenhouse\.io/.test(e)), [], 'browser errors');
await browser.close();
console.log(`\nUI checks passed. Screenshots in ${SHOTS}`);
