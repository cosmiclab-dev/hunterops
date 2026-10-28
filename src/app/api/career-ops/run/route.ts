import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { HttpError, ok, readJson, route } from '@/lib/http';
import { chatJson, llmConfig } from '@/lib/llm/client';
import { loadProfile, profileIsEmpty, profileToText } from '@/lib/profile';
import { loadSettings } from '@/lib/settings';
import { searchConfig, webSearch, type WebResult } from '@/lib/websearch';
import { MODES, modeActions, normalizeModeOutput, type ModeCtx, type ModeId } from '@/lib/career-ops/modes';
import { MODE_META } from '@/lib/career-ops/shared';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const Body = z.object({
  mode: z.enum(Object.keys(MODE_META) as [ModeId, ...ModeId[]]),
  jobId: z.string().uuid().optional(),
  input: z.string().max(20000).default(''),
});

export const GET = route(async (req: Request) => {
  const url = new URL(req.url);
  const jobId = url.searchParams.get('jobId');
  const mode = url.searchParams.get('mode');
  if (jobId && !/^[0-9a-f-]{36}$/i.test(jobId)) throw new HttpError(400, 'Bad jobId.');
  const reports = await prisma.report.findMany({
    where: { jobId: jobId || null, mode: mode ? mode : { in: Object.keys(MODE_META) } },
    orderBy: { createdAt: 'desc' }, take: 30,
  });
  return ok({ reports });
});

// Runs one Career-Ops mode (interview prep, research, contacts, negotiation, …)
// and stores the result. Searches use the free web search; nothing is sent.
export const POST = route(async (req: Request) => {
  const body = Body.parse(await readJson(req));
  const meta = MODE_META[body.mode];
  const def = MODES[body.mode];
  const job = body.jobId ? await prisma.job.findUnique({ where: { id: body.jobId } }) : null;
  if (meta.scope === 'job' && !job) throw new HttpError(400, 'Pick a job first.');
  if (meta.input?.required && body.input.trim().length < 20) throw new HttpError(400, `Paste the ${meta.input.label.toLowerCase()} first.`);
  const profile = await loadProfile();
  if (profileIsEmpty(profile)) throw new HttpError(400, 'Set up your profile first: upload your CV on the Home page.');
  const settings = await loadSettings();
  const cfg = searchConfig(settings);
  const search = (q: string) => Promise.race([
    webSearch(cfg, q, 'w', 8),
    new Promise<WebResult[]>((resolve) => setTimeout(() => resolve([]), 15_000)),
  ]);
  const ctx: ModeCtx = {
    job, profileText: profileToText(profile!),
    expectedCtc: profile!.expectedSalaryLpa, currentCtc: profile!.currentCtcLpa, notice: profile!.noticePeriod || '',
    input: body.mode === 'titles' ? settings.get('feed_keywords') || '' : body.input,
    search,
  };
  const prepared = await def.prepare(ctx);
  const out = await chatJson(llmConfig(settings), [{ role: 'system', content: prepared.system }, { role: 'user', content: prepared.user }], { maxTokens: 8000, timeoutMs: 240_000, temperature: 0.3 });
  let result = normalizeModeOutput(out.data);
  result = { ...result, sections: [...(prepared.extraSections || []), ...result.sections], actions: await modeActions(body.mode, out.data) };
  if (def.finish) result = def.finish(result, ctx);
  const report = await prisma.report.create({
    data: {
      jobId: job?.id ?? null, mode: body.mode, model: out.model,
      title: job ? `${meta.label}: ${job.title} at ${job.company}` : meta.label,
      data: { ...result, input: body.input.slice(0, 20000) } as unknown as Prisma.InputJsonValue,
    },
  });
  return ok({ report });
});
