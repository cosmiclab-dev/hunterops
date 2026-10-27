// Module C: The "Editor". Rewrites text in ASD-STE100 Simplified Technical
// English style, then runs the Anti-Slop guard on the result.
import { chat, type LlmConfig } from './llm/client';
import { HttpError } from './http';
import { scanForSlop, applySafeFixes, slopRejection } from './modules/anti-slop';

export const STE100_INSTRUCTION = 'Rewrite the following text adhering to ASD-STE100 Simplified Technical English rules. One idea per sentence. Use active voice. Remove all jargon.';

const RULES = `Also:
- Keep sentences under 20 words; procedural sentences under 15.
- Use the simplest common word for each idea, and use it the same way every time.
- Keep every fact, name, number and the greeting and sign-off. Do not add facts.
- Keep paragraph breaks. Reply with the rewritten text only, no preface and no quotes.`;

export function ste100Messages(text: string) {
  return [
    { role: 'system' as const, content: `${STE100_INSTRUCTION}\n\n${RULES}` },
    { role: 'user' as const, content: text },
  ];
}

export async function refineToPlainEnglish(cfg: LlmConfig, text: string, extra: string[] = []) {
  const src = String(text || '').trim();
  if (!src) throw new HttpError(400, 'Paste some text to simplify.');
  if (src.length > 8000) throw new HttpError(413, 'Keep it under 8,000 characters.');
  const out = await chat(cfg, ste100Messages(src), { maxTokens: 2000, temperature: 0.2 });
  let refined = out.content.trim().replace(/^["“]|["”]$/g, '');
  const check = scanForSlop(refined, extra);
  if (check.hasSlop) {
    refined = applySafeFixes(refined, extra).text;
    const again = scanForSlop(refined, extra);
    if (again.hasSlop) throw new HttpError(422, slopRejection(again.findings));
  }
  return { text: refined, model: out.model, sentences: refined.split(/(?<=[.!?])\s+/).filter(Boolean).length };
}
