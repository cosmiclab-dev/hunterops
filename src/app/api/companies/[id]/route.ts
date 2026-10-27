import { z } from 'zod';
import { prisma } from '@/lib/db';
import { HttpError, ok, readJson, route } from '@/lib/http';

export const dynamic = 'force-dynamic';
type Ctx = { params: { id: string } };

export const PATCH = route(async (req: Request, { params }: Ctx) => {
  const body = z.object({ active: z.boolean() }).parse(await readJson(req));
  const company = await prisma.company.update({ where: { id: params.id }, data: body }).catch(() => {
    throw new HttpError(404, 'Company not found.');
  });
  return ok({ company });
});

export const DELETE = route(async (_req: Request, { params }: Ctx) => {
  await prisma.company.delete({ where: { id: params.id } }).catch(() => {
    throw new HttpError(404, 'Company not found.');
  });
  return ok({ ok: true });
});
