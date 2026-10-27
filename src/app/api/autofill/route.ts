import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { HttpError, ok, readJson, route } from '@/lib/http';
import { buildAnswerSheet } from '@/lib/autofill';
import { loadJobPage } from '@/lib/job-page';
import { llmConfig } from '@/lib/llm/client';
import { requireProfile } from '@/lib/profile';
import { loadSettings } from '@/lib/settings';
import { extraBanned } from '@/lib/writer';

export const dynamic = 'force-dynamic';
// AI writing with thinking models: a draft plus one Anti-Slop rewrite can take minutes.
export const maxDuration = 300;

const Body = z.object({ jobId: z.string().uuid().optional(), url: z.string().max(2000).optional(), ai: z.boolean().default(true) });

// Auto-Fill: an answer for every field on the application form.
export const POST = route(async (req: Request) => {
  const body = Body.parse(await readJson(req));
  const job = body.jobId ? await prisma.job.findUnique({ where: { id: body.jobId }, include: { companyRef: true } }) : null;
  if (body.jobId && !job) throw new HttpError(404, 'Job not found.');
  const url = job?.url || body.url;
  if (!url) throw new HttpError(400, 'Open a job first.');
  const profile = await requireProfile();
  const settings = await loadSettings();
  const page = await loadJobPage(url, job?.companyRef);
  let cfg = null;
  if (body.ai) {
    try {
      cfg = llmConfig(settings);
    } catch { /* no AI configured: profile answers only */ }
  }
  const sheet = await buildAnswerSheet(cfg, {
    fields: page.fields,
    profile,
    company: job?.company || page.company,
    role: job?.title || page.title,
    jd: job?.description || page.description,
    extra: extraBanned(settings),
  });
  if (job) {
    const autofill = { ...sheet, createdAt: new Date().toISOString() } as unknown as Prisma.InputJsonValue;
    await prisma.artifact.upsert({ where: { jobId: job.id }, create: { jobId: job.id, autofill }, update: { autofill } });
  }
  return ok({ ...sheet, applyUrl: page.applyUrl, embedUrl: page.embedUrl });
});
