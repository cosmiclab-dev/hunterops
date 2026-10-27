import { z } from 'zod';
import { ok, readJson, route } from '@/lib/http';
import { llmConfig } from '@/lib/llm/client';
import { loadSettings } from '@/lib/settings';
import { refineToPlainEnglish } from '@/lib/ste100';
import { extraBanned } from '@/lib/writer';

export const dynamic = 'force-dynamic';
// AI writing with thinking models: a draft plus one Anti-Slop rewrite can take minutes.
export const maxDuration = 300;

const Body = z.object({ text: z.string().max(8000) });

// Module C: rewrite any text in ASD-STE100 plain English.
export const POST = route(async (req: Request) => {
  const { text } = Body.parse(await readJson(req));
  const settings = await loadSettings();
  return ok(await refineToPlainEnglish(llmConfig(settings), text, extraBanned(settings)));
});
