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
  // Pages of 400 jobs keep memory flat on a board with months of scans.
  const results: { id: string; g: ReturnType<typeof grill> }[] = [];
  let cursor: string | undefined;
  for (;;) {
    const jobs = await prisma.job.findMany({
      where, orderBy: { id: 'asc' }, take: 400, ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      select: { id: true, title: true, location: true, description: true, workMode: true, salary: true },
    });
    if (!jobs.length) break;
    const rows = jobs.map((j) => ({ id: j.id, g: grill(gp, j) }));
    results.push(...rows);
    await prisma.$executeRaw`
      UPDATE jobs AS j SET grill_score = x.score, grill_breakdown = x.breakdown, grilled_at = now()
      FROM jsonb_to_recordset(${JSON.stringify(rows.map(({ id, g }) => ({ id, score: g.score, breakdown: g })))}::jsonb) AS x(id uuid, score int, breakdown jsonb)
      WHERE j.id = x.id`;
    cursor = jobs[jobs.length - 1].id;
    if (jobs.length < 400) break;
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
