import { ok, readJson, route } from '@/lib/http';
import { loadProfile, saveProfile } from '@/lib/profile';
import { regrillQuietly } from '@/lib/regrill';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export const GET = route(async () => ok({ profile: await loadProfile() }));

// Saves first, then re-grills the board (skills, years, pay and location feed the score).
// The saved profile is always returned, so the screen shows exactly what is stored.
export const PUT = route(async (req: Request) => {
  const { profile } = await readJson<{ profile?: unknown }>(req, 256 * 1024);
  const saved = await saveProfile(profile ?? {});
  const { grilled, warning } = await regrillQuietly();
  return ok({ profile: saved, grilled, warning });
});
