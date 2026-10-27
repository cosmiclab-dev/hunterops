// Tests for netlify/functions/ai-brain.js against a fake OpenAI-compatible server.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';

let server;
let lastRequest;
let reply;

before(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      if (req.method === 'GET' && req.url === '/inference/go/v1/models') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ object: 'list', data: [{ id: 'deepseek-v4.1-flash' }, { id: 'glm-5.3' }] }));
        return;
      }
      lastRequest = { url: req.url, headers: req.headers, body: JSON.parse(body) };
      const { status = 200, content } = reply(lastRequest);
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(status === 200
        ? { model: lastRequest.body.model, choices: [{ message: { role: 'assistant', content } }], usage: { total_tokens: 42 } }
        : { error: { message: 'nope' } }));
    });
  });
  await new Promise((r) => server.listen(0, r));
  process.env.OPENCODE_API_URL = `http://127.0.0.1:${server.address().port}/inference/go/openai/v1/`;
  process.env.OPENCODE_API_KEY = 'test-key';
  delete process.env.OPENCODE_MODEL;
  delete process.env.OPENCODE_ALLOWED_MODELS;
  delete process.env.APP_ACCESS_TOKEN;
});

after(() => server.close());

const { default: handler } = await import('../netlify/functions/ai-brain.js');
const call = async (body, headers = {}) => {
  const res = await handler(new Request('http://localhost/api/ai', {
    method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body),
  }));
  return { status: res.status, body: await res.json() };
};

test('audit_profile: request shape and parsed result', async () => {
  reply = () => ({
    content: '```json\n' + JSON.stringify({
      weak_phrases: [{ original: 'Responsible for end-to-end recruitment', problem: 'Duty, no outcome', rewrite: 'Closed [X] roles a quarter', category: 'time_to_fill' }],
      metrics: [
        { category: 'time_to_fill', bullet: 'Cut TTF from [A] to [B] days', how_to_defend: 'ATS report' },
        { category: 'direct_sourcing_ratio', bullet: 'Sourced [X]% directly' },
        { category: 'offer_to_join', bullet: 'Raised OTJ to [B]%' },
        { category: 'stakeholder_management', bullet: 'Partnered with [N] delivery heads' },
        { category: 'agency_cost_savings', bullet: 'Saved ₹[X] lakh' },
      ],
      pitch: 'Senior Recruiter. Can join Monday.',
    }) + '\n```',
  });
  const res = await call({ action: 'audit_profile', bullets: '- Responsible for end-to-end recruitment', years: '8' });
  assert.equal(res.status, 200);
  assert.equal(lastRequest.url, '/inference/go/openai/v1/chat/completions');
  assert.equal(lastRequest.headers.authorization, 'Bearer test-key');
  assert.equal(lastRequest.body.model, 'deepseek-v4.1-flash');
  assert.equal(lastRequest.body.messages[0].role, 'system');
  assert.match(lastRequest.body.messages[1].content, /Years of recruiting experience: 8/);
  assert.equal(res.body.result.metrics.length, 5);
  assert.equal(res.body.result.weak_phrases[0].rewrite, 'Closed [X] roles a quarter');
  assert.equal(res.body.result.pitch, 'Senior Recruiter. Can join Monday.');
});

test('generate_outreach: word counts, audience order, model allowlist', async () => {
  const long = Array.from({ length: 65 }, () => 'word').join(' ');
  reply = () => ({
    content: 'Here you go: ' + JSON.stringify({
      messages: [
        { audience: 'peer_referral', message: 'Hey [Name]! Would you refer me?' },
        { audience: 'head_of_ta', message: long },
      ],
    }),
  });
  const res = await call({
    action: 'generate_outreach', company: 'Acme', recipient_title: 'Head of TA',
    audiences: ['head_of_ta', 'peer_referral'], model: 'deepseek-v4-pro',
  });
  assert.equal(res.status, 200);
  assert.equal(lastRequest.body.model, 'deepseek-v4-pro');
  const [a, b] = res.body.result.messages;
  assert.equal(a.audience, 'head_of_ta');
  assert.equal(a.over_limit, true);
  assert.equal(a.word_count, 65);
  assert.equal(b.audience, 'peer_referral');
  assert.equal(b.over_limit, false);

  const blocked = await call({ action: 'generate_outreach', company: 'A', recipient_title: 'B', model: 'gpt-6-luna' });
  assert.equal(blocked.status, 400);
});

test('errors: validation, upstream auth, bad JSON, missing config', async () => {
  assert.equal((await call({ action: 'audit_profile' })).status, 400);
  assert.equal((await call({ action: 'nope' })).status, 400);
  assert.equal((await call({ action: 'generate_outreach', company: 'A', recipient_title: 'B', audiences: ['ceo'] })).status, 400);

  reply = () => ({ status: 401 });
  const auth = await call({ action: 'audit_profile', bullets: 'x' });
  assert.equal(auth.status, 502);
  assert.match(auth.body.error, /OPENCODE_API_KEY/);

  reply = () => ({ content: 'I cannot do that.' });
  assert.equal((await call({ action: 'audit_profile', bullets: 'x' })).status, 502);

  const key = process.env.OPENCODE_API_KEY;
  delete process.env.OPENCODE_API_KEY;
  try {
    assert.equal((await call({ action: 'audit_profile', bullets: 'x' })).status, 503);
  } finally {
    process.env.OPENCODE_API_KEY = key;
  }

  assert.equal((await call({ action: 'audit_profile', bullets: 'x' }, { 'x-opencode-key': 'has spaces in it' })).status, 400);

  const get = await handler(new Request('http://localhost/api/ai'));
  assert.equal(get.status, 405);
});

test('user key from Settings: overrides env key, any valid model, test_connection', async () => {
  reply = () => ({ content: 'OK' });
  const res = await call({ action: 'test_connection', model: 'kimi-k3' }, { 'x-opencode-key': 'user-key-123' });
  assert.equal(res.status, 200);
  assert.equal(lastRequest.headers.authorization, 'Bearer user-key-123');
  assert.equal(lastRequest.body.model, 'kimi-k3');
  assert.equal(res.body.ok, true);
  assert.equal(res.body.key_source, 'settings');
  assert.equal(res.body.reply, 'OK');
  assert.deepEqual(res.body.models, ['deepseek-v4.1-flash', 'glm-5.3'], 'live model list from /inference/go/v1/models');

  // Same model with the server key is outside OPENCODE_ALLOWED_MODELS.
  assert.equal((await call({ action: 'test_connection', model: 'kimi-k3' })).status, 400);
  // Garbage model ids are refused even with a user key.
  assert.equal((await call({ action: 'test_connection', model: 'a b;c' }, { 'x-opencode-key': 'k' })).status, 400);

  // No env key and no env URL: a user key alone is enough (default Go URL is used).
  const savedKey = process.env.OPENCODE_API_KEY;
  const savedUrl = process.env.OPENCODE_API_URL;
  delete process.env.OPENCODE_API_KEY;
  try {
    const ok = await call({ action: 'test_connection' }, { 'x-opencode-key': 'user-key-123' });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.model, 'deepseek-v4.1-flash');
    delete process.env.OPENCODE_API_URL;
    const { config } = await import('../netlify/functions/ai-brain.js');
    const cfg = config(new Request('http://x', { headers: { 'x-opencode-key': 'k' } }));
    assert.equal(cfg.endpoint, 'https://opencode.ai/inference/go/openai/v1/chat/completions');
  } finally {
    process.env.OPENCODE_API_KEY = savedKey;
    process.env.OPENCODE_API_URL = savedUrl;
  }

  reply = () => ({ status: 401 });
  const bad = await call({ action: 'test_connection' }, { 'x-opencode-key': 'wrong' });
  assert.equal(bad.status, 502);
  assert.match(bad.body.error, /key in Settings/);
});
