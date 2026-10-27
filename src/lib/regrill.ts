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
  const results = jobs.map((j) => ({ id: j.id, g: grill(gp, j) }));
  // One UPDATE per 500 jobs, so a save with a big board still answers in a second or two.
  for (let i = 0; i < results.length; i += 500) {
    const rows = results.slice(i, i + 500).map(({ id, g }) => ({ id, score: g.score, breakdown: g }));
    await prisma.$executeRaw`
      UPDATE jobs AS j SET grill_score = x.score, grill_breakdown = x.breakdown, grilled_at = now()
      FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) AS x(id uuid, score int, breakdown jsonb)
      WHERE j.id = x.id`;
  }
  return results;
}

// Regrill that never fails the request it rides on (the save itself already succeeded).
export async function regrillQuietly(): Promise<{ grilled: number; warning: string | null }> {
  try {
    return { grilled: (await regrill()).length, warning: null };
  } catch (err) {
    return { grilled: 0, warning: err instanceof HttpError ? err.message : 'Saved, but jobs could not be re-scored. Press Re-grill on any job to retry.' };
  }
}
