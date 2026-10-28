import { prisma } from '@/lib/db';
import { HttpError, ok, route } from '@/lib/http';

export const dynamic = 'force-dynamic';

// The person pressed Submit on the company's form: the job moves to Applied.
export const POST = route(async (_req: Request, { params }: { params: { jobId: string } }) => {
  const a = await prisma.application.findUnique({ where: { jobId: params.jobId } });
  if (!a) throw new HttpError(404, 'No application for this job yet.');
  if (a.status !== 'APPROVED' && a.status !== 'SUBMITTED') throw new HttpError(409, 'Approve the application first.');
  const now = new Date();
  const [application] = await prisma.$transaction([
    prisma.application.update({ where: { jobId: params.jobId }, data: { status: 'SUBMITTED', submittedAt: a.submittedAt ?? now } }),
    prisma.job.update({ where: { id: params.jobId }, data: { status: 'APPLIED', appliedAt: now } }),
  ]);
  return ok({ application });
});
