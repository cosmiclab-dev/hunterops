import { ok, route } from '@/lib/http';
import { regrill } from '@/lib/regrill';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Re-grill every job on the board against the current profile.
export const POST = route(async () => {
  const results = await regrill();
  return ok({ grilled: results.length });
});
