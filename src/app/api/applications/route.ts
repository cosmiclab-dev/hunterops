import { z } from 'zod';
import { prisma } from '@/lib/db';
import { ok, readJson, route } from '@/lib/http';
import { isStalePrep, prepareApplication } from '@/lib/apply';

export const dynamic = 'force-dynamic';
// The answers, the resume and the cover letter are written in parallel; thinking models take minutes.
export const maxDuration = 300;

// Every open application, for the Pipeline badges and the approvals list.
export const GET = route(async () => {
  const rows = await prisma.application.findMany({
    where: { status: { not: 'SUBMITTED' } },
    orderBy: { updatedAt: 'desc' },
    take: 100,
    select: { jobId: true, status: true, updatedAt: true, error: true, job: { select: { title: true, company: true, grillScore: true } } },
  });
  return ok({ applications: rows.map((r) => ({ ...r, status: isStalePrep(r) ? 'FAILED' : r.status })) });
});

const Body = z.object({ jobId: z.string().uuid() });

// Prepare (or prepare again) the application for one job. Nothing is submitted.
export const POST = route(async (req: Request) => {
  const { jobId } = Body.parse(await readJson(req));
  return ok({ application: await prepareApplication(jobId) }, 201);
});
