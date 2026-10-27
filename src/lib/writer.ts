// Runs a writing prompt through the configured model, then Module A (Anti-Slop).
// A draft with banned phrases goes back to the model once, then simple word
// swaps are applied. If banned phrases still remain, the draft is rejected and
// never saved: "Draft rejected due to low-quality AI patterns: [words]."
import { chatJson, type ChatMessage, type LlmConfig } from './llm/client';
import { HttpError } from './http';
import type { Settings } from './settings';
import { applySafeFixes, parseExtraBanned, rewriteRequest, scanForSlop, scanSlop, slopRejection, textOf, type SlopReport } from './modules/anti-slop';

type Pick = (data: any) => unknown;

// The person's own banned words from Settings, on top of BANNED_PHRASES.
export const extraBanned = (s: Settings) => parseExtraBanned(s.get('banned_words_extra'));

// Applies the safe one-word swaps to every string inside a JSON value.
function fixDeep(value: unknown, extra: string[]): unknown {
  if (typeof value === 'string') return applySafeFixes(value, extra).text;
  if (Array.isArray(value)) return value.map((v) => fixDeep(v, extra));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fixDeep(v, extra)]));
  return value;
}

export async function writeClean<T = any>(
  cfg: LlmConfig,
  messages: ChatMessage[],
  opts: { maxTokens?: number; temperature?: number; extra?: string[]; check?: Pick; fix?: (data: any, extra: string[]) => any } = {},
) {
  const { extra = [], check = (d: unknown) => d, fix = (d: unknown, e: string[]) => fixDeep(d, e), ...chatOpts } = opts;
  const session = crypto.randomUUID();
  const scan = (data: unknown) => scanSlop(textOf(check(data)), extra);
  const first = await chatJson(cfg, messages, { ...chatOpts, session });
  let data = first.data as T;
  let slop: SlopReport = scan(data);
  let rewrites = 0;
  if (!slop.clean) {
    try {
      const second = await chatJson(cfg, [
        ...messages,
        { role: 'assistant', content: first.content },
        { role: 'user', content: rewriteRequest(slop) },
      ], { ...chatOpts, session });
      const report = scan(second.data);
      if (report.hits.length < slop.hits.length) {
        data = second.data as T;
        slop = report;
      }
      rewrites = 1;
    } catch (err) {
      console.warn('[writer] anti-slop rewrite failed, keeping first draft', (err as Error).message);
    }
  }
  if (!slop.clean) {
    data = fix(data, extra) as T;
    slop = scan(data);
  }
  if (!slop.clean) {
    throw new HttpError(422, slopRejection(scanForSlop(textOf(check(data)), extra).findings));
  }
  return { data, slop, rewrites, model: first.model };
}
