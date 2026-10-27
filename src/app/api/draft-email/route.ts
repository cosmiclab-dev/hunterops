import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { HttpError, ok, readJson, route } from '@/lib/http';
import { generateEmail, toFramework } from '@/lib/email-generator';
import { EMAIL_RE } from '@/lib/mailer';
import { requireProfile } from '@/lib/profile';
import { loadSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';
// AI writing with thinking models: a draft plus one Anti-Slop rewrite can take minutes.
export const maxDuration = 300;

const Body = z.object({
  jobId: z.string().uuid(),
  framework: z.string().default('AIDA'),
  toEmail: z.string().max(200).regex(EMAIL_RE, 'Enter a valid email address').optional().or(z.literal('')),
});

// Writes a cover letter for one job with AIDA or PAS. It passes the Anti-Slop
// guard before it is saved; with a recipient it also becomes an email draft.
export const POST = route(async (req: Request) => {
  const body = Body.parse(await readJson(req));
  const job = await prisma.job.findUnique({ where: { id: body.jobId } });
  if (!job) throw new HttpError(404, 'Job not found.');
  const profile = await requireProfile();
  const framework = toFramework(body.framework);
  const out = await generateEmail(await loadSettings(), {
    kind: 'cover_letter', framework, profile, company: job.company, role: job.title, jd: job.description ?? undefined,
  });
  if (!out.subject || !out.body) throw new HttpError(502, 'The model returned an empty letter. Try again.');
  const email = body.toEmail
    ? await prisma.email.create({ data: { jobId: job.id, kind: 'cover_letter', framework, toEmail: body.toEmail, subject: out.subject, body: out.body, slopScore: out.slop.score } })
    : null;
  const prev = await prisma.artifact.findUnique({ where: { jobId: job.id } });
  const drafts = [...((prev?.emailDrafts as any[]) || []), { subject: out.subject, framework, emailId: email?.id ?? null, at: new Date().toISOString() }].slice(-20) as Prisma.InputJsonValue;
  await prisma.artifact.upsert({
    where: { jobId: job.id },
    create: { jobId: job.id, coverLetterText: out.body, emailDrafts: drafts },
    update: { coverLetterText: out.body, emailDrafts: drafts },
  });
  return ok({ coverLetter: { subject: out.subject, body: out.body }, email, slop: out.slop, model: out.model }, 201);
});
