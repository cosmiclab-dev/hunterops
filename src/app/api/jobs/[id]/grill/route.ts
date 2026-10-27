import { prisma } from '@/lib/db';
import { HttpError, ok, route } from '@/lib/http';
import { regrill } from '@/lib/regrill';

export const dynamic = 'force-dynamic';

export const POST = route(async (_req: Request, { params }: { params: { id: string } }) => {
  if (!(await prisma.job.findUnique({ where: { id: params.id }, select: { id: true } }))) throw new HttpError(404, 'Job not found.');
  const [r] = await regrill({ id: params.id });
  return ok({ grill: r.g });
});
