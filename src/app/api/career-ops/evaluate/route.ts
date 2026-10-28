import { z } from 'zod';
import { prisma } from '@/lib/db';
import { HttpError, ok, readJson, route } from '@/lib/http';
import { evaluateJob } from '@/lib/career-ops/evaluate-job';

export const dynamic = 'force-dynamic';
// One long reasoning call; thinking models can take a few minutes.
export const maxDuration = 300;

const Body = z.object({ jobId: z.string().uuid() });

export const GET = route(async (req: Request) => {
  const jobId = new URL(req.url).searchParams.get('jobId');
  if (!jobId || !/^[0-9a-f-]{36}$/i.test(jobId)) throw new HttpError(400, 'jobId is required.');
  const report = await prisma.report.findFirst({ where: { jobId, mode: 'evaluation' }, orderBy: { createdAt: 'desc' } });
  return ok({ report });
});

export const POST = route(async (req: Request) => {
  const { jobId } = Body.parse(await readJson(req));
  return ok(await evaluateJob(jobId));
});
