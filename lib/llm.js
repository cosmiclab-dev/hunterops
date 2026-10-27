// OpenCode Go client (OpenAI-compatible chat completions, DeepSeek by default).
// The key and model come from Settings (encrypted in Neon) or the env fallback.
import { HttpError } from './http.js';
import { getSetting, settingSource } from './settings.js';
import { DEFAULT_API_URL, DEFAULT_MODEL, MODEL_ID_RE } from './models.js';

const UPSTREAM_TIMEOUT_MS = 120_000;

export function llmConfig({ apiKey, model } = {}) {
  const key = (apiKey || getSetting('opencode_api_key') || '').trim();
  if (!key) throw new HttpError(503, 'Add your OpenCode Go API key in Settings first.');
  if (key.length > 512 || /\s/.test(key)) throw new HttpError(400, 'That OpenCode API key looks malformed. Paste it again in Settings.');
  const chosen = model || getSetting('opencode_model') || DEFAULT_MODEL;
  if (typeof chosen !== 'string' || !MODEL_ID_RE.test(chosen)) throw new HttpError(400, 'That model id has characters a model id can\'t contain.');
  const base = (process.env.OPENCODE_API_URL || DEFAULT_API_URL).replace(/\/+$/, '');
  const endpoint = base.endsWith('/chat/completions') ? base : `${base}/chat/completions`;
  return { endpoint, key, model: chosen, keySource: apiKey ? 'request' : settingSource('opencode_api_key') };
}

export async function chat(cfg, messages, { maxTokens = 2000, temperature = 0.4, json: wantJson = false } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(cfg.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.key}` },
      body: JSON.stringify({
        model: cfg.model, messages, temperature, max_tokens: maxTokens, stream: false,
        ...(wantJson ? { response_format: { type: 'json_object' } } : {}),
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new HttpError(504, `The model took longer than ${UPSTREAM_TIMEOUT_MS / 1000}s. Try again, or switch to deepseek-v4.1-flash.`);
    }
    console.error('[llm] network error', err);
    throw new HttpError(502, 'Could not reach the OpenCode Go API. Try again in a moment.');
  } finally {
    clearTimeout(timer);
  }

  const raw = await res.text();
  if (!res.ok) {
    // Some models reject response_format; retry once without it.
    if (wantJson && res.status === 400 && /response_format/i.test(raw)) {
      return chat(cfg, messages, { maxTokens, temperature, json: false });
    }
    console.error('[llm] upstream', res.status, raw.slice(0, 500));
    const hint = res.status === 401 || res.status === 403
      ? 'OpenCode rejected the API key. Check it in Settings.'
      : res.status === 429
        ? 'OpenCode Go usage limit reached. Wait for the limit window to reset.'
        : res.status === 404 || res.status === 400
          ? `OpenCode Go refused the request (HTTP ${res.status}). Check the model "${cfg.model}" in Settings.`
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
  if (typeof content !== 'string' || !content.trim()) throw new HttpError(502, 'The model returned an empty answer. Try again.');
  return { content, usage: data.usage ?? null, model: data.model || cfg.model };
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

export async function chatJson(cfg, messages, opts = {}) {
  const out = await chat(cfg, messages, { ...opts, json: true });
  return { ...out, data: extractJson(out.content) };
}

export const countWords = (text) => String(text || '').trim().split(/\s+/).filter(Boolean).length;

export const asText = (v, max = 4000) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
export const asList = (v, max = 30, each = 600) =>
  (Array.isArray(v) ? v : []).map((x) => asText(typeof x === 'string' ? x : x?.text ?? '', each)).filter(Boolean).slice(0, max);

// Best-effort live model list. Go publishes it at /inference/go/v1/models.
export async function listModels(cfg) {
  const marker = '/inference/go/';
  const i = cfg.endpoint.indexOf(marker);
  if (i === -1) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${cfg.endpoint.slice(0, i)}${marker}v1/models`, {
      headers: { Authorization: `Bearer ${cfg.key}` }, signal: controller.signal,
    });
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
