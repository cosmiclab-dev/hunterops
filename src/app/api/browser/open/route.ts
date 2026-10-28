import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { HttpError, ok, readJson, route } from '@/lib/http';
import { checkFrameable, loadJobPage, type JobPage } from '@/lib/job-page';
import { textToHtml } from '@/lib/html';
import { grillPage } from '@/lib/jobs';
import { findOriginalPosting, isAggregatorUrl } from '@/lib/original-posting';
import { loadSettings } from '@/lib/settings';
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
  if (!job?.url && !body.url) throw new HttpError(400, 'Paste a job link to open.');
  // A job board listing (Adzuna) refuses apps and hides the form: open the
  // same job on the employer's own site instead, found once and kept.
  let url = job?.url || body.url!;
  let board: string | null = null;
  if (job && isAggregatorUrl(job.url)) {
    board = new URL(job.url).hostname.replace(/^www\./, '');
    let employer = job.employerUrl;
    if (!employer) {
      employer = (await findOriginalPosting(job, await loadSettings()).catch(() => null))?.url ?? null;
      if (employer) await prisma.job.update({ where: { id: job.id }, data: { employerUrl: employer } });
    }
    if (employer) url = employer;
  }
  const listing = job?.url;
  const employer = listing && url !== listing;
  // The employer's page first when there is one, then the listing. A site
  // that refuses apps (Adzuna answers 403) still opens: the posting as the
  // scan saved it, with the site one tap away.
  let saved: string | null = null;
  let page = await loadJobPage(url, employer ? null : job?.companyRef).catch((err) => {
    if (!employer && !job) throw err;
    if (!employer) saved = (err as Error).message;
    return null;
  });
  if (!page && employer) {
    url = listing!;
    page = await loadJobPage(url, job?.companyRef).catch((err) => {
      saved = (err as Error).message;
      return null;
    });
  }
  if (!page) page = storedPage(job!);
  const [frameable, grill] = await Promise.all([
    saved ? false : page.frameable ?? checkFrameable(page.url),
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
    // Set when the site refused to be read and this is the posting as saved by the scan.
    saved: saved ? { reason: saved } : null,
    // Set when the listing came from a job board and this is the employer's own posting.
    via: board && url !== job?.url ? { board, listing: job!.url } : null,
    board: board && url === job?.url ? board : null,
    grill,
    job: existing ? { id: existing.id, status: existing.status, grillScore: grill?.score ?? existing.grillScore } : null,
    autofill: existing?.artifact?.autofill ?? null,
    coverLetter: existing?.artifact?.coverLetterText ?? null,
  });
});

type StoredJob = { url: string; title: string; company: string; location: string | null; workMode: string; salary: string | null; description: string | null; postedAt: Date | null };

function storedPage(job: StoredJob): JobPage {
  const description = job.description || `${job.title} at ${job.company}.`;
  return {
    url: job.url, applyUrl: job.url, source: 'web', ats: null,
    title: job.title, company: job.company, location: job.location, remote: job.workMode === 'REMOTE',
    postedAt: job.postedAt?.toISOString() ?? null, salary: job.salary,
    description, html: textToHtml(description), fields: [], embedUrl: null, frameable: false, via: 'direct',
  };
}
