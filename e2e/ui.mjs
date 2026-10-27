// Browser pass on an iPhone-sized viewport: sign in, board, job page,
// approve-and-send an email from the UI, profile and settings. Run after run.mjs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

// Playwright is not an app dependency; install it (npm i -D playwright) to run this file.
const { chromium, devices } = createRequire(import.meta.url)('playwright');

const BASE = process.env.BASE || 'http://localhost:3100';
const SHOTS = process.env.SHOTS || '/tmp/hunterops-shots';
fs.mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 14'] });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

const shot = (name) => page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });

await page.goto(`${BASE}/`);
await page.waitForURL(/\/login/);
await page.fill('#pw', 'letmein');
await page.click('button[type=submit]');
await page.waitForURL(`${BASE}/`);

// run.mjs leaves the daily cap at 2 (and used it up); lift it for this pass.
await page.request.put(`${BASE}/api/settings`, { data: { values: { daily_email_cap: '20' } } });

await page.goto(`${BASE}/`);
await page.getByText('to your 31 December offer goal').waitFor();
await page.getByText('Follow up with Practice Head').waitFor();
await shot('00-home-light');
console.log('  ✓ home dashboard: goal, stats, follow-ups');

await page.goto(`${BASE}/jobs?view=all`);
const cards = page.getByTestId('job-card');
assert.ok((await cards.count()) >= 3);
// No horizontal page scroll at phone width.
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
assert.ok(overflow <= 0, `page scrolls sideways by ${overflow}px`);
const bands = await page.locator('[data-band]').evaluateAll((els) => els.map((e) => [e.getAttribute('data-band'), getComputedStyle(e).backgroundColor]));
assert.ok(bands.some(([b, c]) => b === 'green' && c === 'rgb(22, 163, 74)'), JSON.stringify(bands));
assert.ok(bands.some(([b, c]) => b === 'red' && c === 'rgb(220, 38, 38)'), JSON.stringify(bands));
await shot('01-board');
console.log('  ✓ board: cards, colour-coded badges, no sideways scroll');

await cards.first().getByRole('link').first().click();
await page.waitForURL(/\/jobs\//);
await page.getByTestId('grill-breakdown').waitFor();
await shot('02-job-grill');
console.log('  ✓ job page: Grill breakdown');

await page.getByRole('tab', { name: 'Email' }).click();
await page.fill('#to', 'lead@acme.example');
await page.fill('#rname', 'Ravi Kumar');
await page.selectOption('#fw', 'pas');
await page.getByRole('button', { name: 'Write draft' }).click();
const draft = page.getByTestId('email-draft').first();
await draft.getByText('draft', { exact: true }).waitFor();
await draft.getByTestId('slop-clean').waitFor();
await shot('03-email-draft');
await draft.getByRole('button', { name: 'Review and send' }).click();
await page.getByRole('dialog').getByText('Nothing is sent until you press Approve and send').waitFor();
await shot('04-email-approve');
await page.getByTestId('approve-send').click();
await draft.getByText('sent', { exact: true }).waitFor();
console.log('  ✓ email: draft → review → approve and send from the UI');

await page.getByRole('tab', { name: 'Slop check' }).click();
await page.getByLabel('Text to check').fill('I spearheaded a game-changer in the hiring landscape.');
await page.getByTestId('slop-report').waitFor();
assert.match(await page.getByTestId('slop-report').innerText(), /3 flagged/);
console.log('  ✓ slop checker flags phrases live');

await page.goto(`${BASE}/discover`);
const gh = page.getByRole('link', { name: /Search 24 hours/ }).first();
assert.match(decodeURIComponent(await gh.getAttribute('href')), /tbs=qdr:d/);
assert.equal(await page.getByRole('link', { name: /Search 24 hours/ }).count(), 5);
await shot('07-discover');
console.log('  ✓ discover: 5 ATS X-Ray links with the 24h filter');

await page.goto(`${BASE}/pipeline`);
const kcard = page.getByTestId('kanban-card').first();
await kcard.waitFor();
const moved = await kcard.locator('a').first().innerText();
await kcard.locator('select').selectOption('INTERVIEW');
await page.getByRole('region', { name: 'Interview' }).getByRole('link', { name: moved, exact: true }).waitFor();
await page.reload();
await page.getByRole('region', { name: 'Interview' }).getByRole('link', { name: moved, exact: true }).waitFor();
await shot('08-pipeline');
console.log('  ✓ pipeline: move a card to Interview and it sticks');

await page.goto(`${BASE}/outreach`);
await page.fill('#o-company', 'Acme');
await page.fill('#o-name', 'Asha Rao');
await page.getByRole('button', { name: 'Write messages' }).click();
await page.getByTestId('script-card').nth(2).waitFor();
await shot('09-outreach');
await page.getByTestId('script-card').first().getByRole('button', { name: 'Mark sent' }).click();
await page.getByText("You'll get a follow-up reminder in 5 days.").waitFor();
await page.getByRole('tab', { name: /Log/ }).click();
assert.ok((await page.getByTestId('log-item').count()) >= 2);
await shot('10-outreach-log');
console.log('  ✓ outreach: write 3 scripts, mark sent, see it in the log');

await page.goto(`${BASE}/profile?tab=roast`);
await page.getByRole('button', { name: 'Roast my bullets' }).click();
await page.getByTestId('roast-row').nth(1).waitFor();
await shot('11-roaster');
console.log('  ✓ CV roaster: before/after rows');

await page.goto(`${BASE}/profile`);
assert.equal(await page.inputValue('#name'), 'Divya Sharma');
await shot('05-profile');
await page.goto(`${BASE}/settings`);
assert.equal(await page.inputValue('#provider'), 'custom');
await shot('06-settings');
console.log('  ✓ profile and settings load with saved values');

// Dark theme: the toggle persists and recolours the page.
await page.getByRole('radio', { name: 'Dark' }).click();
assert.equal(await page.evaluate(() => document.documentElement.classList.contains('dark')), true);
await page.goto(`${BASE}/`);
assert.equal(await page.evaluate(() => document.documentElement.classList.contains('dark')), true);
const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
assert.notEqual(bg, 'rgb(255, 255, 255)');
await shot('20-home-dark');
for (const [path, name] of [['/jobs?view=all', '21-jobs-dark'], ['/pipeline', '22-pipeline-dark'], ['/outreach?tab=log', '23-outreach-dark'], ['/discover', '24-discover-dark']]) {
  await page.goto(BASE + path);
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(over <= 0, `${path} scrolls sideways by ${over}px`);
  await shot(name);
}
const jl = page.getByTestId('job-card').first();
await page.goto(`${BASE}/jobs?view=all`);
await jl.getByRole('link').first().click();
await page.getByTestId('grill-breakdown').waitFor();
await shot('25-job-dark');
console.log('  ✓ dark theme: persists across pages, no sideways scroll');

assert.deepEqual(errors.filter((e) => !/favicon/.test(e)), [], 'browser errors');
await browser.close();
console.log(`\nUI checks passed. Screenshots in ${SHOTS}`);
