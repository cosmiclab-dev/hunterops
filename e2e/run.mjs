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
  assert.match(r.data.error, /rejected the API key/);
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
  const res = await call('GET', '/?view=all', undefined, { raw: true });
  assert.equal(res.status, 200);
  const html = await res.text();
  const order = ['Senior Talent Acquisition Partner', 'Technical Recruiter', 'Recruiter</a>'].map((t) => html.indexOf(t));
  assert.ok(order.every((i) => i > 0), 'job titles missing');
  assert.ok(order[0] < order[1] && order[1] < order[2], 'not sorted by Grill Score');
  assert.match(html, /data-band="green"/);
  assert.match(html, /data-band="red"/);
});

await step('filters: Bengaluru and Remote views', async () => {
  const blr = await (await call('GET', '/?view=all&loc=bengaluru', undefined, { raw: true })).text();
  assert.ok(blr.includes('Senior Talent Acquisition Partner') && !blr.includes('Technical Recruiter'));
  const remote = await (await call('GET', '/?view=all&loc=remote', undefined, { raw: true })).text();
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

console.log(`\n${passed} end-to-end checks passed.`);
