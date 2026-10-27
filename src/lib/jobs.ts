// Saving a job opened by URL (Browser, Discover, "Grill a URL") onto the board.
import type { Prisma } from '@prisma/client';
import { prisma } from './db';
import { classifyLocation, detectWorkMode } from './location';
import { grill, type GrillResult } from './modules/grill';
import { loadProfile, profileIsEmpty, toGrillProfile } from './profile';
import { clip } from './utils';
import type { JobPage } from './job-page';

export async function grillPage(page: Pick<JobPage, 'title' | 'location' | 'description' | 'remote' | 'salary'>): Promise<GrillResult | null> {
  const profile = await loadProfile();
  if (!profile || profileIsEmpty(profile)) return null;
  const workMode = page.remote ? 'REMOTE' : detectWorkMode(page.location, page.description);
  return grill(toGrillProfile(profile), { title: page.title, location: page.location, description: page.description, workMode, salary: page.salary });
}

// Creates the job (or refreshes its description if the URL is already on the board),
// grills it, and starts tracking the company's board when it is a known ATS.
export async function saveJobPage(page: JobPage, status: 'NEW' | 'SAVED' = 'SAVED') {
  const g = await grillPage(page);
  const workMode = page.remote ? 'REMOTE' : detectWorkMode(page.location, page.description);
  let companyId: string | null = null;
  if (page.ats) {
    const c = await prisma.company.upsert({
      where: { atsType_atsSlug: { atsType: page.ats.type, atsSlug: page.ats.slug } },
      create: { name: page.company, atsType: page.ats.type, atsSlug: page.ats.slug },
      update: {},
    });
    companyId = c.id;
  }
  const grillData = {
    grillScore: g?.score ?? null,
    grillBreakdown: g ? (g as unknown as Prisma.InputJsonValue) : undefined,
    grilledAt: g ? new Date() : null,
  };
  const existing = await prisma.job.findUnique({ where: { url: page.url } });
  if (existing) {
    const job = await prisma.job.update({
      where: { id: existing.id },
      data: {
        description: page.description ? clip(page.description, 20000) : existing.description,
        salary: existing.salary || page.salary,
        status: existing.status === 'NEW' || existing.status === 'DISMISSED' ? status : existing.status,
        ...grillData,
      },
    });
    return { job, grill: g, created: false };
  }
  const job = await prisma.job.create({
    data: {
      source: page.source,
      company: clip(page.company || 'Unknown', 200) as string,
      companyId,
      title: clip(page.title || 'Untitled role', 300) as string,
      location: clip(page.location, 300),
      locationClass: classifyLocation(page.location, workMode === 'REMOTE'),
      workMode,
      url: page.url,
      postedAt: page.postedAt ? new Date(page.postedAt) : null,
      description: clip(page.description, 20000),
      salary: clip(page.salary, 300),
      status,
      ...grillData,
    },
  });
  return { job, grill: g, created: true };
}
