import { ok, readJson, route } from '@/lib/http';
import { loadProfile, saveProfile } from '@/lib/profile';
import { regrill } from '@/lib/regrill';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export const GET = route(async () => ok({ profile: await loadProfile() }));

// Saving the profile re-grills the board, since skills, years and location rules feed the score.
export const PUT = route(async (req: Request) => {
  const { profile } = await readJson<{ profile?: unknown }>(req, 256 * 1024);
  const saved = await saveProfile(profile ?? {});
  const grilled = (await regrill()).length;
  return ok({ profile: saved, grilled });
});
