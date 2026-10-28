// Tailors the profile to one job, runs Anti-Slop on the text and the Designer
// audit on the rendered layout, and saves the result as a Resume.
import type { Job, Prisma } from '@prisma/client';
import { prisma } from './db';
import { HttpError } from './http';
import type { LlmConfig } from './llm/client';
import { auditResume } from './modules/designer';
import { textOf } from './modules/anti-slop';
import type { GrillResult } from './modules/grill';
import { normalizeResume, type ProfileInput } from './profile';
import { tailorResumeMessages } from './prompts';
import { renderPdf } from './resume-render';
import { writeClean } from './writer';

export async function tailorResume(cfg: LlmConfig, job: Job, profile: ProfileInput, opts: { density: 'standard' | 'compact'; extra?: string[] }) {
  if (!job.description || job.description.length < 100) throw new HttpError(400, 'This job has no description to tailor against. Add one first.');
  const missing = ((job.grillBreakdown as unknown as GrillResult | null)?.skills.missing ?? []).slice(0, 15);
  const { experience, education, certifications, achievements, skills, summary, name, headline, email, phone, location, linkedin, portfolio } = profile;
  const out = await writeClean(cfg, tailorResumeMessages({
    profileJson: JSON.stringify({ name, headline, email, phone, location, linkedin, portfolio, summary, skills, experience, education, certifications, achievements }),
    jd: job.description.slice(0, 12000),
    title: job.title,
    company: job.company,
    missing,
  }), {
    maxTokens: 6000, temperature: 0.3, extra: opts.extra,
    check: (d: any) => ({ ...d, notes_for_candidate: undefined }),
  });
  const data = normalizeResume(out.data);
  // Contact details always come from the profile, never from the model.
  Object.assign(data, { name, email, phone, location, linkedin, portfolio });
  const { stats } = await renderPdf(data, opts.density);
  const issues = auditResume(stats, { yearsExperience: profile.yearsExperience });
  const resume = await prisma.resume.create({
    data: {
      name: `${data.name || 'Resume'} - ${job.company} ${job.title}`.slice(0, 200),
      jobId: job.id,
      density: opts.density,
      data: data as unknown as Prisma.InputJsonValue,
      slopScore: out.slop.score,
    },
  });
  const notes = Array.isArray(out.data?.notes_for_candidate) ? textOf(out.data.notes_for_candidate).split('\n').filter(Boolean).slice(0, 10) : [];
  return { resume, data, slop: out.slop, issues, pages: stats.pages, notes, model: out.model };
}

