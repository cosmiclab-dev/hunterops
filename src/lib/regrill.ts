import type { Prisma } from '@prisma/client';
import { prisma } from './db';
import { grill } from './modules/grill';
import { loadProfile, profileIsEmpty, toGrillProfile } from './profile';
import { HttpError } from './http';

// Re-scores jobs against the current profile (after a profile edit, or on demand).
export async function regrill(where: Prisma.JobWhereInput = { status: { not: 'DISMISSED' } }) {
  const profile = await loadProfile();
  if (!profile || profileIsEmpty(profile)) throw new HttpError(400, 'Set up your profile first: upload your CV on the Home page.');
  const gp = toGrillProfile(profile);
  const jobs = await prisma.job.findMany({ where, select: { id: true, title: true, location: true, description: true, workMode: true, salary: true } });
  const now = new Date();
  const results = jobs.map((j) => ({ id: j.id, g: grill(gp, j) }));
  // Batches of updates in one transaction each keep round trips low on Neon.
  for (let i = 0; i < results.length; i += 50) {
    await prisma.$transaction(results.slice(i, i + 50).map(({ id, g }) => prisma.job.update({
      where: { id },
      data: { grillScore: g.score, grillBreakdown: g as unknown as Prisma.InputJsonValue, grilledAt: now },
    })));
  }
  return results;
}
