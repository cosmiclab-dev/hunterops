import { z } from 'zod';
import { prisma } from '@/lib/db';
import { HttpError, ok, readJson, route } from '@/lib/http';
import { llmConfig } from '@/lib/llm/client';
import { EMAIL_RE } from '@/lib/mailer';
import { profileToText, requireProfile } from '@/lib/profile';
import { EMAIL_FRAMEWORKS, EMAIL_KINDS, emailMessages } from '@/lib/prompts';
import { loadSettings } from '@/lib/settings';
import { writeClean } from '@/lib/writer';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export const GET = route(async (req: Request) => {
  const jobId = new URL(req.url).searchParams.get('jobId');
  const emails = await prisma.email.findMany({
    where: jobId ? { jobId } : {},
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  return ok({ emails });
});

const Draft = z.object({
  jobId: z.string().uuid(),
  kind: z.enum(Object.keys(EMAIL_KINDS) as [keyof typeof EMAIL_KINDS]).default('cold'),
  framework: z.enum(Object.keys(EMAIL_FRAMEWORKS) as [keyof typeof EMAIL_FRAMEWORKS]).default('plain'),
  toEmail: z.string().max(200).regex(EMAIL_RE, 'Enter a valid email address'),
  recipientName: z.string().max(120).optional().default(''),
  recipientTitle: z.string().max(120).optional().default(''),
});

// Writes a draft. Drafts are never sent from here: see /api/emails/[id]/send.
export const POST = route(async (req: Request) => {
  const body = Draft.parse(await readJson(req));
  const job = await prisma.job.findUnique({ where: { id: body.jobId } });
  if (!job) throw new HttpError(404, 'Job not found.');
  const profile = await requireProfile();
  const settings = await loadSettings();
  const previous = body.kind === 'follow_up'
    ? (await prisma.email.findFirst({ where: { jobId: job.id, status: 'SENT' }, orderBy: { sentAt: 'desc' } }))?.body
    : undefined;
  const out = await writeClean<{ subject?: string; body?: string }>(llmConfig(settings), emailMessages({
    kind: body.kind,
    framework: body.framework,
    profileText: profileToText(profile),
    company: job.company,
    role: job.title,
    jd: job.description ?? undefined,
    recipientName: body.recipientName,
    recipientTitle: body.recipientTitle,
    previous,
  }), { maxTokens: 900, temperature: 0.5 });
  const subject = String(out.data?.subject ?? '').trim().slice(0, 200);
  const text = String(out.data?.body ?? '').trim().slice(0, 5000);
  if (!subject || !text) throw new HttpError(502, 'The model returned an empty email. Try again.');
  let contactId: string | null = null;
  if (body.recipientName || body.recipientTitle) {
    const contact = await prisma.contact.create({
      data: { company: job.company, name: body.recipientName || null, title: body.recipientTitle || null, email: body.toEmail, jobId: job.id },
    });
    contactId = contact.id;
  }
  const email = await prisma.email.create({
    data: {
      jobId: job.id, contactId, kind: body.kind, framework: body.framework, toEmail: body.toEmail,
      subject, body: text, slopScore: out.slop.score,
    },
  });
  return ok({ email, slop: out.slop, model: out.model }, 201);
});
