// Applications the AI prepares for the person: the answer sheet for the real
// form, a tailored resume and a cover letter. Preparing never submits
// anything. The person approves it in the app, opens the company's own form,
// pastes the answers and presses Submit there; then it is marked Applied.
import type { Prisma } from '@prisma/client';
import { prisma } from './db';
import { HttpError } from './http';
import { buildAnswerSheet, SLOT, STANDARD_FIELDS, type Answer } from './autofill';
import { generateEmail } from './email-generator';
import { loadJobPage } from './job-page';
import { llmConfig } from './llm/client';
import { loadProfile, profileIsEmpty } from './profile';
import { loadSettings } from './settings';
import { tailorResume } from './tailor';
import { extraBanned } from './writer';
import { clip } from './utils';
import { findOriginalPosting, isAggregatorUrl } from './original-posting';
import { evaluateJob } from './career-ops/evaluate-job';
import { startTask, type Tracker } from './tasks';

export type { Answer };

// A preparation that has not finished in this long died with its function.
const STALE_PREP_MS = 6 * 60_000;

export const isStalePrep = (a: { status: string; updatedAt: Date }) => a.status === 'PREPARING' && Date.now() - a.updatedAt.getTime() > STALE_PREP_MS;

export const APPLY_STEPS = [
  { key: 'form', label: 'Finding the application form' },
  { key: 'posting', label: 'Reading the posting and its questions' },
  { key: 'answers', label: 'Answering the questions' },
  { key: 'resume', label: 'Tailoring your resume' },
  { key: 'letter', label: 'Writing the cover letter' },
  { key: 'evaluation', label: 'Career-Ops evaluation' },
];

// Checks the job can be prepared, marks it Preparing and opens its task, so
// the request can answer at once and the work carries on in the background.
export async function startApplication(jobId: string, opts: { auto?: boolean } = {}) {
  const job = await prisma.job.findUnique({ where: { id: jobId }, include: { application: true } });
  if (!job) throw new HttpError(404, 'Job not found.');
  if (job.application?.status === 'SUBMITTED') throw new HttpError(409, 'You already applied to this job.');
  if (job.application?.status === 'PREPARING' && !isStalePrep(job.application)) throw new HttpError(409, 'This application is already being prepared.');
  const profile = await loadProfile();
  if (!profile || profileIsEmpty(profile)) throw new HttpError(400, 'Fill in your Profile first: applications are written from it.');
  llmConfig(await loadSettings());
  const application = await prisma.application.upsert({
    where: { jobId },
    create: { jobId, status: 'PREPARING', auto: Boolean(opts.auto) },
    update: { status: 'PREPARING', error: null, approvedAt: null },
  });
  const task = await startTask({ kind: 'apply', title: `${job.company}: ${job.title}`, jobId, href: `/apply/${jobId}`, steps: APPLY_STEPS });
  return { application, task };
}

export async function prepareApplication(jobId: string, opts: { auto?: boolean } = {}) {
  const { task } = await startApplication(jobId, opts);
  return runApplication(jobId, task);
}

// Runs one step of the task: running, then done, failed or skipped.
async function tracked<T>(task: Tracker, key: string, work: () => Promise<T>, detail?: (v: T) => string | undefined): Promise<T> {
  await task.step(key, 'running');
  try {
    const v = await work();
    await task.step(key, v === null ? 'skipped' : 'done', detail?.(v));
    return v;
  } catch (err) {
    await task.step(key, 'failed', (err as Error).message);
    throw err;
  }
}

export async function runApplication(jobId: string, task: Tracker) {
  const job = await prisma.job.findUniqueOrThrow({ where: { id: jobId }, include: { companyRef: true } });
  const title = `${job.company}: ${job.title}`;
  try {
    const profile = (await loadProfile())!;
    const settings = await loadSettings();
    const cfg = llmConfig(settings);
    const extra = extraBanned(settings);

    // The live form decides the questions. A job board listing (Adzuna and the
    // like) hides the employer's form, so the employer's own posting is found first.
    const notes: string[] = [];
    let formUrl = job.url;
    const board = isAggregatorUrl(job.url);
    await tracked(task, 'form', async () => {
      if (!board) return 'own';
      const original = await findOriginalPosting(job, settings);
      if (original) {
        formUrl = original.url;
        notes.push(`Found the employer's own posting${original.via === 'search' ? ' with a web search' : ' on their careers board'}: the answers follow its real form.`);
        return new URL(original.url).hostname;
      }
      notes.push(`This job came from ${new URL(job.url).hostname.replace(/^www\./, '')}, which hides the employer's form from apps, and the same job at ${job.company} was not found on a company careers site. These are the standard application questions: open the listing to reach the form.`);
      return 'standard';
    }, (v) => (v === 'own' ? 'The company’s own posting' : v === 'standard' ? 'Not found: using the standard questions' : `Found on ${v}`));

    let page: Awaited<ReturnType<typeof loadJobPage>> | null = null;
    const description = await tracked(task, 'posting', async () => {
      if (formUrl !== job.url || !board) {
        try {
          page = await loadJobPage(formUrl, formUrl === job.url ? job.companyRef : null);
        } catch { /* keep going with what the job already has */ }
      }
      let text = job.description || '';
      // The employer's own posting beats a job board's snippet; on the same page, only a much fuller read counts.
      if (page && page.description.length > text.length + (formUrl !== job.url ? 0 : 200)) {
        text = page.description;
        await prisma.job.update({ where: { id: job.id }, data: { description: clip(text, 20000) } });
      }
      return text;
    }, (t) => `${Math.round(t.length / 100) / 10}k characters`);
    const loaded = page as Awaited<ReturnType<typeof loadJobPage>> | null;
    const role = job.title;
    const company = job.company;

    // The Career-Ops A-H evaluation runs alongside, unless a recent one exists.
    const recentEval = await prisma.report.findFirst({ where: { jobId, mode: 'evaluation', score: { not: null }, createdAt: { gte: new Date(Date.now() - 14 * 864e5) } }, select: { id: true } });
    const [sheet, resume, letter, evaluation] = await Promise.allSettled([
      tracked(task, 'answers', () => buildAnswerSheet(cfg, { fields: loaded?.fields?.length ? loaded.fields : STANDARD_FIELDS, profile, company, role, jd: description, extra }), (v) => `${v.answers.length} questions`),
      tracked(task, 'resume', () => tailorResume(cfg, { ...job, description }, profile, { density: 'standard', extra })),
      tracked(task, 'letter', () => generateEmail(settings, { kind: 'cover_letter', framework: 'aida', profile, company, role, jd: description })),
      tracked(task, 'evaluation', () => (recentEval ? Promise.resolve(null) : evaluateJob(jobId)), (v) => (v?.report.score ? `Scored ${v.report.score}/5` : undefined)),
    ]);
    if (sheet.status === 'rejected') throw sheet.reason;

    if (!board || formUrl !== job.url) {
      if (!loaded) notes.push('The posting could not be opened, so these are the standard application questions.');
      else if (!loaded.fields.length) notes.push('The form fields were not visible to the app, so these are the standard application questions.');
    }
    if (evaluation.status === 'rejected') notes.push(`Career-Ops evaluation not run: ${(evaluation.reason as Error).message}`);
    if (resume.status === 'rejected') notes.push(`Resume not made: ${(resume.reason as Error).message}`);
    if (letter.status === 'rejected') notes.push(`Cover letter not written: ${(letter.reason as Error).message}`);

    const coverLetter = letter.status === 'fulfilled' ? letter.value.body : null;
    if (coverLetter && SLOT.test(coverLetter)) notes.push('The cover letter has a part in [brackets] to fill in before you send it.');
    const toFill = sheet.status === 'fulfilled' ? sheet.value.answers.filter((a) => a.value && SLOT.test(a.value)).length : 0;
    if (toFill) notes.push(`${toFill} answer${toFill > 1 ? 's have' : ' has'} a part in [brackets] to fill in.`);
    const resumeId = resume.status === 'fulfilled' ? resume.value.resume.id : null;
    const answers = sheet.value.answers;
    // The cover letter question on the form gets the letter itself.
    if (coverLetter) for (const a of answers) if (/cover letter/i.test(a.label) && a.type !== 'file' && !a.value) Object.assign(a, { value: coverLetter, source: 'ai' });

    await prisma.artifact.upsert({
      where: { jobId: job.id },
      create: { jobId: job.id, autofill: sheet.value as unknown as Prisma.InputJsonValue, coverLetterText: coverLetter },
      update: { autofill: sheet.value as unknown as Prisma.InputJsonValue, ...(coverLetter ? { coverLetterText: coverLetter } : {}) },
    });
    const app = await prisma.application.update({
      where: { jobId },
      data: {
        status: 'PENDING',
        answers: answers as unknown as Prisma.InputJsonValue,
        resumeId,
        coverLetter,
        applyUrl: loaded?.applyUrl || formUrl,
        embedUrl: loaded?.embedUrl || null,
        notes: notes as unknown as Prisma.InputJsonValue,
        error: null,
        preparedAt: new Date(),
      },
    });
    const missing = [resumeId ? '' : 'resume', coverLetter ? '' : 'cover letter', evaluation.status === 'rejected' ? 'evaluation' : ''].filter(Boolean);
    await task.done({
      result: { status: 'PENDING', missing },
      note: { kind: 'ready', title: `Ready for your approval: ${title}`, body: missing.length ? `${answers.length} answers ready. Not made: ${missing.join(', ')} (tap to try again).` : `${answers.length} answers, a tailored resume and a cover letter are ready to review.` },
    });
    return app;
  } catch (err) {
    await prisma.application.update({ where: { jobId }, data: { status: 'FAILED', error: clip((err as Error).message || 'Preparing failed.', 500) } });
    await task.fail(err, { title: `Could not prepare: ${title}` });
    throw err;
  }
}

// The best new matches without an application yet, for the daily auto-prepare.
export async function autoPrepareCandidates(limit: number, minScore: number) {
  const since = new Date(Date.now() - 14 * 864e5);
  return prisma.job.findMany({
    where: {
      status: { in: ['NEW', 'SAVED'] },
      grillScore: { gte: minScore },
      application: null,
      firstSeenAt: { gte: since },
      description: { not: null },
    },
    orderBy: [{ grillScore: 'desc' }, { firstSeenAt: 'desc' }],
    take: limit,
    select: { id: true, title: true, company: true },
  });
}

export function autoSettings(get: (k: string) => string | null) {
  const n = Number(get('auto_apply_count'));
  const s = Number(get('auto_apply_min_score'));
  return {
    count: Number.isInteger(n) && n >= 0 && n <= 5 ? n : 3,
    minScore: Number.isInteger(s) && s >= 0 && s <= 100 ? s : 75,
  };
}

// Prepares a few top matches at once (the daily run and the Apply tab button).
// With background, it answers once they have started; each shows its progress
// and sends a notification when it is ready.
export async function autoPrepare(limit?: number, opts: { background?: (label: string, p: Promise<unknown>) => void } = {}) {
  const settings = await loadSettings();
  const conf = autoSettings((k) => settings.get(k));
  const take = limit ?? conf.count;
  if (!take) return { prepared: [], failed: [], started: [], off: true };
  const jobs = await autoPrepareCandidates(take, conf.minScore);
  if (opts.background) {
    const started = await Promise.allSettled(jobs.map((j) => startApplication(j.id, { auto: true })));
    for (const [i, r] of started.entries()) if (r.status === 'fulfilled') opts.background(`auto ${jobs[i].id}`, runApplication(jobs[i].id, r.value.task));
    return {
      prepared: [],
      started: jobs.filter((_, i) => started[i].status === 'fulfilled').map((j) => ({ id: j.id, title: j.title, company: j.company })),
      failed: jobs.flatMap((j, i) => (started[i].status === 'rejected' ? [{ id: j.id, title: j.title, company: j.company, error: ((started[i] as PromiseRejectedResult).reason as Error).message }] : [])),
      off: false,
      minScore: conf.minScore,
    };
  }
  const results = await Promise.allSettled(jobs.map((j) => prepareApplication(j.id, { auto: true })));
  return {
    prepared: jobs.filter((_, i) => results[i].status === 'fulfilled').map((j) => ({ id: j.id, title: j.title, company: j.company })),
    started: [],
    failed: jobs.flatMap((j, i) => (results[i].status === 'rejected' ? [{ id: j.id, title: j.title, company: j.company, error: ((results[i] as PromiseRejectedResult).reason as Error).message }] : [])),
    off: false,
    minScore: conf.minScore,
  };
}
