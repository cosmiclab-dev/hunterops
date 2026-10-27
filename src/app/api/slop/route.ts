import { z } from 'zod';
import { ok, readJson, route } from '@/lib/http';
import { applySafeFixes, scanSlop } from '@/lib/modules/anti-slop';

const Body = z.object({ text: z.string().max(60000), fix: z.boolean().optional() });

export const POST = route(async (req: Request) => {
  const { text, fix } = Body.parse(await readJson(req));
  if (fix) {
    const fixed = applySafeFixes(text);
    return ok({ ...fixed, report: scanSlop(fixed.text) });
  }
  return ok({ report: scanSlop(text) });
});
