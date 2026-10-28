import { z } from 'zod';
import { prisma } from '@/lib/db';
import { HttpError, ok, readJson, route } from '@/lib/http';
import { evaluateJob } from '@/lib/career-ops/evaluate-job';
import { startTask } from '@/lib/tasks';

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
  const job = await prisma.job.findUnique({ where: { id: jobId }, select: { title: true, company: true } });
  if (!job) throw new HttpError(404, 'Job not found.');
  const task = await startTask({ kind: 'evaluate', title: `${job.company}: ${job.title}`, jobId, href: `/jobs/${jobId}`, steps: [{ key: 'evaluate', label: 'Checking the posting, researching the company and scoring the fit' }] });
  await task.step('evaluate', 'running');
  try {
    const out = await evaluateJob(jobId);
    await task.step('evaluate', 'done', `Scored ${out.report.score}/5`);
    await task.done({ result: { reportId: out.report.id }, note: { kind: 'ready', title: `Evaluation ready: ${job.company}`, body: `Career-Ops score ${out.report.score}/5 for ${job.title}.` } });
    return ok(out);
  } catch (err) {
    await task.fail(err, { title: `Evaluation failed: ${job.company}` });
    throw err;
  }
});
