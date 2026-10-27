// Runs a writing prompt through the configured model, then Module A (Anti-Slop).
// A draft with banned phrases goes back to the model once; whatever remains is
// returned with the report so the person sees it highlighted.
import { chatJson, type ChatMessage, type LlmConfig } from './llm/client';
import { rewriteRequest, scanSlop, textOf, type SlopReport } from './modules/anti-slop';

export async function writeClean<T = any>(cfg: LlmConfig, messages: ChatMessage[], opts: { maxTokens?: number; temperature?: number } = {}) {
  const first = await chatJson(cfg, messages, opts);
  let data = first.data as T;
  let slop: SlopReport = scanSlop(textOf(data));
  let rewrites = 0;
  if (!slop.clean) {
    try {
      const second = await chatJson(cfg, [
        ...messages,
        { role: 'assistant', content: first.content },
        { role: 'user', content: rewriteRequest(slop) },
      ], opts);
      const report = scanSlop(textOf(second.data));
      if (report.hits.length < slop.hits.length) {
        data = second.data as T;
        slop = report;
      }
      rewrites = 1;
    } catch (err) {
      console.warn('[writer] anti-slop rewrite failed, keeping first draft', (err as Error).message);
    }
  }
  return { data, slop, rewrites, model: first.model };
}
