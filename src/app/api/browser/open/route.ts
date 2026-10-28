import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { HttpError, ok, readJson, route } from '@/lib/http';
import { checkFrameable, loadJobPage } from '@/lib/job-page';
import { grillPage } from '@/lib/jobs';
import { clip } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const Body = z.object({ url: z.string().max(2000).optional(), jobId: z.string().uuid().optional() });

// The in-app Browser: loads a posting through the server (the "proxy"), returns
// a sanitized reader view, the application form's fields and a live Grill.
export const POST = route(async (req: Request) => {
  const body = Body.parse(await readJson(req));
  const job = body.jobId ? await prisma.job.findUnique({ where: { id: body.jobId }, include: { artifact: true, companyRef: true } }) : null;
  if (body.jobId && !job) throw new HttpError(404, 'Job not found.');
  const url = job?.url || body.url;
  if (!url) throw new HttpError(400, 'Paste a job link to open.');
  const page = await loadJobPage(url, job?.companyRef);
  const [frameable, grill] = await Promise.all([
    page.frameable ?? checkFrameable(page.url),
    grillPage(page),
  ]);
  const existing = job ?? await prisma.job.findUnique({ where: { url: page.url }, include: { artifact: true } });
  // Fill in what the scanner could not get (Workday and SmartRecruiters list no description).
  if (existing && page.description && (!existing.description || existing.description.length < 200)) {
    await prisma.job.update({
      where: { id: existing.id },
      data: {
        description: clip(page.description, 20000),
        salary: existing.salary || page.salary,
        ...(grill ? { grillScore: grill.score, grillBreakdown: grill as unknown as Prisma.InputJsonValue, grilledAt: new Date() } : {}),
      },
    });
  }
  return ok({
    page: { ...page, frameable },
    grill,
    job: existing ? { id: existing.id, status: existing.status, grillScore: grill?.score ?? existing.grillScore } : null,
    autofill: existing?.artifact?.autofill ?? null,
  });
});
