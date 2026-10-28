// One chat() call for every provider. Routes pick nothing provider-specific:
// they ask for a config (resolved from Settings) and send system + user text.
import { timeLeft } from '../budget';
import { HttpError } from '../http';
import type { Settings } from '../settings';
import { PROVIDERS, MODEL_ID_RE, isProviderId, type ProviderId, type WireFormat } from './providers';

export type LlmConfig = {
  provider: ProviderId;
  format: WireFormat;
  endpoint: string;
  key: string;
  model: string;
};

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };
// `session` groups the calls of one task (a draft and its anti-slop rewrite) so
// gateways such as OpenCode Go can route them together and reuse the prompt cache.
export type ChatOptions = { maxTokens?: number; temperature?: number; json?: boolean; timeoutMs?: number; session?: string; busyRetries?: number };
export type ChatResult = { content: string; model: string; usage: unknown; cut?: boolean };

export type Overrides = { provider?: string; model?: string; key?: string; baseUrl?: string };

export function llmConfig(settings: Settings, o: Overrides = {}): LlmConfig {
  const providerRaw = o.provider || settings.get('llm_provider') || 'opencode';
  if (!isProviderId(providerRaw)) throw new HttpError(400, `Unknown AI provider "${providerRaw}".`);
  const provider = providerRaw;
  const def = PROVIDERS[provider];
  const base = (o.baseUrl || (provider === 'custom' ? settings.get('llm_base_url') : '') || def.baseUrl || '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(base)) throw new HttpError(400, 'Set a base URL for the custom AI provider in Settings.');
  const key = (o.key ?? settings.get(`llm_key_${provider}`) ?? '').trim();
  if (!key && !('keyOptional' in def && def.keyOptional)) {
    throw new HttpError(503, `Add your ${def.label} API key in Settings first.`);
  }
  if (key.length > 1024 || /\s/.test(key)) throw new HttpError(400, 'That API key looks malformed. Paste it again in Settings.');
  // The saved model belongs to the saved provider; when testing another provider use its default.
  const savedProvider = settings.get('llm_provider') || 'opencode';
  const model = (o.model || (savedProvider === provider ? settings.get('llm_model') : '') || def.defaultModel || '').trim();
  if (!model) throw new HttpError(400, `Pick a model for ${def.label} in Settings.`);
  if (!MODEL_ID_RE.test(model)) throw new HttpError(400, 'That model id has characters a model id cannot contain.');
  const endpoint = def.format === 'anthropic'
    ? (base.endsWith('/v1/messages') ? base : `${base}/v1/messages`)
    : (base.endsWith('/chat/completions') ? base : `${base}/chat/completions`);
  return { provider, format: def.format, endpoint, key, model };
}

// The provider's own error text, trimmed, so the person sees why it refused.
export function upstreamMessage(raw: string): string {
  let msg = raw;
  try {
    const data = JSON.parse(raw);
    const e = data?.error ?? data;
    msg = typeof e === 'string' ? e : e?.message || e?.detail || data?.message || '';
  } catch { /* plain text body */ }
  return String(msg).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 240);
}

function upstreamHint(cfg: LlmConfig, status: number, raw = '') {
  const name = PROVIDERS[cfg.provider].label;
  const said = upstreamMessage(raw);
  const why = said ? ` It said: "${said}"` : '';
  if (status === 401 || status === 403) return `${name} rejected the request (HTTP ${status}). Check the API key in Settings.${why}`;
  if (status === 429) return `${name} rate or usage limit reached. Wait a little and try again.${why}`;
  if (status === 404 || status === 400) return `${name} refused the request (HTTP ${status}) for model "${cfg.model}".${why}`;
  return `${name} returned HTTP ${status}.${why}`;
}

// OpenCode Go rejects requests without a stable x-opencode-session header.
export function gatewayHeaders(cfg: LlmConfig, session?: string): Record<string, string> {
  let host = '';
  try { host = new URL(cfg.endpoint).hostname; } catch { /* checked in llmConfig */ }
  if (cfg.provider !== 'opencode' && !/(^|\.)opencode\.ai$/i.test(host)) return {};
  return { 'x-opencode-session': session || crypto.randomUUID() };
}

// Thinking models (DeepSeek V4, Kimi, GLM...) spend output tokens on reasoning
// before the answer, so a small cap returns an empty reply. Only used tokens are billed.
export const MIN_OUTPUT_TOKENS = 4096;
export const MAX_OUTPUT_TOKENS = 16_000;

function buildRequest(cfg: LlmConfig, messages: ChatMessage[], opts: ChatOptions): { headers: Record<string, string>; body: unknown } {
  const extra = gatewayHeaders(cfg, opts.session);
  // LLM_MAX_OUTPUT_TOKENS caps it for providers with a small output limit (the CI test's free models).
  const cap = Number(process.env.LLM_MAX_OUTPUT_TOKENS) || MAX_OUTPUT_TOKENS;
  const maxTokens = Math.min(cap, MAX_OUTPUT_TOKENS, Math.max(opts.maxTokens ?? 2000, MIN_OUTPUT_TOKENS));
  if (cfg.format === 'anthropic') {
    const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
    const rest = messages.filter((m) => m.role !== 'system');
    return {
      headers: { 'Content-Type': 'application/json', 'x-api-key': cfg.key, 'anthropic-version': '2023-06-01', ...extra },
      body: {
        model: cfg.model,
        max_tokens: maxTokens,
        ...(system ? { system } : {}),
        ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
        messages: rest,
      },
    };
  }
  return {
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'hunterops/2.0',
      ...(cfg.key ? { Authorization: `Bearer ${cfg.key}` } : {}),
      ...extra,
    },
    body: {
      model: cfg.model,
      messages,
      max_tokens: maxTokens,
      stream: false,
      ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
      ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
    },
  };
}

// "Retry-After: 10" or "Retry after 10s" in the body; 5 s when neither says.
export function retryAfterMs(header: string | null, body: string) {
  const secs = Number(header) || Number(body.match(/retry after (\d+)\s*s/i)?.[1]) || 5;
  return Math.min(Math.max(secs, 1), 30) * 1000;
}

function readContent(cfg: LlmConfig, data: any): string | undefined {
  if (cfg.format === 'anthropic') {
    const blocks = Array.isArray(data?.content) ? data.content : [];
    return blocks.filter((b: any) => b?.type === 'text').map((b: any) => b.text).join('');
  }
  return data?.choices?.[0]?.message?.content;
}

// Free providers that allow one reply every N seconds (LLM_MIN_GAP_MS) get
// their calls one at a time, each N seconds after the last answer, instead of
// a burst they refuse.
const MIN_GAP_MS = Number(process.env.LLM_MIN_GAP_MS) || 0;
let queue: Promise<number> = Promise.resolve(0);
async function takeTurn(): Promise<() => void> {
  if (!MIN_GAP_MS) return () => {};
  let release!: (t: number) => void;
  const prev = queue;
  queue = new Promise<number>((r) => (release = r));
  const ended = await prev;
  const wait = ended + MIN_GAP_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  return () => release(Date.now());
}

export async function chat(cfg: LlmConfig, messages: ChatMessage[], opts: ChatOptions = {}): Promise<ChatResult> {
  if (!opts.session) opts = { ...opts, session: crypto.randomUUID() };
  const done = await takeTurn();
  // A retry gives up this turn and waits for a new one.
  const again = (o: ChatOptions) => {
    done();
    return chat(cfg, messages, o);
  };
  try {
    return await send(cfg, messages, opts, again);
  } finally {
    done();
  }
}

async function send(cfg: LlmConfig, messages: ChatMessage[], opts: ChatOptions, again: (o: ChatOptions) => Promise<ChatResult>): Promise<ChatResult> {
  // Thinking models can take well over a minute on long prompts.
  const left = timeLeft() - 5_000;
  if (left < 10_000) throw new HttpError(504, 'This ran out of time before the AI could finish. Try again, or pick a faster model in Settings.');
  const timeoutMs = Math.min(opts.timeoutMs ?? 130_000, left);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const { headers, body } = buildRequest(cfg, messages, opts);
  let res: Response;
  try {
    res = await fetch(cfg.endpoint, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal });
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      clearTimeout(timer);
      throw new HttpError(504, `The model took longer than ${Math.round(timeoutMs / 1000)}s. Try again or pick a faster model.`);
    }
    console.error('[llm] network error', err);
    clearTimeout(timer);
    throw new HttpError(502, `Could not reach ${PROVIDERS[cfg.provider].label}. Try again in a moment.`);
  }
  // The same timer covers reading the answer, which can stall after the headers.
  let raw: string;
  try {
    raw = await res.text();
  } catch {
    throw new HttpError(504, `The model took longer than ${Math.round(timeoutMs / 1000)}s. Try again or pick a faster model.`);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    // Some models reject response_format or temperature, and not every provider
    // names the field in its error; retry once with the plainest request.
    if (res.status === 400 && (opts.json || opts.temperature !== undefined)) {
      return again({ ...opts, json: false, temperature: undefined });
    }
    // Busy or rate-limited: wait as long as the provider asks (up to 30 s) and
    // try again, twice at most, while the time budget allows.
    const tries = opts.busyRetries ?? 0;
    if ((res.status === 429 || res.status === 503 || (res.status === 402 && /retry after/i.test(raw))) && tries < 2) {
      const wait = retryAfterMs(res.headers.get('retry-after'), raw);
      if (timeLeft() - wait > 30_000) {
        console.warn('[llm] busy', res.status, `retrying in ${Math.round(wait / 1000)}s`);
        await new Promise((r) => setTimeout(r, wait));
        return again({ ...opts, busyRetries: tries + 1 });
      }
    }
    console.error('[llm] upstream', res.status, raw.slice(0, 500));
    throw new HttpError(502, upstreamHint(cfg, res.status, raw));
  }
  let data: any;
  try {
    data = JSON.parse(raw);
  } catch {
    console.error('[llm] non-JSON body', res.status, res.headers.get('content-type'), raw.slice(0, 300));
    throw new HttpError(502, `The AI provider returned a non-JSON response (HTTP ${res.status}): "${upstreamMessage(raw).slice(0, 120) || 'empty'}"`);
  }
  const content = readContent(cfg, data);
  if (typeof content !== 'string' || !content.trim()) {
    const cut = data?.choices?.[0]?.finish_reason === 'length' || data?.stop_reason === 'max_tokens';
    const budget = Math.max(opts.maxTokens ?? 2000, MIN_OUTPUT_TOKENS);
    if (cut && budget < MAX_OUTPUT_TOKENS) return again({ ...opts, maxTokens: budget * 3 });
    throw new HttpError(502, cut
      ? `"${cfg.model}" used its whole answer budget thinking. Try again, or pick a faster model in Settings.`
      : 'The model returned an empty answer. Try again.');
  }
  const cut = data?.choices?.[0]?.finish_reason === 'length' || data?.stop_reason === 'max_tokens';
  return { content, model: data?.model || cfg.model, usage: data?.usage ?? null, cut };
}

// Models sometimes wrap JSON in fences or add a sentence around it.
export function extractJson(text: string): any {
  const found = parseJsonLoose(text);
  if (found === undefined) throw new HttpError(502, 'The model did not return valid JSON. Try again.');
  return found;
}

function parseJsonLoose(text: string): any {
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
  return undefined;
}

// Closes an answer that was cut off mid-way: the open string, then every open
// array and object, dropping a half-written key or value at the end.
export function closeTruncatedJson(text: string): any {
  const cleaned = text.replace(/```(?:json)?/gi, '');
  const start = cleaned.indexOf('{');
  if (start === -1) return undefined;
  const src = cleaned.slice(start);
  const stack: string[] = [];
  let inStr = false;
  let esc = false;
  // Positions where the JSON so far ends cleanly after a complete value.
  let safe = -1;
  let safeStack: string[] = [];
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{' || c === '[') stack.push(c === '{' ? '}' : ']');
    else if (c === '}' || c === ']') {
      stack.pop();
      if (!stack.length) return parseJsonLoose(src.slice(0, i + 1));
    }
    if (!inStr && (c === ',' || c === '{' || c === '[')) {
      safe = c === ',' ? i : i + 1;
      safeStack = [...stack];
    }
  }
  if (safe === -1) return undefined;
  const body = src.slice(0, safe).replace(/,\s*$/, '');
  try {
    return JSON.parse(body + safeStack.reverse().join(''));
  } catch {
    return undefined;
  }
}

const JSON_AGAIN = 'Your last answer was not a complete, valid JSON object. Reply again with only the complete JSON object in the requested shape: no text before or after it, and keep every string short enough that the whole object fits.';

// One JSON answer. An answer that was cut off gets one more try with more
// room; one that is not JSON gets one more try with a reminder. Only then
// does a half answer count, closed where it stopped.
export async function chatJson(cfg: LlmConfig, messages: ChatMessage[], opts: ChatOptions = {}) {
  const out = await chat(cfg, messages, { ...opts, json: true });
  const data = parseJsonLoose(out.content);
  if (data !== undefined && typeof data === 'object' && data) return { ...out, data };
  console.warn('[llm] invalid JSON', { model: out.model, cut: out.cut, chars: out.content.length, tail: out.content.slice(-200) });
  if (timeLeft() > 45_000) {
    const budget = Math.max(opts.maxTokens ?? 2000, MIN_OUTPUT_TOKENS);
    const again = out.cut && budget < MAX_OUTPUT_TOKENS
      ? await chat(cfg, messages, { ...opts, json: true, maxTokens: MAX_OUTPUT_TOKENS }).catch(() => null)
      : await chat(cfg, [...messages, { role: 'user', content: JSON_AGAIN }], { ...opts, json: true }).catch(() => null);
    const second = again && parseJsonLoose(again.content);
    if (again && second && typeof second === 'object') return { ...again, data: second };
    const closed = again && closeTruncatedJson(again.content);
    if (again && closed) return { ...again, data: closed };
  }
  const closed = closeTruncatedJson(out.content);
  if (closed) return { ...out, data: closed };
  throw new HttpError(502, 'The AI\'s answer was not readable, twice. Try again, or pick another model in Settings.');
}
