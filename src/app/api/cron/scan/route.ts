import { HttpError, ok, route } from '@/lib/http';
import { safeEqual } from '@/lib/crypto';
import { loadSettings } from '@/lib/settings';
import { runScan } from '@/lib/scan/scanner';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Vercel Cron calls this with "Authorization: Bearer $CRON_SECRET".
export const GET = route(async (req: Request) => {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization') || '';
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) throw new HttpError(401, 'Unauthorized');
  const summary = await runScan(await loadSettings(), { trigger: 'cron', budgetMs: 45_000 });
  return ok(summary);
});
