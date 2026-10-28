import { z } from 'zod';
import { prisma } from '@/lib/db';
import { HttpError, ok, readJson, route } from '@/lib/http';
import { llmConfig } from '@/lib/llm/client';
import { requireProfile } from '@/lib/profile';
import { loadSettings } from '@/lib/settings';
import { tailorResume } from '@/lib/tailor';
import { extraBanned } from '@/lib/writer';

export const dynamic = 'force-dynamic';
// AI writing with thinking models: a draft plus one Anti-Slop rewrite can take minutes.
export const maxDuration = 300;

const Body = z.object({ jobId: z.string().uuid(), density: z.enum(['standard', 'compact']).default('standard') });

// Tailors the profile to one job and saves the result as a Resume (see lib/tailor).
export const POST = route(async (req: Request) => {
  const { jobId, density } = Body.parse(await readJson(req));
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) throw new HttpError(404, 'Job not found.');
  const profile = await requireProfile();
  const settings = await loadSettings();
  return ok(await tailorResume(llmConfig(settings), job, profile, { density, extra: extraBanned(settings) }));
});
