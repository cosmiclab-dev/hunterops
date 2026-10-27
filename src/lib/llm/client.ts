// One chat() call for every provider. Routes pick nothing provider-specific:
// they ask for a config (resolved from Settings) and send system + user text.
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
export type ChatOptions = { maxTokens?: number; temperature?: number; json?: boolean; timeoutMs?: number; session?: string };
export type ChatResult = { content: string; model: string; usage: unknown };

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

function buildRequest(cfg: LlmConfig, messages: ChatMessage[], opts: ChatOptions): { headers: Record<string, string>; body: unknown } {
  const extra = gatewayHeaders(cfg, opts.session);
  const maxTokens = opts.maxTokens ?? 2000;
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

function readContent(cfg: LlmConfig, data: any): string | undefined {
  if (cfg.format === 'anthropic') {
    const blocks = Array.isArray(data?.content) ? data.content : [];
    return blocks.filter((b: any) => b?.type === 'text').map((b: any) => b.text).join('');
  }
  return data?.choices?.[0]?.message?.content;
}

export async function chat(cfg: LlmConfig, messages: ChatMessage[], opts: ChatOptions = {}): Promise<ChatResult> {
  if (!opts.session) opts = { ...opts, session: crypto.randomUUID() };
  const timeoutMs = opts.timeoutMs ?? 55_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const { headers, body } = buildRequest(cfg, messages, opts);
  let res: Response;
  try {
    res = await fetch(cfg.endpoint, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal });
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new HttpError(504, `The model took longer than ${Math.round(timeoutMs / 1000)}s. Try again or pick a faster model.`);
    }
    console.error('[llm] network error', err);
    throw new HttpError(502, `Could not reach ${PROVIDERS[cfg.provider].label}. Try again in a moment.`);
  } finally {
    clearTimeout(timer);
  }
  const raw = await res.text();
  if (!res.ok) {
    // Some models reject response_format or temperature, and not every provider
    // names the field in its error; retry once with the plainest request.
    if (res.status === 400 && (opts.json || opts.temperature !== undefined)) {
      return chat(cfg, messages, { ...opts, json: false, temperature: undefined });
    }
    console.error('[llm] upstream', res.status, raw.slice(0, 500));
    throw new HttpError(502, upstreamHint(cfg, res.status, raw));
  }
  let data: any;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new HttpError(502, 'The AI provider returned a non-JSON response.');
  }
  const content = readContent(cfg, data);
  if (typeof content !== 'string' || !content.trim()) throw new HttpError(502, 'The model returned an empty answer. Try again.');
  return { content, model: data?.model || cfg.model, usage: data?.usage ?? null };
}

// Models sometimes wrap JSON in fences or add a sentence around it.
export function extractJson(text: string): any {
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

export async function chatJson(cfg: LlmConfig, messages: ChatMessage[], opts: ChatOptions = {}) {
  const out = await chat(cfg, messages, { ...opts, json: true });
  return { ...out, data: extractJson(out.content) };
}
