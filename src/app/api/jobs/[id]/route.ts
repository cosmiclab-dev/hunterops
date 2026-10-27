import { z } from 'zod';
import { prisma } from '@/lib/db';
import { HttpError, ok, readJson, route } from '@/lib/http';

export const dynamic = 'force-dynamic';

const Patch = z.object({
  status: z.enum(['NEW', 'SAVED', 'APPLIED', 'INTERVIEW', 'OFFER', 'REJECTED', 'DISMISSED']).optional(),
  notes: z.string().max(4000).nullable().optional(),
});

type Ctx = { params: { id: string } };

export const GET = route(async (_req: Request, { params }: Ctx) => {
  const job = await prisma.job.findUnique({ where: { id: params.id } });
  if (!job) throw new HttpError(404, 'Job not found.');
  return ok({ job });
});

export const PATCH = route(async (req: Request, { params }: Ctx) => {
  const body = Patch.parse(await readJson(req));
  const current = await prisma.job.findUnique({ where: { id: params.id } });
  if (!current) throw new HttpError(404, 'Job not found.');
  const job = await prisma.job.update({
    where: { id: params.id },
    data: {
      ...body,
      // The person marks a job applied after they submit it themselves.
      appliedAt: body.status === 'APPLIED' && !current.appliedAt ? new Date() : undefined,
    },
  });
  return ok({ job });
});

export const DELETE = route(async (_req: Request, { params }: Ctx) => {
  await prisma.job.delete({ where: { id: params.id } }).catch(() => {
    throw new HttpError(404, 'Job not found.');
  });
  return ok({ ok: true });
});
