// End-to-end API test. Needs the app running at BASE with .env.e2e, plus
// mock-llm.mjs and smtp-sink.mjs. Run all of it with: npm run e2e
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const BASE = process.env.BASE || 'http://localhost:3100';
const MAIL = process.env.SMTP_OUT || '/tmp/hunterops-mail.jsonl';
let cookie = '';
let passed = 0;

async function call(method, path, body, { raw = false, headers = {} } = {}) {
  const init = { method, headers: { cookie, ...headers }, redirect: 'manual' };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers['content-type'] = 'application/json';
  }
  const res = await fetch(BASE + path, init);
  if (raw) return res;
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function step(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}\n`, err);
    process.exit(1);
  }
}

const JD_STRONG = `About the role
We are building our Bengaluru GCC and need a Senior Talent Acquisition Partner.
Requirements
- 5+ years of experience in tech hiring
- Strong boolean search and LinkedIn Recruiter skills
- Stakeholder management with engineering leaders
- Experience with Greenhouse
Nice to have
- Experience setting up a GCC
- Power BI dashboards
This is a hybrid role, 3 days in our Bengaluru office.`;

console.log(`E2E against ${BASE}`);

await step('health is public and reports a working database', async () => {
  const r = await call('GET', '/api/health');
  assert.equal(r.status, 200);
  assert.equal(r.data.ok, true);
  assert.equal(r.data.app_secret, true);
});

await step('pages and APIs are locked without a session', async () => {
  const page = await call('GET', '/', undefined, { raw: true });
  assert.equal(page.status, 307);
  assert.match(page.headers.get('location'), /\/login/);
  assert.equal((await call('GET', '/api/settings')).status, 401);
});

await step('wrong password is refused, right password signs in', async () => {
  assert.equal((await call('POST', '/api/auth/login', { password: 'nope' })).status, 401);
  const res = await call('POST', '/api/auth/login', { password: 'letmein' }, { raw: true });
  assert.equal(res.status, 200);
  cookie = res.headers.get('set-cookie').split(';')[0];
  assert.match(cookie, /^ho_session=/);
});

await step('settings: OpenCode Go + DeepSeek is the default provider', async () => {
  const r = await call('GET', '/api/settings');
  assert.equal(r.status, 200);
  assert.equal(r.data.settings.llm_provider.value, 'opencode');
  assert.equal(r.data.providers.opencode.defaultModel, 'deepseek-v4.1-flash');
  assert.deepEqual(Object.keys(r.data.providers), ['opencode', 'openai', 'anthropic', 'gemini', 'openrouter', 'groq', 'custom']);
});

await step('test connection fails cleanly with a bad key', async () => {
  const r = await call('POST', '/api/settings/test', { provider: 'custom', baseUrl: 'http://127.0.0.1:4010/v1', model: 'deepseek-v4.1-flash', key: 'wrong' });
  assert.equal(r.status, 502);
  assert.match(r.data.error, /Check the API key/);
});

await step('switch to a custom OpenAI-compatible provider (the mock) and test it', async () => {
  const t = await call('POST', '/api/settings/test', { provider: 'custom', baseUrl: 'http://127.0.0.1:4010/v1', model: 'deepseek-v4.1-flash', key: 'e2e-key' });
  assert.equal(t.status, 200, JSON.stringify(t.data));
  assert.equal(t.data.reply, 'ready');
  const s = await call('PUT', '/api/settings', { values: {
    llm_provider: 'custom', llm_base_url: 'http://127.0.0.1:4010/v1', llm_model: 'deepseek-v4.1-flash', llm_key_custom: 'e2e-key',
    smtp_user: 'divya@example.com', smtp_app_password: 'abcd efgh ijkl mnop', sender_name: 'Divya Sharma', daily_email_cap: '2',
  } });
  assert.equal(s.status, 200);
  assert.equal(s.data.settings.llm_key_custom.value, null);
  assert.match(s.data.settings.llm_key_custom.hint, /••••/);
  assert.ok(!JSON.stringify(s.data).includes('e2e-key'), 'key leaked in settings response');
});

await step('API keys are encrypted at rest', async () => {
  const out = execFileSync('psql', [process.env.DATABASE_URL, '-tAc', "SELECT value, is_secret FROM app_settings WHERE key = 'llm_key_custom'"]).toString();
  assert.match(out, /^v1\./);
  assert.ok(!out.includes('e2e-key'));
  assert.match(out, /\|t/);
});

let draft;
await step('import a PDF resume into a profile draft', async () => {
  const form = new FormData();
  form.append('file', new Blob([fs.readFileSync(new URL('./fixtures/resume.pdf', import.meta.url))], { type: 'application/pdf' }), 'resume.pdf');
  const r = await call('POST', '/api/profile/import', form);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.draft.name, 'Divya Sharma');
  assert.ok(r.data.chars > 300);
  assert.equal(r.data.draft.experience.length, 2);
  draft = r.data.draft;
});

await step('save the profile (Bengaluru on-site/hybrid + remote)', async () => {
  assert.equal((await call('GET', '/api/profile')).data.profile, null);
  const r = await call('PUT', '/api/profile', { profile: { ...draft, acceptRemote: true, acceptHybrid: true, onsiteCities: ['Bengaluru'] } });
  assert.equal(r.status, 200);
  assert.equal(r.data.profile.yearsExperience, 7);
  assert.deepEqual(r.data.profile.onsiteCities, ['Bengaluru']);
});

const ids = {};
await step('add jobs by hand; each is grilled on arrival', async () => {
  const strong = await call('POST', '/api/jobs', { url: 'https://boards.greenhouse.io/acme/jobs/1', title: 'Senior Talent Acquisition Partner', company: 'Acme', location: 'Bengaluru, India (Hybrid)', description: JD_STRONG });
  assert.equal(strong.status, 201, JSON.stringify(strong.data));
  ids.strong = strong.data.job.id;
  assert.ok(strong.data.job.grillScore >= 75, `strong match scored ${strong.data.job.grillScore}`);
  assert.equal(strong.data.job.workMode, 'HYBRID');

  const us = await call('POST', '/api/jobs', { url: 'https://jobs.lever.co/beta/2', title: 'Technical Recruiter', company: 'Beta', location: 'Remote - US', description: JD_STRONG.replace(/This is a hybrid.*$/m, '') });
  ids.us = us.data.job.id;
  assert.equal(us.data.job.grillBreakdown.location.score, 0);

  const mumbai = await call('POST', '/api/jobs', { url: 'https://jobs.ashbyhq.com/gamma/3', title: 'Recruiter', company: 'Gamma', location: 'Mumbai', description: 'Requirements\n- 10+ years of sales hiring\n- Excel' });
  ids.mumbai = mumbai.data.job.id;
  assert.ok(mumbai.data.job.grillScore < 50, `weak match scored ${mumbai.data.job.grillScore}`);

  const dup = await call('POST', '/api/jobs', { url: 'https://boards.greenhouse.io/acme/jobs/1', title: 'x', company: 'y' });
  assert.equal(dup.status, 409);
});

await step('scan runs, seeds company boards and reports blocked sources without failing', async () => {
  const r = await call('POST', '/api/scan', { force: true });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.ok(r.data.sources >= 31, `sources ${r.data.sources}`);
  assert.ok(Array.isArray(r.data.errors));
});

await step('job board renders cards with colour-coded Grill badges, best fit first', async () => {
  const res = await call('GET', '/jobs?view=all', undefined, { raw: true });
  assert.equal(res.status, 200);
  const html = await res.text();
  const order = ['Senior Talent Acquisition Partner', 'Technical Recruiter', 'Recruiter</a>'].map((t) => html.indexOf(t));
  assert.ok(order.every((i) => i > 0), 'job titles missing');
  assert.ok(order[0] < order[1] && order[1] < order[2], 'not sorted by Grill Score');
  assert.match(html, /data-band="green"/);
  assert.match(html, /data-band="red"/);
});

await step('filters: Bengaluru and Remote views', async () => {
  const blr = await (await call('GET', '/jobs?view=all&loc=bengaluru', undefined, { raw: true })).text();
  assert.ok(blr.includes('Senior Talent Acquisition Partner') && !blr.includes('Technical Recruiter'));
  const remote = await (await call('GET', '/jobs?view=all&loc=remote', undefined, { raw: true })).text();
  assert.ok(remote.includes('Technical Recruiter') && !remote.includes('Senior Talent Acquisition Partner'));
});

await step('track status: save, then mark applied (sets applied date)', async () => {
  assert.equal((await call('PATCH', `/api/jobs/${ids.strong}`, { status: 'SAVED' })).status, 200);
  const r = await call('PATCH', `/api/jobs/${ids.strong}`, { status: 'APPLIED', notes: 'Applied on Greenhouse' });
  assert.ok(r.data.job.appliedAt);
  assert.equal((await call('PATCH', `/api/jobs/${ids.strong}`, { status: 'BOGUS' })).status, 400);
});

let resumeId;
await step('tailor a resume: Anti-Slop forces a rewrite, Designer audit passes', async () => {
  const r = await call('POST', '/api/resume/tailor', { jobId: ids.strong });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.slop.clean, true, JSON.stringify(r.data.slop));
  assert.match(r.data.data.summary, /led 120 tech hires/);
  assert.deepEqual(r.data.issues, []);
  assert.equal(r.data.pages, 1);
  assert.equal(r.data.data.email, 'divya@example.com');
  resumeId = r.data.resume.id;
});

await step('download tailored PDF and master DOCX', async () => {
  const pdf = await call('POST', '/api/resume/render', { resumeId, format: 'pdf' }, { raw: true });
  assert.equal(pdf.status, 200);
  assert.equal(pdf.headers.get('content-type'), 'application/pdf');
  assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0, 4).toString(), '%PDF');
  const docx = await call('POST', '/api/resume/render', { format: 'docx', density: 'compact' }, { raw: true });
  assert.equal(docx.status, 200);
  assert.match(docx.headers.get('content-disposition'), /Divya_Sharma\.docx/);
});

let email;
await step('draft a recruiter email (AIDA); Anti-Slop removes "delve"', async () => {
  const r = await call('POST', '/api/emails', { jobId: ids.strong, toEmail: 'asha@acme.example', recipientName: 'Asha Rao', recipientTitle: 'Head of TA', kind: 'cold', framework: 'aida' });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(r.data.email.status, 'DRAFT');
  assert.equal(r.data.slop.clean, true);
  assert.ok(!/delve/i.test(r.data.email.body));
  email = r.data.email;
  assert.equal((await call('POST', '/api/emails', { jobId: ids.strong, toEmail: 'not-an-email' })).status, 400);
});

await step('nothing is sent without approval or with a stale draft', async () => {
  assert.equal((await call('POST', `/api/emails/${email.id}/send`, {})).status, 400);
  assert.equal((await call('POST', `/api/emails/${email.id}/send`, { approve: true, subject: email.subject, body: 'old text' })).status, 409);
  assert.equal(fs.readFileSync(MAIL, 'utf8').trim(), '');
});

await step('edit the draft, then approve and send it', async () => {
  const edited = await call('PATCH', `/api/emails/${email.id}`, { body: `${email.body}\n\nP.S. Happy to share references.` });
  assert.equal(edited.status, 200);
  email = edited.data.email;
  const sent = await call('POST', `/api/emails/${email.id}/send`, { approve: true, subject: email.subject, body: email.body });
  assert.equal(sent.status, 200, JSON.stringify(sent.data));
  assert.equal(sent.data.email.status, 'SENT');
  const mails = fs.readFileSync(MAIL, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(mails.length, 1);
  assert.deepEqual(mails[0].to, ['asha@acme.example']);
  assert.match(mails[0].data, /Happy to share references/);
  assert.match(mails[0].data, /From: "?Divya Sharma"? <divya@example.com>/);
});

await step('a sent email cannot be sent twice, edited or deleted', async () => {
  assert.equal((await call('POST', `/api/emails/${email.id}/send`, { approve: true, subject: email.subject, body: email.body })).status, 409);
  assert.equal((await call('PATCH', `/api/emails/${email.id}`, { body: 'x' })).status, 409);
  assert.equal((await call('DELETE', `/api/emails/${email.id}`)).status, 409);
});

await step('daily cap is enforced', async () => {
  for (let i = 0; i < 2; i++) {
    const d = (await call('POST', '/api/emails', { jobId: ids.us, toEmail: `r${i}@beta.example`, kind: 'follow_up' })).data.email;
    const s = await call('POST', `/api/emails/${d.id}/send`, { approve: true, subject: d.subject, body: d.body });
    if (i === 0) assert.equal(s.status, 200);
    else {
      assert.equal(s.status, 429);
      assert.match(s.data.error, /Daily cap/);
    }
  }
});

await step('slop checker endpoint', async () => {
  const r = await call('POST', '/api/slop', { text: 'Spearheaded a game-changer.', fix: true });
  assert.equal(r.data.text, 'Led a game-changer.');
  assert.equal(r.data.report.hits.length, 1);
});

await step('re-grill all jobs after a profile change', async () => {
  const before = (await call('GET', `/api/jobs/${ids.us}`)).data.job.grillScore;
  const p = (await call('GET', '/api/profile')).data.profile;
  await call('PUT', '/api/profile', { profile: { ...p, acceptRemote: false } });
  const after = (await call('GET', `/api/jobs/${ids.us}`)).data.job;
  assert.equal(after.grillBreakdown.location.score, 0);
  const r = await call('POST', '/api/grill');
  assert.equal(r.status, 200);
  assert.ok(r.data.grilled >= 3);
  assert.ok(typeof before === 'number');
});

await step('cron needs CRON_SECRET', async () => {
  assert.equal((await call('GET', '/api/cron/scan')).status, 401);
  const r = await call('GET', '/api/cron/scan', undefined, { headers: { authorization: 'Bearer cronsecret' } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
});

await step('company boards: add from a careers URL and pause', async () => {
  const r = await call('POST', '/api/companies', { url: 'https://jobs.lever.co/newco' });
  assert.equal(r.status, 201);
  assert.equal(r.data.company.atsType, 'lever');
  const p = await call('PATCH', `/api/companies/${r.data.company.id}`, { active: false });
  assert.equal(p.data.company.active, false);
  assert.equal((await call('POST', '/api/companies', { url: 'https://example.com/careers' })).status, 400);
});

await step('CV roaster: before/after audit, 5 metric bullets, summary', async () => {
  assert.equal((await call('POST', '/api/roast', { bullets: '' })).status, 400);
  const r = await call('POST', '/api/roast', { bullets: 'Responsible for end-to-end recruitment for IT roles.\nHandled stakeholder meetings and candidate screening.', domain: 'Cloud' });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.critique.length, 2);
  assert.equal(r.data.rewrites.length, 5);
  assert.match(r.data.summary, /0-day notice/);
  assert.deepEqual(r.data.weakPhrases, ['Responsible for', 'Handled']);
});

let outreachId = '';
await step('outreach: three scripts under 60 words, nothing sent', async () => {
  const r = await call('POST', '/api/outreach', { company: 'Acme', role: 'Senior TA Partner', recipientName: 'Asha Rao', jobId: ids.strong });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.deepEqual(r.data.scripts.map((s) => s.kind), ['head_of_ta', 'peer_referral', 'practice_head']);
  for (const s of r.data.scripts) assert.ok(s.words <= 60, `${s.kind} has ${s.words} words`);
  const log = await call('POST', '/api/outreach/log', { company: 'Acme', recipientRole: 'Head of TA', recipientName: 'Asha Rao', kind: 'head_of_ta', message: r.data.scripts[0].message, status: 'sent', jobId: ids.strong });
  assert.equal(log.status, 201);
  assert.ok(log.data.item.sentAt);
  const days = (new Date(log.data.item.followUpAt) - new Date(log.data.item.sentAt)) / 86_400_000;
  assert.ok(days > 4.9 && days < 5.1, `follow-up in ${days} days`);
  outreachId = log.data.item.id;
});

await step('outreach log: due follow-up, reply, delete', async () => {
  const d = await call('POST', '/api/outreach/log', { company: 'Beta', recipientRole: 'Peer recruiter', kind: 'peer_referral', channel: 'referral', message: 'Hi Ravi, could you refer me?' });
  assert.equal(d.data.item.status, 'drafted');
  assert.equal(d.data.item.followUpAt, null);
  const past = new Date(Date.now() - 86_400_000).toISOString();
  assert.equal((await call('PATCH', `/api/outreach/${outreachId}`, { followUpAt: past })).status, 200);
  const due = await call('GET', '/api/outreach?status=sent');
  assert.equal(due.data.items.length, 1);
  const rep = await call('PATCH', `/api/outreach/${outreachId}`, { status: 'replied' });
  assert.equal(rep.data.item.followUpAt, null);
  assert.equal((await call('DELETE', `/api/outreach/${d.data.item.id}`)).status, 200);
  assert.equal((await call('DELETE', `/api/outreach/${d.data.item.id}`)).status, 404);
  // Leave one follow-up due for the dashboard.
  const again = await call('POST', '/api/outreach/log', { company: 'Gamma', recipientRole: 'Practice Head', kind: 'practice_head', message: 'Hi Meera, quick one about your cloud reqs.', status: 'sent' });
  await call('PATCH', `/api/outreach/${again.data.item.id}`, { followUpAt: past });
});

await step('gap scripts: email and phone', async () => {
  const r = await call('POST', '/api/outreach/gap', { gapSince: 'November 2025' });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.match(r.data.email, /November 2025/);
  assert.match(r.data.phone, /notice/);
});

// ---- v2: in-app Browser, Grill a URL, Auto-Fill, cover letters, Discover ----
const GH_URL = 'https://job-boards.greenhouse.io/acmecloud/jobs/555';
const LEVER_URL = 'https://jobs.lever.co/acmepay/0f2a1b3c-1111-2222-3333-444455556666';
const PAGE_URL = 'http://127.0.0.1:4020/careers/senior-recruiter';

await step('upload a CV with save=1 (Home setup): profile saved, pay and location prefs kept', async () => {
  const p = (await call('GET', '/api/profile')).data.profile;
  await call('PUT', '/api/profile', { profile: { ...p, acceptRemote: true, expectedSalaryLpa: 25, currentCtcLpa: 18, noticePeriod: 'Immediate' } });
  const form = new FormData();
  form.append('file', new Blob([fs.readFileSync(new URL('./fixtures/resume.pdf', import.meta.url))], { type: 'application/pdf' }), 'resume.pdf');
  form.append('save', '1');
  const r = await call('POST', '/api/profile/import', form);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.saved, true);
  assert.ok(r.data.grilled >= 3);
  const saved = (await call('GET', '/api/profile')).data.profile;
  assert.equal(saved.name, 'Divya Sharma');
  assert.equal(saved.expectedSalaryLpa, 25);
  assert.equal(saved.noticePeriod, 'Immediate');
  assert.equal(saved.acceptRemote, true);
});

await step('Grill a URL (POST /api/grill { url }) without saving it', async () => {
  const r = await call('POST', '/api/grill', { url: PAGE_URL });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.job.title, 'Senior Recruiter');
  assert.equal(r.data.job.company, 'Zeta Labs');
  assert.ok(r.data.grill.score >= 60, `scored ${r.data.grill.score}`);
  assert.equal(r.data.grill.salary.max, 20);
  assert.equal(r.data.grill.salary.offeredMin, 20);
  assert.ok(Array.isArray(r.data.grill.missingKeywords));
  assert.equal(execFileSync('psql', [process.env.DATABASE_URL, '-tAc', "SELECT count(*) FROM jobs WHERE company = 'Zeta Labs'"]).toString().trim(), '0');
  assert.equal((await call('POST', '/api/grill', { url: 'http://localhost:1/x' })).status >= 400, true);
  assert.equal((await call('POST', '/api/grill', { url: 'ftp://example.com' })).status, 400);
});

let ghJob;
await step('import a Greenhouse link: description, salary-aware Grill, company board tracked', async () => {
  const r = await call('POST', '/api/jobs/import', { url: GH_URL });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  ghJob = r.data.job;
  assert.equal(ghJob.title, 'Senior Talent Acquisition Partner');
  assert.equal(ghJob.company, 'Acme Cloud');
  assert.equal(ghJob.status, 'SAVED');
  assert.match(ghJob.description, /Bengaluru GCC/);
  assert.equal(r.data.grill.salary.score, 20, JSON.stringify(r.data.grill.salary));
  assert.ok(r.data.grill.score >= 75, `scored ${r.data.grill.score}`);
  const companies = (await call('GET', '/api/companies')).data.companies;
  assert.ok(companies.some((c) => c.atsType === 'greenhouse' && c.atsSlug === 'acmecloud'));
  const again = await call('POST', '/api/jobs/import', { url: GH_URL });
  assert.equal(again.status, 200);
  assert.equal(again.data.job.id, ghJob.id);
});

await step('in-app Browser: Greenhouse job opens with a clean reader, official apply form and Grill', async () => {
  const r = await call('POST', '/api/browser/open', { jobId: ghJob.id });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.job.id, ghJob.id);
  assert.match(r.data.page.html, /Bengaluru GCC/);
  assert.ok(!/<script/i.test(r.data.page.html), 'script tag in reader html');
  assert.match(r.data.page.embedUrl, /boards\.greenhouse\.io\/embed\/job_app\?for=acmecloud&token=555/);
  assert.equal(r.data.page.frameable, true);
  assert.ok(r.data.grill.score >= 75);
  assert.equal(r.data.page.fields.length, 7);
});

await step('in-app Browser: plain careers page via the proxy (JSON-LD, sanitized, refuses framing)', async () => {
  const r = await call('POST', '/api/browser/open', { url: PAGE_URL });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.page.title, 'Senior Recruiter');
  assert.equal(r.data.page.frameable, false);
  assert.equal(r.data.job, null);
  assert.ok(!/<script|onclick/i.test(r.data.page.html));
  assert.ok(r.data.page.fields.some((f) => f.key === 'first_name'));
  assert.equal((await call('POST', '/api/browser/open', {})).status, 400);
  assert.equal((await call('POST', '/api/browser/open', { url: 'http://127.0.0.1:4020/nope' })).status >= 400, true);
});

await step('Auto-Fill: Greenhouse questions answered from the profile and AI, saved to the job', async () => {
  const r = await call('POST', '/api/autofill', { jobId: ghJob.id });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const by = Object.fromEntries(r.data.answers.map((a) => [a.key, a]));
  assert.equal(by.first_name.value, 'Divya');
  assert.equal(by.last_name.value, 'Sharma');
  assert.equal(by.email.value, 'divya@example.com');
  assert.equal(by.resume.type, 'file');
  assert.equal(by.question_1.value, '25 LPA');
  assert.equal(by.question_2.value, 'Immediate');
  assert.equal(by.question_3.source, 'ai');
  assert.match(by.question_3.value, /Capgemini/);
  assert.equal(r.data.generic, false);
  const reopened = await call('POST', '/api/browser/open', { jobId: ghJob.id });
  assert.equal(reopened.data.autofill.answers.length, 7);
});

await step('Auto-Fill: Lever apply form fields read from the page; profile-only mode works', async () => {
  const r = await call('POST', '/api/autofill', { url: LEVER_URL, ai: false });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const keys = r.data.answers.map((a) => a.key);
  assert.ok(!keys.includes('token'), 'hidden token field leaked');
  const by = Object.fromEntries(r.data.answers.map((a) => [a.key, a]));
  assert.equal(by.name.value, 'Divya Sharma');
  assert.equal(by.phone.value, '+91 90000 00000');
  assert.equal(by.org.value, 'Capgemini');
  assert.equal(by['cards[abc][field0]'].value, '');
});

await step('Module B: AIDA cover letter (POST /api/draft-email), Anti-Slop strips "delve", saved as an artifact', async () => {
  const r = await call('POST', '/api/draft-email', { jobId: ghJob.id, framework: 'AIDA' });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.ok(r.data.coverLetter.body.length > 40);
  assert.ok(!/delve/i.test(r.data.coverLetter.body));
  assert.equal(r.data.slop.clean, true);
  assert.equal(r.data.email, null);
  const pas = await call('POST', '/api/draft-email', { jobId: ghJob.id, framework: 'PAS', toEmail: 'meera@acmecloud.example' });
  assert.equal(pas.status, 201);
  assert.equal(pas.data.email.status, 'DRAFT');
  assert.equal(pas.data.email.kind, 'cover_letter');
  assert.equal(pas.data.email.framework, 'pas');
  const out = execFileSync('psql', [process.env.DATABASE_URL, '-tAc', `SELECT length(cover_letter_text) > 0, jsonb_array_length(email_drafts) FROM artifacts WHERE job_id = '${ghJob.id}'`]).toString().trim();
  assert.equal(out, 't|2');
  assert.equal((await call('POST', '/api/draft-email', { jobId: ghJob.id, toEmail: 'bad' })).status, 400);
});

await step('Module C: plain English (ASD-STE100) rewrite', async () => {
  const r = await call('POST', '/api/refine', { text: 'We leveraged synergies to spearhead a paradigm shift in talent acquisition.' });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.sentences, 2);
  assert.match(r.data.text, /We hired 120 engineers/);
});

await step('Module A: extra banned words from Settings are enforced', async () => {
  assert.equal((await call('PUT', '/api/settings', { values: { banned_words_extra: 'rockstar, ninja' } })).status, 200);
  const r = await call('POST', '/api/slop', { text: 'We need a rockstar recruiter.' });
  assert.ok(r.data.report.hits.some((h) => /rockstar/i.test(h.phrase)), JSON.stringify(r.data.report));
  await call('PUT', '/api/settings', { values: { banned_words_extra: '' } });
});

await step('Mailroom: an email draft without a job (company and role typed in)', async () => {
  const r = await call('POST', '/api/emails', { company: 'Orbit Labs', role: 'TA Lead', toEmail: 'hr@orbit.example', kind: 'cold', framework: 'pas' });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(r.data.email.jobId, null);
  assert.equal(r.data.email.status, 'DRAFT');
  assert.equal((await call('POST', '/api/emails', { toEmail: 'hr@orbit.example' })).status, 400);
});

await step('Discover in-app: free search (no key) finds ATS jobs and people; Serper still works', async () => {
  const free = await call('POST', '/api/discover/search', { roles: ['Talent Acquisition'], locations: ['bengaluru', 'remote'], window: 'd', people: true });
  assert.equal(free.status, 200, JSON.stringify(free.data));
  assert.equal(free.data.webEnabled, true);
  assert.equal(free.data.provider, 'free');
  assert.ok(free.data.board.some((j) => j.id === ghJob.id), 'fresh board job missing');
  const fgh = free.data.web.find((w) => w.ats === 'greenhouse');
  assert.ok(fgh, JSON.stringify(free.data));
  assert.equal(fgh.jobId, ghJob.id, 'saved Greenhouse job not matched');
  assert.equal(free.data.people[0].name, 'Meera Iyer - Head of Talent Acquisition - Acme Cloud');
  const st = await call('POST', '/api/selftest');
  assert.equal(st.status, 200, JSON.stringify(st.data));
  for (const id of ['db', 'signin', 'profile', 'ai', 'search-bing', 'search-ddg']) {
    const c = st.data.checks.find((x) => x.id === id);
    assert.ok(c, `self-test check ${id} missing`);
    assert.equal(c.ok, true, `${id}: ${c.detail}`);
  }
  // Career sites are the real internet, unreachable here; each still reports a result.
  assert.ok(st.data.checks.some((c) => c.id === 'ats-greenhouse') && st.data.checks.some((c) => c.id === 'browser'));
  assert.equal((await call('PUT', '/api/settings', { values: { search_provider: 'serper', search_api_key: 'serper-e2e' } })).status, 200);
  const on = await call('POST', '/api/discover/search', { roles: ['Talent Acquisition'], locations: ['bengaluru', 'remote'], window: 'd', people: true });
  assert.equal(on.status, 200, JSON.stringify(on.data));
  assert.equal(on.data.webEnabled, true);
  assert.equal(on.data.provider, 'serper');
  const gh = on.data.web.find((w) => w.ats === 'greenhouse');
  assert.ok(gh, JSON.stringify(on.data.web));
  assert.equal(gh.inApp, true);
  assert.equal(gh.jobId, ghJob.id, 'saved Greenhouse job not matched');
  const lv = on.data.web.find((w) => w.ats === 'lever');
  assert.equal(lv.jobId, null);
  assert.ok(!on.data.web.some((w) => /google\./.test(w.url)));
  assert.equal(on.data.people[0].name, 'Meera Iyer - Head of Talent Acquisition - Acme Cloud');
  const bad = await call('PUT', '/api/settings', { values: { search_api_key: 'wrong' } });
  assert.equal(bad.status, 200);
  const err = await call('POST', '/api/discover/search', { roles: ['Recruiter'] });
  assert.ok(err.data.errors.length >= 1);
  await call('PUT', '/api/settings', { values: { search_api_key: 'serper-e2e' } });
});

await step('Career-Ops evaluation: liveness, repost and pay signals, A-H report, story bank', async () => {
  const r = await call('POST', '/api/career-ops/evaluate', { jobId: ghJob.id });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const d = r.data.report.data;
  assert.equal(r.data.report.score, 4.2);
  assert.equal(d.liveness.state, 'open', d.liveness.reason);
  assert.deepEqual(d.signals.map((s) => s.id), ['live', 'age', 'repost', 'pay', 'detail']);
  const intel = d.match.rows.find((x) => x.requirement === 'Market intel');
  assert.equal(intel.importance, 'meaningful', 'inferred rows must not be critical');
  assert.equal(intel.jdSignal, '');
  assert.equal(d.match.rows[0].requirement, '6+ years of tech hiring');
  assert.equal(d.confidence, 'medium', 'confidence must follow the evidence');
  assert.equal(r.data.storiesAdded, 1);
  const again = await call('POST', '/api/career-ops/evaluate', { jobId: ghJob.id });
  assert.equal(again.data.storiesAdded, 0);
  const got = await call('GET', `/api/career-ops/evaluate?jobId=${ghJob.id}`);
  assert.equal(got.data.report.id, again.data.report.id);
  const html = await (await call('GET', `/jobs/${ghJob.id}`, undefined, { raw: true })).text();
  assert.ok(html.includes('Worth applying this week'));
});

await step('Career-Ops modes: job prep tools, offer disclaimer, 300-char notes, reply and titles actions, stats', async () => {
  const prep = await call('POST', '/api/career-ops/run', { mode: 'interview_prep', jobId: ghJob.id });
  assert.equal(prep.status, 200, JSON.stringify(prep.data));
  assert.equal(prep.data.report.data.sections[0].heading, 'Main');
  const contacts = await call('POST', '/api/career-ops/run', { mode: 'contacts', jobId: ghJob.id });
  const note = contacts.data.report.data.sections[0].items.find((i) => i.copy);
  assert.match(note.tag, /\/300 characters/);
  assert.equal((await call('POST', '/api/career-ops/run', { mode: 'offer_review', jobId: ghJob.id, input: 'short' })).status, 400);
  const offer = await call('POST', '/api/career-ops/run', { mode: 'offer_review', jobId: ghJob.id, input: 'Offer letter. Fixed CTC 24 LPA. Notice period 90 days. Variable at sole discretion.' });
  assert.equal(offer.data.report.data.sections.at(-1).heading, 'Disclaimer');
  assert.equal((await call('POST', '/api/career-ops/run', { mode: 'negotiate' })).status, 400, 'job modes need a job');
  await call('PATCH', `/api/jobs/${ghJob.id}`, { status: 'APPLIED' });
  const reply = await call('POST', '/api/career-ops/run', { mode: 'reply', input: 'Hi Divya, thanks for applying to Acme Cloud. Can we schedule a 30 minute call on Friday?' });
  assert.equal(reply.status, 200, JSON.stringify(reply.data));
  const act = reply.data.report.data.actions[0];
  assert.equal(act.kind, 'set_status');
  assert.equal(act.status, 'INTERVIEW');
  await call('PATCH', `/api/jobs/${ghJob.id}`, { status: 'SAVED' });
  const titles = await call('POST', '/api/career-ops/run', { mode: 'titles' });
  assert.deepEqual(titles.data.report.data.actions[0].titles, ['Talent Partner', 'TA Business Partner']);
  const pat = await call('POST', '/api/career-ops/run', { mode: 'patterns' });
  assert.equal(pat.data.report.data.sections[0].heading, 'Funnel');
  const up = await call('POST', '/api/career-ops/run', { mode: 'upskill' });
  assert.match(up.data.report.data.sections[0].heading, /Gap heatmap/);
  const list = await call('GET', `/api/career-ops/run?jobId=${ghJob.id}`);
  assert.ok(list.data.reports.length >= 3);
  const html = await (await call('GET', '/insights', undefined, { raw: true })).text();
  assert.ok(html.includes('Story bank'));
});

await step('Story bank: evaluation stories listed; add, check and delete by hand', async () => {
  const before = (await call('GET', '/api/stories')).data.stories;
  assert.ok(before.some((s) => s.title === 'Hiring 120 engineers in 12 months' && !s.verified));
  const add = await call('POST', '/api/stories', { title: 'Fixing offer drop-offs', action: 'Called every offered candidate weekly until joining.', result: 'Drop-offs fell [X]%.' });
  assert.equal(add.status, 201);
  assert.equal(add.data.story.verified, true);
  const ai = before.find((s) => !s.verified);
  assert.equal((await call('PATCH', `/api/stories/${ai.id}`, { verified: true })).data.story.verified, true);
  assert.equal((await call('DELETE', `/api/stories/${add.data.story.id}`)).status, 200);
  assert.equal((await call('POST', '/api/stories', { title: 'x' })).status, 400);
});

await step('Email guesses: patterns for a named recruiter, marked unverified, nothing sent', async () => {
  const r = await call('POST', '/api/email-guess', { name: 'Meera Iyer', jobId: ghJob.id, domain: 'acmecloud.example' });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.guesses[0], 'meera.iyer@acmecloud.example');
  assert.equal(r.data.mx, false);
  assert.equal((await call('POST', '/api/email-guess', { name: '' })).status, 400);
});

await step('Pipeline columns: Scouted, Grilled 75+, Applied, Rejected', async () => {
  const res = await call('GET', '/pipeline', undefined, { raw: true });
  assert.equal(res.status, 200);
  const html = await res.text();
  for (const c of ['Scouted', 'Grilled', 'Applied', 'Rejected']) assert.ok(html.includes(c), `${c} column missing`);
  assert.equal((await call('PATCH', `/api/jobs/${ghJob.id}`, { status: 'REJECTED' })).status, 200);
  assert.equal((await call('PATCH', `/api/jobs/${ghJob.id}`, { status: 'SAVED' })).status, 200);
});

await step('scan summary says how many matches are already on the board', async () => {
  const r = await call('POST', '/api/scan', { force: true });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(typeof r.data.already_on_board, 'number');
});

await step('every app page renders for a signed-in user', async () => {
  for (const path of ['/', '/discover', '/pipeline', '/browser', `/browser/${ghJob.id}`, `/browser?url=${encodeURIComponent(PAGE_URL)}`, '/mailroom', '/jobs', `/jobs/${ghJob.id}`, '/profile', '/settings']) {
    const res = await call('GET', path, undefined, { raw: true });
    assert.equal(res.status, 200, `${path} → ${res.status}`);
  }
  const old = await call('GET', '/outreach', undefined, { raw: true });
  assert.ok([307, 308].includes(old.status));
  assert.match(old.headers.get('location'), /\/mailroom/);
});

await step('Page readers: JS-only pages read through the built-in reader or Crawl4AI, blocked pages stay blocked', async () => {
  const WEB = 'http://127.0.0.1:4020';
  // No Crawl4AI server: the built-in hosted reader renders the JavaScript-only page.
  const before = await call('POST', '/api/browser/open', { url: `${WEB}/page/spa` });
  assert.equal(before.status, 200, JSON.stringify(before.data));
  assert.equal(before.data.page.via, 'reader');
  assert.equal(before.data.page.title, 'Talent Partner, India');
  assert.match(before.data.page.description, /Boolean search/);
  const st0 = await call('POST', '/api/selftest');
  const r0 = st0.data.checks.find((c) => c.id === 'reader');
  assert.equal(r0.ok, true, r0.detail);
  assert.match(r0.detail, /Built-in reader/);
  assert.equal((await call('PUT', '/api/settings', { values: { crawl4ai_url: WEB, crawl4ai_token: 'hunter:c4-e2e' } })).status, 200);
  const t = await call('POST', '/api/settings/test-reader', {});
  assert.equal(t.status, 200, JSON.stringify(t.data));
  const bad = await call('POST', '/api/settings/test-reader', { token: 'hunter:wrong' });
  assert.equal(bad.status, 502);
  assert.match(bad.data.error, /token/);
  const after = await call('POST', '/api/browser/open', { url: `${WEB}/page/spa` });
  assert.equal(after.status, 200, JSON.stringify(after.data));
  assert.equal(after.data.page.via, 'crawl4ai');
  assert.equal(after.data.page.title, 'Talent Partner, India');
  assert.match(after.data.page.description, /Boolean search/);
  assert.ok(after.data.page.salary, 'salary missing');
  // A site that refuses readers is not retried through the crawler.
  const blocked = await call('POST', '/api/browser/open', { url: `${WEB}/page/blocked` });
  assert.equal(blocked.status, 502);
  assert.match(blocked.data.error, /does not let apps read/);
  // Pages with a real posting are still read directly.
  const direct = await call('POST', '/api/browser/open', { url: `${WEB}/careers/senior-recruiter` });
  assert.equal(direct.data.page.via, 'direct');
  const st = await call('POST', '/api/selftest');
  const reader = st.data.checks.find((c) => c.id === 'reader');
  assert.equal(reader.ok, true, reader.detail);
  assert.equal((await call('PUT', '/api/settings', { values: { crawl4ai_url: null, crawl4ai_token: null } })).status, 200);
});

await step('security: cross-site writes refused, signed-out API refused', async () => {
  const evil = await call('POST', '/api/settings', { values: {} }, { raw: true, headers: { origin: 'https://evil.example' } });
  assert.equal(evil.status, 403);
  const ours = await call('PUT', '/api/settings', { values: { writing_tone: 'warm' } }, { raw: true, headers: { origin: BASE } });
  assert.equal(ours.status, 200);
  const anon = await fetch(BASE + '/api/settings');
  assert.equal(anon.status, 401);
  const forged = await fetch(BASE + '/api/settings', { headers: { cookie: 'ho_session=9999999999.forged' } });
  assert.equal(forged.status, 401);
});

console.log(`\n${passed} end-to-end checks passed.`);
