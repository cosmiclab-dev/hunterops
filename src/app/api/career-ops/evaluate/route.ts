import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { HttpError, ok, readJson, route } from '@/lib/http';
import { llmConfig } from '@/lib/llm/client';
import { grillPage } from '@/lib/jobs';
import { loadProfile, profileIsEmpty, profileToText } from '@/lib/profile';
import { loadSettings } from '@/lib/settings';
import { webSearch, searchConfig } from '@/lib/websearch';
import { runEvaluation } from '@/lib/career-ops/evaluate';
import { checkLiveness, findReposts, legitimacySignals } from '@/lib/career-ops/signals';

export const dynamic = 'force-dynamic';
// One long reasoning call; thinking models can take a few minutes.
export const maxDuration = 300;

const Body = z.object({ jobId: z.string().uuid() });

const withTimeout = <T,>(p: Promise<T>, ms: number, fallback: T) =>
  Promise.race([p.catch(() => fallback), new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);

export const GET = route(async (req: Request) => {
  const jobId = new URL(req.url).searchParams.get('jobId');
  if (!jobId || !/^[0-9a-f-]{36}$/i.test(jobId)) throw new HttpError(400, 'jobId is required.');
  const report = await prisma.report.findFirst({ where: { jobId, mode: 'evaluation' }, orderBy: { createdAt: 'desc' } });
  return ok({ report });
});

// Career-Ops A-H evaluation of one saved job: re-checks the posting is open,
// looks for reposts, runs two free web searches, then one AI evaluation.
// STAR+R stories go into the story bank. Nothing is sent or applied.
export const POST = route(async (req: Request) => {
  const { jobId } = Body.parse(await readJson(req));
  const job = await prisma.job.findUnique({ where: { id: jobId }, include: { companyRef: true } });
  if (!job) throw new HttpError(404, 'Job not found.');
  const profile = await loadProfile();
  if (profileIsEmpty(profile)) throw new HttpError(400, 'Set up your profile first: upload your CV on the Home page.');
  const settings = await loadSettings();

  const year = new Date().getFullYear();
  const queries = [`"${job.company}" layoffs OR "hiring freeze" ${year}`, `"${job.company}" ${job.title} salary India LPA`];
  const [liveness, repost, research, stories] = await Promise.all([
    checkLiveness(job.url, job.companyRef),
    findReposts(job),
    Promise.all(queries.map(async (query) => ({ query, results: await withTimeout(webSearch(searchConfig(settings), query, 'w', 8), 15_000, []) }))),
    prisma.story.findMany({ select: { title: true }, orderBy: { createdAt: 'desc' }, take: 60 }),
  ]);
  const description = (liveness.description && liveness.description.length > (job.description?.length ?? 0) / 2 ? liveness.description : job.description) || '';
  if (description.length < 200) throw new HttpError(422, 'This job has almost no description, so there is nothing to evaluate. Open it in the Browser first so HunterOps can read the posting.');
  const signals = legitimacySignals({ liveness, repost, postedAt: job.postedAt, firstSeenAt: job.firstSeenAt, salary: job.salary, description });
  const grill = await grillPage({ title: job.title, location: job.location, description, remote: job.workMode === 'REMOTE', salary: job.salary });
  const targets = (settings.get('feed_keywords') || '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 8);

  const { evaluation, model } = await runEvaluation(llmConfig(settings), {
    profileText: profileToText(profile!),
    targets: profile!.targetRoles.length ? profile!.targetRoles : [profile!.headline, ...targets].filter(Boolean),
    job: { title: job.title, company: job.company, location: job.location, salary: job.salary, url: job.url, description },
    grill, signals, research, storyTitles: stories.map((s) => s.title),
  });

  const data = { ...evaluation, signals, liveness: { state: liveness.state, reason: liveness.reason, checkedAt: liveness.checkedAt }, repost, research: research.map((r) => ({ query: r.query, count: r.results.length })) };
  const report = await prisma.report.create({
    data: { jobId: job.id, mode: 'evaluation', title: `${job.title} at ${job.company}`, score: evaluation.score, model, data: data as unknown as Prisma.InputJsonValue },
  });
  const known = new Set(stories.map((s) => s.title.toLowerCase()));
  const fresh = evaluation.interview.stories.filter((s) => !known.has(s.title.toLowerCase()));
  if (fresh.length) {
    await prisma.story.createMany({
      data: fresh.map((s) => ({ jobId: job.id, theme: s.theme, title: s.title, situation: s.situation, task: s.task, action: s.action, result: s.result, reflection: s.reflection, bestFor: s.bestFor, source: `Evaluation: ${job.title} at ${job.company}` })),
      skipDuplicates: true,
    });
  }
  if (liveness.state === 'closed' && job.status !== 'APPLIED') await prisma.job.update({ where: { id: job.id }, data: { notes: [job.notes, `Posting looked closed on ${liveness.checkedAt.slice(0, 10)}: ${liveness.reason}`].filter(Boolean).join('\n') } });
  return ok({ report, storiesAdded: fresh.length });
});
