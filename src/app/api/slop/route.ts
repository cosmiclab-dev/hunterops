import { z } from 'zod';
import { ok, readJson, route } from '@/lib/http';
import { applySafeFixes, scanSlop } from '@/lib/modules/anti-slop';
import { loadSettings } from '@/lib/settings';
import { extraBanned } from '@/lib/writer';

export const dynamic = 'force-dynamic';

const Body = z.object({ text: z.string().max(60000), fix: z.boolean().optional() });

// Checks text against the banned list plus the words added in Settings.
export const POST = route(async (req: Request) => {
  const { text, fix } = Body.parse(await readJson(req));
  const extra = extraBanned(await loadSettings());
  if (fix) {
    const fixed = applySafeFixes(text, extra);
    return ok({ ...fixed, report: scanSlop(fixed.text, extra) });
  }
  return ok({ report: scanSlop(text, extra) });
});
