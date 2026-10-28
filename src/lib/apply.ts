// Applications the AI prepares for the person: the answer sheet for the real
// form, a tailored resume and a cover letter. Preparing never submits
// anything. The person approves it in the app, opens the company's own form,
// pastes the answers and presses Submit there; then it is marked Applied.
import type { Prisma } from '@prisma/client';
import { prisma } from './db';
import { HttpError } from './http';
import { buildAnswerSheet, STANDARD_FIELDS, type Answer } from './autofill';
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

export type { Answer };

// A preparation that has not finished in this long died with its function.
const STALE_PREP_MS = 6 * 60_000;

export const isStalePrep = (a: { status: string; updatedAt: Date }) => a.status === 'PREPARING' && Date.now() - a.updatedAt.getTime() > STALE_PREP_MS;

export async function prepareApplication(jobId: string, opts: { auto?: boolean } = {}) {
  const job = await prisma.job.findUnique({ where: { id: jobId }, include: { companyRef: true, application: true } });
  if (!job) throw new HttpError(404, 'Job not found.');
  if (job.application?.status === 'SUBMITTED') throw new HttpError(409, 'You already applied to this job.');
  if (job.application?.status === 'PREPARING' && !isStalePrep(job.application)) throw new HttpError(409, 'This application is already being prepared.');
  const profile = await loadProfile();
  if (!profile || profileIsEmpty(profile)) throw new HttpError(400, 'Fill in your Profile first: applications are written from it.');
  const settings = await loadSettings();
  const cfg = llmConfig(settings);
  const extra = extraBanned(settings);

  await prisma.application.upsert({
    where: { jobId },
    create: { jobId, status: 'PREPARING', auto: Boolean(opts.auto) },
    update: { status: 'PREPARING', error: null, approvedAt: null },
  });

  try {
    // The live form decides the questions. A job board listing (Adzuna and the
    // like) hides the employer's form, so the employer's own posting is found first.
    const notes: string[] = [];
    let formUrl = job.url;
    if (isAggregatorUrl(job.url)) {
      const original = await findOriginalPosting(job, settings);
      if (original) {
        formUrl = original.url;
        notes.push(`Found the employer's own posting${original.via === 'search' ? ' with a web search' : ' on their careers board'}: the answers follow its real form.`);
      } else {
        notes.push(`This job came from ${new URL(job.url).hostname.replace(/^www\./, '')}, which hides the employer's form from apps, so these are the standard application questions. Open the listing to reach the form.`);
      }
    }
    let page: Awaited<ReturnType<typeof loadJobPage>> | null = null;
    if (formUrl !== job.url || !isAggregatorUrl(job.url)) {
      try {
        page = await loadJobPage(formUrl, formUrl === job.url ? job.companyRef : null);
      } catch { /* keep going with what the job already has */ }
    }
    let description = job.description || '';
    if (page && page.description.length > description.length + 200) {
      description = page.description;
      await prisma.job.update({ where: { id: job.id }, data: { description: clip(description, 20000) } });
    }
    const role = job.title;
    const company = job.company;

    // The Career-Ops A-H evaluation runs alongside, unless a recent one exists.
    const recentEval = await prisma.report.findFirst({ where: { jobId, mode: 'evaluation', createdAt: { gte: new Date(Date.now() - 14 * 864e5) } }, select: { id: true } });
    const [sheet, resume, letter, evaluation] = await Promise.allSettled([
      buildAnswerSheet(cfg, { fields: page?.fields?.length ? page.fields : STANDARD_FIELDS, profile, company, role, jd: description, extra }),
      tailorResume(cfg, { ...job, description }, profile, { density: 'standard', extra }),
      generateEmail(settings, { kind: 'cover_letter', framework: 'aida', profile, company, role, jd: description }),
      recentEval ? Promise.resolve(null) : evaluateJob(jobId),
    ]);
    if (sheet.status === 'rejected') throw sheet.reason;

    if (!isAggregatorUrl(job.url) || formUrl !== job.url) {
      if (!page) notes.push('The posting could not be opened, so these are the standard application questions.');
      else if (!page.fields.length) notes.push('The form fields were not visible to the app, so these are the standard application questions.');
    }
    if (evaluation.status === 'rejected') notes.push(`Career-Ops evaluation not run: ${(evaluation.reason as Error).message}`);
    if (resume.status === 'rejected') notes.push(`Resume not made: ${(resume.reason as Error).message}`);
    if (letter.status === 'rejected') notes.push(`Cover letter not written: ${(letter.reason as Error).message}`);

    const coverLetter = letter.status === 'fulfilled' ? letter.value.body : null;
    const resumeId = resume.status === 'fulfilled' ? resume.value.resume.id : null;
    const answers = sheet.value.answers;
    // The cover letter question on the form gets the letter itself.
    if (coverLetter) for (const a of answers) if (/cover letter/i.test(a.label) && a.type !== 'file' && !a.value) Object.assign(a, { value: coverLetter, source: 'ai' });

    await prisma.artifact.upsert({
      where: { jobId: job.id },
      create: { jobId: job.id, autofill: sheet.value as unknown as Prisma.InputJsonValue, coverLetterText: coverLetter },
      update: { autofill: sheet.value as unknown as Prisma.InputJsonValue, ...(coverLetter ? { coverLetterText: coverLetter } : {}) },
    });
    return await prisma.application.update({
      where: { jobId },
      data: {
        status: 'PENDING',
        answers: answers as unknown as Prisma.InputJsonValue,
        resumeId,
        coverLetter,
        applyUrl: page?.applyUrl || formUrl,
        embedUrl: page?.embedUrl || null,
        notes: notes as unknown as Prisma.InputJsonValue,
        error: null,
        preparedAt: new Date(),
      },
    });
  } catch (err) {
    await prisma.application.update({ where: { jobId }, data: { status: 'FAILED', error: clip((err as Error).message || 'Preparing failed.', 500) } });
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

// Prepares a few top matches at once (the daily run and the Pipeline button).
export async function autoPrepare(limit?: number) {
  const settings = await loadSettings();
  const conf = autoSettings((k) => settings.get(k));
  const take = limit ?? conf.count;
  if (!take) return { prepared: [], failed: [], off: true };
  const jobs = await autoPrepareCandidates(take, conf.minScore);
  const results = await Promise.allSettled(jobs.map((j) => prepareApplication(j.id, { auto: true })));
  return {
    prepared: jobs.filter((_, i) => results[i].status === 'fulfilled').map((j) => ({ id: j.id, title: j.title, company: j.company })),
    failed: jobs.flatMap((j, i) => (results[i].status === 'rejected' ? [{ id: j.id, title: j.title, company: j.company, error: ((results[i] as PromiseRejectedResult).reason as Error).message }] : [])),
    off: false,
    minScore: conf.minScore,
  };
}
