import { prisma } from '@/lib/db';
import { HttpError, ok, readJson, route } from '@/lib/http';

export const dynamic = 'force-dynamic';

// The person's go-ahead. It submits nothing: it unlocks the step where they
// open the company's form, paste the answers and press Submit themselves.
export const POST = route(async (req: Request, { params }: { params: { jobId: string } }) => {
  const { approve } = await readJson<{ approve?: boolean }>(req);
  if (approve !== true) throw new HttpError(400, 'Approving needs your confirmation.');
  const done = await prisma.application.updateMany({ where: { jobId: params.jobId, status: 'PENDING' }, data: { status: 'APPROVED', approvedAt: new Date() } });
  if (!done.count) throw new HttpError(409, 'Only a prepared application waiting for approval can be approved.');
  return ok({ application: await prisma.application.findUnique({ where: { jobId: params.jobId } }) });
});
