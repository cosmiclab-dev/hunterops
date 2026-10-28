// A daily check of the real AI with the person's own key, kept in the
// database: does it answer, and does it return readable JSON. The morning's
// prepared applications (tasks) show the rest.
import { chatJson, llmConfig } from './llm/client';
import { loadSettings, saveInternal } from './settings';

export async function recordAiHealth() {
  const started = Date.now();
  let result: { ok: boolean; model: string | null; ms: number; detail: string; at: string };
  try {
    const settings = await loadSettings();
    const cfg = llmConfig(settings);
    const out = await chatJson(cfg, [
      { role: 'system', content: 'Reply with JSON only.' },
      { role: 'user', content: 'Return {"ok":true,"roles":["three job titles a senior recruiter in Bengaluru could apply for"]}' },
    ], { maxTokens: 800, timeoutMs: 60_000 });
    const roles = Array.isArray(out.data?.roles) ? out.data.roles.length : 0;
    result = { ok: out.data?.ok === true && roles > 0, model: out.model, ms: Date.now() - started, detail: `JSON answer with ${roles} roles`, at: new Date().toISOString() };
  } catch (err) {
    result = { ok: false, model: null, ms: Date.now() - started, detail: (err as Error).message, at: new Date().toISOString() };
  }
  await saveInternal('ai_health', JSON.stringify(result));
  return result;
}
