import { z } from 'zod';
import { prisma } from '@/lib/db';
import { HttpError, ok, readJson, route } from '@/lib/http';
import { ATS_FETCHERS, parseCareersUrl } from '@/lib/scan/sources';
import { seedCompanies } from '@/lib/scan/scanner';

export const dynamic = 'force-dynamic';

export const GET = route(async () => {
  if ((await prisma.company.count()) === 0) await seedCompanies();
  const companies = await prisma.company.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }] });
  return ok({ companies });
});

const Add = z.object({
  url: z.string().max(1000).optional(),
  name: z.string().max(200).optional(),
  atsType: z.string().max(40).optional(),
  atsSlug: z.string().max(300).optional(),
});

// Add a board from its careers URL (or name + ATS + slug).
export const POST = route(async (req: Request) => {
  const body = Add.parse(await readJson(req));
  const parsed = body.url ? parseCareersUrl(body.url) : null;
  const atsType = parsed?.ats_type ?? body.atsType;
  const atsSlug = parsed?.ats_slug ?? body.atsSlug;
  const name = body.name || parsed?.name;
  if (!atsType || !atsSlug || !name) {
    throw new HttpError(400, 'Paste a careers URL from Greenhouse, Lever, Ashby, SmartRecruiters, Workday, Recruitee or Workable.');
  }
  if (!ATS_FETCHERS[atsType]) throw new HttpError(400, `Unsupported ATS "${atsType}".`);
  const company = await prisma.company.upsert({
    where: { atsType_atsSlug: { atsType, atsSlug } },
    create: { name, atsType, atsSlug },
    update: { active: true },
  });
  return ok({ company }, 201);
});
