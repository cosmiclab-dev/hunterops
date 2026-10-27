import { z } from 'zod';
import { prisma } from '@/lib/db';
import { HttpError, ok, readJson, route } from '@/lib/http';
import { classifyLocation, detectWorkMode } from '@/lib/location';
import { grill } from '@/lib/modules/grill';
import { loadProfile, toGrillProfile } from '@/lib/profile';
import type { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';

const AddJob = z.object({
  url: z.string().url().max(2000),
  title: z.string().min(1).max(300),
  company: z.string().min(1).max(200),
  location: z.string().max(300).optional().default(''),
  description: z.string().max(40000).optional().default(''),
});

// Add a job by hand (from LinkedIn, Naukri, a referral...). It is grilled at once.
export const POST = route(async (req: Request) => {
  const body = AddJob.parse(await readJson(req, 128 * 1024));
  if (await prisma.job.findUnique({ where: { url: body.url } })) throw new HttpError(409, 'That job is already on the board.');
  const workMode = detectWorkMode(body.location, body.description);
  const profile = await loadProfile();
  const g = profile ? grill(toGrillProfile(profile), { ...body, workMode }) : null;
  const job = await prisma.job.create({
    data: {
      ...body,
      source: 'manual',
      status: 'SAVED',
      workMode,
      locationClass: classifyLocation(body.location, workMode === 'REMOTE'),
      grillScore: g?.score ?? null,
      grillBreakdown: g ? (g as unknown as Prisma.InputJsonValue) : undefined,
      grilledAt: g ? new Date() : null,
    },
  });
  return ok({ job }, 201);
});
