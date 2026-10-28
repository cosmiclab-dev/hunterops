import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { HttpError, ok, readJson, route } from '@/lib/http';
import { loadJobPage } from '@/lib/job-page';
import { grillPage, saveJobPage } from '@/lib/jobs';
import { regrill } from '@/lib/regrill';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const Body = z.object({ url: z.string().max(2000).optional(), jobId: z.string().uuid().optional(), save: z.boolean().default(false) });

// With { jobId }: re-read that job's posting and score it again (the Browser's Analyze).
// With { url }: fetch that posting, score it against the profile, optionally save it.
// Without a body: re-grill every job on the board against the current profile.
export const POST = route(async (req: Request) => {
  const body = Body.parse(await readJson(req));
  if (body.jobId) {
    const job = await prisma.job.findUnique({ where: { id: body.jobId }, include: { companyRef: true } });
    if (!job) throw new HttpError(404, 'Job not found.');
    const page = await loadJobPage(job.url, job.companyRef);
    const grill = await grillPage({ ...page, description: page.description || job.description || '', location: page.location || job.location, salary: page.salary || job.salary });
    if (!grill) throw new HttpError(400, 'Set up your profile first: upload your CV on the Home page.');
    await prisma.job.update({ where: { id: job.id }, data: { grillScore: grill.score, grillBreakdown: grill as unknown as Prisma.InputJsonValue, grilledAt: new Date() } });
    return ok({ job: { id: job.id, title: job.title, company: job.company }, grill });
  }
  if (!body.url) {
    const results = await regrill();
    return ok({ grilled: results.length });
  }
  const page = await loadJobPage(body.url);
  if (!page.description) throw new HttpError(422, 'Could not read a job description on that page.');
  if (body.save) {
    const { job, grill, created } = await saveJobPage(page, 'SAVED');
    return ok({ job: { id: job.id, title: job.title, company: job.company }, grill, created });
  }
  const grill = await grillPage(page);
  if (!grill) throw new HttpError(400, 'Set up your profile first: upload your CV on the Home page.');
  return ok({ job: { title: page.title, company: page.company, location: page.location, url: page.url }, grill });
});
