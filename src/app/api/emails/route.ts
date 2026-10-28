import { z } from 'zod';
import { prisma } from '@/lib/db';
import { HttpError, ok, readJson, route } from '@/lib/http';
import { EMAIL_RE } from '@/lib/mailer';
import { requireProfile } from '@/lib/profile';
import { EMAIL_FRAMEWORKS, EMAIL_KINDS } from '@/lib/prompts';
import { generateEmail } from '@/lib/email-generator';
import { loadSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';
// AI writing with thinking models: a draft plus one Anti-Slop rewrite can take minutes.
export const maxDuration = 300;

export const GET = route(async (req: Request) => {
  const jobId = new URL(req.url).searchParams.get('jobId');
  const emails = await prisma.email.findMany({
    where: jobId ? { jobId } : {},
    include: { job: { select: { id: true, title: true, company: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  return ok({ emails });
});

const Draft = z.object({
  jobId: z.string().uuid().optional(),
  company: z.string().max(200).optional().default(''),
  role: z.string().max(300).optional().default(''),
  kind: z.enum(Object.keys(EMAIL_KINDS) as [keyof typeof EMAIL_KINDS]).default('cold'),
  framework: z.enum(Object.keys(EMAIL_FRAMEWORKS) as [keyof typeof EMAIL_FRAMEWORKS]).default('plain'),
  toEmail: z.string().max(200).regex(EMAIL_RE, 'Enter a valid email address'),
  recipientName: z.string().max(120).optional().default(''),
  recipientTitle: z.string().max(120).optional().default(''),
});

// Writes a draft, for a job on the board or any company. Drafts are never sent
// from here: see /api/emails/[id]/send.
export const POST = route(async (req: Request) => {
  const body = Draft.parse(await readJson(req));
  const job = body.jobId ? await prisma.job.findUnique({ where: { id: body.jobId } }) : null;
  if (body.jobId && !job) throw new HttpError(404, 'Job not found.');
  const company = job?.company || body.company.trim();
  if (!company) throw new HttpError(400, 'Pick a job or type the company name.');
  const profile = await requireProfile();
  // A follow-up refers to the last email sent to the same person, with or without a job.
  const previous = body.kind === 'follow_up'
    ? (await prisma.email.findFirst({
      where: { status: 'SENT', toEmail: { equals: body.toEmail, mode: 'insensitive' }, ...(job ? { jobId: job.id } : {}) },
      orderBy: { sentAt: 'desc' },
    }) ?? (job ? await prisma.email.findFirst({ where: { status: 'SENT', jobId: job.id }, orderBy: { sentAt: 'desc' } }) : null))?.body
    : undefined;
  const out = await generateEmail(await loadSettings(), {
    kind: body.kind,
    framework: body.framework,
    profile,
    company,
    role: job?.title || body.role || undefined,
    jd: job?.description ?? undefined,
    recipientName: body.recipientName,
    recipientTitle: body.recipientTitle,
    previous,
  });
  if (!out.subject || !out.body) throw new HttpError(502, 'The model returned an empty email. Try again.');
  let contactId: string | null = null;
  if (body.recipientName || body.recipientTitle) {
    const contact = await prisma.contact.create({
      data: { company, name: body.recipientName || null, title: body.recipientTitle || null, email: body.toEmail, jobId: job?.id ?? null },
    });
    contactId = contact.id;
  }
  const email = await prisma.email.create({
    data: {
      jobId: job?.id ?? null, contactId, kind: body.kind, framework: body.framework, toEmail: body.toEmail,
      subject: out.subject, body: out.body, slopScore: out.slop.score,
    },
  });
  return ok({ email, slop: out.slop, model: out.model }, 201);
});
