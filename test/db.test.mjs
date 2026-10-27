// Integration tests for netlify/functions/db.js against a local Postgres.
// Run: TEST_DATABASE_URL=postgres://... npm test   (Node 22.3+ for module mocks)
import { test, mock, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const skip = !process.env.TEST_DATABASE_URL && 'TEST_DATABASE_URL not set';

let handler;
let pool;

before(async () => {
  if (skip) return;
  const fake = await import('./fake-neon.mjs');
  mock.module('@neondatabase/serverless', { namedExports: { neon: fake.neon } });
  pool = fake.getPool();
  await pool.query('DROP TABLE IF EXISTS outreach_logs, saved_jobs, users CASCADE');
  const schema = await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8');
  await pool.query(schema);
  // Run the schema twice to prove it is idempotent.
  await pool.query(schema);
  process.env.DATABASE_URL = 'postgres://fake';
  delete process.env.APP_ACCESS_TOKEN;
  ({ default: handler } = await import('../netlify/functions/db.js'));
});

after(async () => {
  if (pool) await pool.end();
});

const call = async (method, path, body, headers = {}) => {
  const res = await handler(new Request(`http://localhost${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  }));
  return { status: res.status, body: await res.json() };
};

test('jobs: create, list, dedupe, patch, delete', { skip }, async () => {
  const created = await call('POST', '/.netlify/functions/db/jobs', {
    title: 'Senior Recruiter', company: 'Acme', url: 'https://jobs.lever.co/acme/123', location: 'Bengaluru',
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.job.ats_type, 'lever');
  assert.equal(created.body.job.status, 'discovered');
  const id = created.body.job.id;

  const wd = await call('POST', '/api/jobs', {
    title: 'TA Partner', company: 'BigCo GCC', url: 'https://bigco.wd3.myworkdayjobs.com/en-US/careers/job/x',
  });
  assert.equal(wd.body.job.ats_type, 'workday');

  const dupe = await call('POST', '/api/jobs', { title: 'x', company: 'y', url: 'https://jobs.lever.co/acme/123' });
  assert.equal(dupe.status, 409);
  assert.match(dupe.body.error, /Already in your pipeline/);

  const list = await call('GET', '/api/jobs');
  assert.equal(list.status, 200);
  assert.equal(list.body.jobs.length, 2);
  assert.equal(list.body.jobs[0].company, 'BigCo GCC', 'newest first');
  assert.equal(list.body.jobs[0].outreach_count, 0);

  const patched = await call('PATCH', `/api/jobs/${id}`, { status: 'screening', notes: 'Call Thu' });
  assert.equal(patched.status, 200);
  assert.equal(patched.body.job.status, 'screening');
  assert.equal(patched.body.job.notes, 'Call Thu');

  const statusOnly = await call('PATCH', `/.netlify/functions/db/jobs/${id}`, { status: 'offer' });
  assert.equal(statusOnly.body.job.notes, 'Call Thu', 'notes untouched when absent');

  const cleared = await call('PATCH', `/api/jobs/${id}`, { notes: '' });
  assert.equal(cleared.body.job.notes, null);
  assert.equal(cleared.body.job.status, 'offer');

  const filtered = await call('GET', '/api/jobs?status=offer');
  assert.equal(filtered.body.jobs.length, 1);

  assert.equal((await call('PATCH', `/api/jobs/${id}`, { status: 'hired' })).status, 400);
  assert.equal((await call('PATCH', '/api/jobs/not-a-uuid', { status: 'offer' })).status, 400);
  assert.equal((await call('PATCH', '/api/jobs/00000000-0000-0000-0000-000000000000', { status: 'offer' })).status, 404);
  assert.equal((await call('GET', '/api/jobs?status=nope')).status, 400);

  const del = await call('DELETE', `/api/jobs/${id}`);
  assert.equal(del.status, 200);
  assert.equal((await call('GET', '/api/jobs')).body.jobs.length, 1);
});

test('jobs: validation', { skip }, async () => {
  assert.equal((await call('POST', '/api/jobs', { company: 'x', url: 'https://a.b' })).status, 400);
  assert.equal((await call('POST', '/api/jobs', { title: 'x', company: 'y', url: 'javascript:alert(1)' })).status, 400);
  assert.equal((await call('POST', '/api/jobs', { title: 'x', company: 'y', url: 'https://a.com/1', ats_type: 'monster' })).status, 400);
  const bad = await handler(new Request('http://localhost/api/jobs', { method: 'POST', body: 'not json' }));
  assert.equal(bad.status, 400);
});

test('outreach: log, advance status, cascade on delete', { skip }, async () => {
  const { body: { job } } = await call('POST', '/api/jobs', {
    title: 'Lead Recruiter', company: 'Zeta', url: 'https://boards.greenhouse.io/zeta/jobs/9',
  });
  const logged = await call('POST', '/api/outreach', {
    job_id: job.id, recipient_role: 'Head of TA', channel: 'linkedin_dm',
    message_sent: 'Hi [Name], saw the role...', mark_contacted: true,
  });
  assert.equal(logged.status, 201);
  assert.equal(logged.body.job.status, 'contacted');

  // A second message does not move it again (already contacted).
  const second = await call('POST', '/api/outreach', {
    job_id: job.id, recipient_role: 'Peer', channel: 'referral', message_sent: 'Hey!', mark_contacted: true,
  });
  assert.equal(second.body.job, null);

  const free = await call('POST', '/api/outreach', { recipient_role: 'Practice Head', channel: 'email', message_sent: 'Hi' });
  assert.equal(free.status, 201);

  assert.equal((await call('POST', '/api/outreach', { recipient_role: 'x', channel: 'fax', message_sent: 'm' })).status, 400);

  const list = await call('GET', '/api/outreach');
  assert.equal(list.body.outreach.length, 3);
  assert.equal(list.body.outreach.find((o) => o.job_id === job.id).job_company, 'Zeta');

  const forJob = await call('GET', `/api/outreach?job_id=${job.id}`);
  assert.equal(forJob.body.outreach.length, 2);

  const jobs = await call('GET', '/api/jobs');
  assert.equal(jobs.body.jobs.find((j) => j.id === job.id).outreach_count, 2);

  await call('DELETE', `/api/jobs/${job.id}`);
  assert.equal((await call('GET', '/api/outreach')).body.outreach.length, 1, 'cascade removed linked logs');
});

test('health and access gate', { skip }, async () => {
  const health = await call('GET', '/api/health');
  assert.equal(health.status, 200);
  assert.equal(health.body.database.reachable, true);
  assert.equal(health.body.database.schema_ready, true);
  assert.deepEqual(health.body.ai.models, ['deepseek-v4.1-flash', 'deepseek-v4-pro']);
  assert.ok(health.body.ai.catalog.includes('deepseek-v4-pro'));

  process.env.APP_ACCESS_TOKEN = 'secret-token';
  try {
    assert.equal((await call('GET', '/api/jobs')).status, 401);
    assert.equal((await call('GET', '/api/jobs', undefined, { 'x-hunterops-key': 'wrong' })).status, 401);
    assert.equal((await call('GET', '/api/jobs', undefined, { 'x-hunterops-key': 'secret-token' })).status, 200);
  } finally {
    delete process.env.APP_ACCESS_TOKEN;
  }
});
