import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { HttpError, ok, readJson, route } from '@/lib/http';
import { llmConfig } from '@/lib/llm/client';
import { auditResume } from '@/lib/modules/designer';
import { textOf } from '@/lib/modules/anti-slop';
import type { GrillResult } from '@/lib/modules/grill';
import { normalizeResume, requireProfile } from '@/lib/profile';
import { tailorResumeMessages } from '@/lib/prompts';
import { renderPdf } from '@/lib/resume-render';
import { loadSettings } from '@/lib/settings';
import { writeClean } from '@/lib/writer';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const Body = z.object({ jobId: z.string().uuid(), density: z.enum(['standard', 'compact']).default('standard') });

// Tailors the profile to one job, runs Anti-Slop on the text and the Designer
// audit on the rendered layout, and saves the result as a Resume.
export const POST = route(async (req: Request) => {
  const { jobId, density } = Body.parse(await readJson(req));
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) throw new HttpError(404, 'Job not found.');
  if (!job.description || job.description.length < 100) throw new HttpError(400, 'This job has no description to tailor against. Add one first.');
  const profile = await requireProfile();
  const cfg = llmConfig(await loadSettings());
  const missing = ((job.grillBreakdown as unknown as GrillResult | null)?.skills.missing ?? []).slice(0, 15);
  const { experience, education, certifications, achievements, skills, summary, name, headline, email, phone, location, linkedin, portfolio } = profile;
  const out = await writeClean(cfg, tailorResumeMessages({
    profileJson: JSON.stringify({ name, headline, email, phone, location, linkedin, portfolio, summary, skills, experience, education, certifications, achievements }),
    jd: job.description.slice(0, 12000),
    title: job.title,
    company: job.company,
    missing,
  }), { maxTokens: 6000, temperature: 0.3 });
  const data = normalizeResume(out.data);
  // Contact details always come from the profile, never from the model.
  Object.assign(data, { name, email, phone, location, linkedin, portfolio });
  const { stats } = await renderPdf(data, density);
  const issues = auditResume(stats, { yearsExperience: profile.yearsExperience });
  const resume = await prisma.resume.create({
    data: {
      name: `${data.name || 'Resume'} - ${job.company} ${job.title}`.slice(0, 200),
      jobId: job.id,
      density,
      data: data as unknown as Prisma.InputJsonValue,
      slopScore: out.slop.score,
    },
  });
  const notes = Array.isArray(out.data?.notes_for_candidate) ? textOf(out.data.notes_for_candidate).split('\n').filter(Boolean).slice(0, 10) : [];
  return ok({ resume, data, slop: out.slop, issues, pages: stats.pages, notes, model: out.model });
});
