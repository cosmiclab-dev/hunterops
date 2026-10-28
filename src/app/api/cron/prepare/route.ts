import { HttpError, ok, route } from '@/lib/http';
import { safeEqual } from '@/lib/crypto';
import { autoPrepare } from '@/lib/apply';
import { recordAiHealth } from '@/lib/health';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Runs after the morning scan: the top matches get applications prepared,
// waiting on the Pipeline for the person's approval. Nothing is submitted.
export const GET = route(async (req: Request) => {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization') || '';
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) throw new HttpError(401, 'Unauthorized');
  const health = await recordAiHealth();
  return ok({ health, ...(await autoPrepare()) });
});
