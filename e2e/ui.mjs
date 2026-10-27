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

await page.goto(`${BASE}/?view=all`);
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

await page.goto(`${BASE}/profile`);
assert.equal(await page.inputValue('#name'), 'Divya Sharma');
await shot('05-profile');
await page.goto(`${BASE}/settings`);
assert.equal(await page.inputValue('#provider'), 'custom');
await shot('06-settings');
console.log('  ✓ profile and settings load with saved values');

assert.deepEqual(errors.filter((e) => !/favicon/.test(e)), [], 'browser errors');
await browser.close();
console.log(`\nUI checks passed. Screenshots in ${SHOTS}`);
