// HunterOps AI brain: proxies to the OpenCode Go gateway (OpenAI-compatible
// chat completions) running a DeepSeek model.
//
// Key: the user's own OpenCode Go key from the Settings screen, sent per request
// in the X-OpenCode-Key header and never stored server-side. If it is absent,
// the OPENCODE_API_KEY environment variable is used instead.
//
//   POST /api/ai  { "action": "audit_profile", "bullets": "...", "years"?: "8", "domain"?: "cloud, data" }
//   POST /api/ai  { "action": "generate_outreach", "company": "...", "recipient_title": "...",
//                   "role_url"?: "...", "req_details"?: "...", "proof_points"?: "...",
//                   "audiences"?: ["head_of_ta", "peer_referral", "practice_head"] }
//   POST /api/ai  { "action": "test_connection" }
//   Optional on all: "model". With the user's own key any model id is accepted
//   (it is their quota); with the server key only OPENCODE_ALLOWED_MODELS.
import { HttpError, json, readJson, requireAccess, handleError, str } from '../lib/http.js';
import {
  auditProfileMessages, outreachMessages, OUTREACH_AUDIENCES, METRIC_CATEGORIES,
} from '../lib/prompts.js';
import { modelConfig, DEFAULT_API_URL, MODEL_ID_RE } from '../lib/models.js';

const UPSTREAM_TIMEOUT_MS = 50_000; // Netlify's synchronous limit is 60 s.
const MAX_WORDS = 60;

export function config(req) {
  const userKey = (req.headers.get('x-opencode-key') || '').trim();
  if (userKey && (userKey.length > 512 || /\s/.test(userKey))) {
    throw new HttpError(400, 'That OpenCode API key looks malformed. Paste it again in Settings.');
  }
  const key = userKey || process.env.OPENCODE_API_KEY;
  if (!key) {
    throw new HttpError(503, 'No OpenCode Go API key. Add yours in Settings, or set OPENCODE_API_KEY in Netlify.');
  }
  const base = (process.env.OPENCODE_API_URL || DEFAULT_API_URL).replace(/\/+$/, '');
  const endpoint = base.endsWith('/chat/completions') ? base : `${base}/chat/completions`;
  return { endpoint, key, userKey: Boolean(userKey), ...modelConfig() };
}

function pickModel(requested, cfg) {
  if (!requested) return cfg.defaultModel;
  if (typeof requested !== 'string') throw new HttpError(400, '"model" must be a string.');
  if (cfg.userKey) {
    if (!MODEL_ID_RE.test(requested)) throw new HttpError(400, 'That model id has characters a model id can\'t contain.');
    return requested;
  }
  if (!cfg.allowed.includes(requested)) {
    throw new HttpError(400, `Model not allowed. Use one of: ${cfg.allowed.join(', ')}.`);
  }
  return requested;
}

async function chat(cfg, model, messages, { maxTokens, temperature }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(cfg.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.key}`,
      },
      body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens, stream: false }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new HttpError(504, `The model took longer than ${UPSTREAM_TIMEOUT_MS / 1000}s. Try again, or switch to deepseek-v4.1-flash.`);
    }
    console.error('[ai-brain] network error', err);
    throw new HttpError(502, 'Could not reach the OpenCode Go API. Check OPENCODE_API_URL, or try again.');
  } finally {
    clearTimeout(timer);
  }

  const raw = await res.text();
  if (!res.ok) {
    console.error('[ai-brain] upstream', res.status, raw.slice(0, 500));
    const hint = res.status === 401 || res.status === 403
      ? `OpenCode rejected the API key. Check ${cfg.userKey ? 'the key in Settings' : 'OPENCODE_API_KEY'}.`
      : res.status === 429
        ? 'OpenCode Go usage limit reached. Wait for the limit window to reset.'
        : res.status === 404 || res.status === 400
          ? `OpenCode Go refused the request (HTTP ${res.status}). Check the model name "${model}" in Settings.`
          : `OpenCode Go returned HTTP ${res.status}.`;
    throw new HttpError(502, hint);
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new HttpError(502, 'OpenCode Go returned a non-JSON response.');
  }
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new HttpError(502, 'The model returned an empty answer. Try again.');
  }
  return { content, usage: data.usage ?? null, model: data.model || model };
}

// Models sometimes wrap JSON in fences or add a sentence around it.
export function extractJson(text) {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch { /* fall through */ }
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try {
      return JSON.parse(cleaned.slice(start, end + 1));
    } catch { /* fall through */ }
  }
  throw new HttpError(502, 'The model did not return valid JSON. Try again.');
}

export function countWords(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

const asText = (v) => (typeof v === 'string' ? v.trim() : '');

function normalizeAudit(parsed) {
  const weak = Array.isArray(parsed.weak_phrases) ? parsed.weak_phrases : [];
  const metrics = Array.isArray(parsed.metrics) ? parsed.metrics : [];
  return {
    weak_phrases: weak
      .map((w) => ({
        original: asText(w?.original),
        problem: asText(w?.problem),
        rewrite: asText(w?.rewrite),
        category: asText(w?.category) || 'other',
      }))
      .filter((w) => w.original && w.rewrite)
      .slice(0, 10),
    metrics: metrics
      .map((m) => ({
        category: METRIC_CATEGORIES.includes(m?.category) ? m.category : asText(m?.category) || 'other',
        bullet: asText(m?.bullet),
        how_to_defend: asText(m?.how_to_defend),
      }))
      .filter((m) => m.bullet)
      .slice(0, 5),
    pitch: asText(parsed.pitch),
  };
}

function normalizeOutreach(parsed, audiences) {
  const list = Array.isArray(parsed.messages) ? parsed.messages : [];
  return audiences.map((key, i) => {
    const hit = list.find((m) => m?.audience === key) ?? list[i];
    const message = asText(hit?.message);
    const words = countWords(message);
    return {
      audience: key,
      label: OUTREACH_AUDIENCES[key].label,
      message,
      word_count: words,
      over_limit: words >= MAX_WORDS,
    };
  }).filter((m) => m.message);
}

// Best-effort live model list. Go publishes it at /inference/go/v1/models.
async function listModels(cfg) {
  const marker = '/inference/go/';
  const i = cfg.endpoint.indexOf(marker);
  if (i === -1) return null;
  const url = `${cfg.endpoint.slice(0, i)}${marker}v1/models`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${cfg.key}` }, signal: controller.signal });
    if (!res.ok) return null;
    const data = await res.json();
    const ids = (Array.isArray(data?.data) ? data.data : [])
      .map((m) => m?.id).filter((id) => typeof id === 'string' && MODEL_ID_RE.test(id));
    return ids.length ? ids : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function testConnection(cfg, body) {
  const model = pickModel(body.model, cfg);
  const started = Date.now();
  const [out, models] = await Promise.all([
    chat(cfg, model, [{ role: 'user', content: 'Reply with the single word OK.' }], { maxTokens: 64, temperature: 0 }),
    listModels(cfg),
  ]);
  return json(200, {
    action: 'test_connection',
    ok: true,
    model: out.model,
    key_source: cfg.userKey ? 'settings' : 'server',
    latency_ms: Date.now() - started,
    reply: out.content.trim().slice(0, 80),
    models,
  });
}

async function auditProfile(cfg, body) {
  const bullets = str(body.bullets, 'bullets', { required: true, max: 8000 });
  const years = str(body.years, 'years', { max: 20 });
  const domain = str(body.domain, 'domain', { max: 200 });
  const model = pickModel(body.model, cfg);
  const out = await chat(cfg, model, auditProfileMessages({ bullets, years, domain }), {
    maxTokens: 2500, temperature: 0.4,
  });
  const result = normalizeAudit(extractJson(out.content));
  if (!result.metrics.length && !result.weak_phrases.length) {
    throw new HttpError(502, 'The model answer was missing the audit fields. Try again.');
  }
  return json(200, { action: 'audit_profile', model: out.model, usage: out.usage, result });
}

async function generateOutreach(cfg, body) {
  const company = str(body.company, 'company', { required: true, max: 200 });
  const recipientTitle = str(body.recipient_title, 'recipient_title', { required: true, max: 120 });
  const roleUrl = str(body.role_url, 'role_url', { max: 2048 });
  const reqDetails = str(body.req_details, 'req_details', { max: 2000 });
  const proofPoints = str(body.proof_points, 'proof_points', { max: 2000 });
  let audiences = body.audiences ?? Object.keys(OUTREACH_AUDIENCES);
  if (!Array.isArray(audiences) || audiences.length === 0
      || audiences.some((a) => !Object.hasOwn(OUTREACH_AUDIENCES, a))) {
    throw new HttpError(400, `"audiences" must be a list drawn from: ${Object.keys(OUTREACH_AUDIENCES).join(', ')}.`);
  }
  audiences = [...new Set(audiences)];
  const model = pickModel(body.model, cfg);
  const out = await chat(cfg, model, outreachMessages({
    company, recipientTitle, roleUrl, reqDetails, proofPoints, audiences,
  }), { maxTokens: 1200, temperature: 0.7 });
  const messages = normalizeOutreach(extractJson(out.content), audiences);
  if (!messages.length) throw new HttpError(502, 'The model answer had no messages. Try again.');
  return json(200, { action: 'generate_outreach', model: out.model, usage: out.usage, result: { messages } });
}

export default async (req) => {
  try {
    requireAccess(req);
    if (req.method.toUpperCase() !== 'POST') throw new HttpError(405, 'Use POST.');
    const body = await readJson(req);
    const cfg = config(req);
    switch (body.action) {
      case 'test_connection':
        return await testConnection(cfg, body);
      case 'audit_profile':
        return await auditProfile(cfg, body);
      case 'generate_outreach':
        return await generateOutreach(cfg, body);
      default:
        throw new HttpError(400, '"action" must be "audit_profile", "generate_outreach" or "test_connection".');
    }
  } catch (err) {
    return handleError(err, 'ai-brain');
  }
};
