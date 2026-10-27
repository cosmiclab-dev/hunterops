import { z } from 'zod';
import { prisma } from '@/lib/db';
import { HttpError, ok, readJson, route } from '@/lib/http';
import { llmConfig } from '@/lib/llm/client';
import { profileToText, requireProfile } from '@/lib/profile';
import { OUTREACH_KINDS, outreachMessages, type OutreachKind } from '@/lib/prompts';
import { loadSettings } from '@/lib/settings';
import { scanSlop } from '@/lib/modules/anti-slop';
import { extraBanned, writeClean } from '@/lib/writer';
import { wordCount } from '@/lib/utils';

export const dynamic = 'force-dynamic';
// AI writing with thinking models: a draft plus one Anti-Slop rewrite can take minutes.
export const maxDuration = 300;


export const GET = route(async (req: Request) => {
  const status = new URL(req.url).searchParams.get('status');
  const items = await prisma.outreach.findMany({
    where: status ? { status } : {},
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: { job: { select: { id: true, title: true } } },
  });
  return ok({ items });
});

const Body = z.object({
  company: z.string().trim().min(1, 'Add the company').max(200),
  role: z.string().max(300).optional().default(''),
  req: z.string().max(6000).optional().default(''),
  recipientName: z.string().max(120).optional().default(''),
  recipientTitle: z.string().max(160).optional().default(''),
  jobId: z.string().uuid().optional(),
});

// Writes the three scripts. Nothing is sent: the person copies one and logs it.
export const POST = route(async (req: Request) => {
  const body = Body.parse(await readJson(req, 64 * 1024));
  let { role, req: reqText } = body;
  if (body.jobId) {
    const job = await prisma.job.findUnique({ where: { id: body.jobId }, select: { title: true, url: true, description: true } });
    if (!job) throw new HttpError(404, 'Job not found.');
    role ||= job.title;
    reqText ||= `${job.url}\n${(job.description || '').slice(0, 2500)}`;
  }
  const profile = await requireProfile();
  const settings = await loadSettings();
  const out = await writeClean<Record<string, string>>(llmConfig(settings), outreachMessages({
    company: body.company, role, req: reqText, recipientName: body.recipientName, recipientTitle: body.recipientTitle,
    profileText: profileToText(profile),
  }), { maxTokens: 1000, temperature: 0.6, extra: extraBanned(settings) });
  const scripts = (Object.keys(OUTREACH_KINDS) as OutreachKind[]).map((kind) => {
    const message = String(out.data?.[kind] ?? '').trim().slice(0, 1500);
    return { kind, label: OUTREACH_KINDS[kind].label, message, words: wordCount(message), slop: scanSlop(message).score };
  }).filter((s) => s.message);
  if (!scripts.length) throw new HttpError(502, 'The model returned no messages. Try again.');
  return ok({ scripts, model: out.model });
});
