import { ok, readJson, route } from '@/lib/http';
import { chat, llmConfig, type Overrides } from '@/lib/llm/client';
import { PROVIDERS } from '@/lib/llm/providers';
import { loadSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// One short round trip with the saved settings, or with unsaved values from the form.
export const POST = route(async (req: Request) => {
  const o = await readJson<Overrides>(req);
  const cfg = llmConfig(await loadSettings(), {
    provider: o.provider || undefined,
    model: o.model || undefined,
    key: o.key || undefined,
    baseUrl: o.baseUrl || undefined,
  });
  const started = Date.now();
  const out = await chat(cfg, [
    { role: 'system', content: 'Reply with the single word: ready' },
    { role: 'user', content: 'Status?' },
  ], { maxTokens: 20, timeoutMs: 25_000 });
  return ok({
    ok: true, provider: PROVIDERS[cfg.provider].label, model: out.model, reply: out.content.trim().slice(0, 60), ms: Date.now() - started,
  });
});
