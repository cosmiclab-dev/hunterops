import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { HttpError, ok, readJson, route } from '@/lib/http';
import { isStalePrep, type Answer } from '@/lib/apply';

export const dynamic = 'force-dynamic';

type Ctx = { params: { jobId: string } };

async function load(jobId: string) {
  const a = await prisma.application.findUnique({ where: { jobId } });
  if (!a) throw new HttpError(404, 'No application for this job yet.');
  return a;
}

export const GET = route(async (_req: Request, { params }: Ctx) => {
  const a = await prisma.application.findUnique({ where: { jobId: params.jobId } });
  if (!a) return ok({ application: null });
  const resume = a.resumeId ? await prisma.resume.findUnique({ where: { id: a.resumeId }, select: { id: true, name: true, density: true } }) : null;
  const status = isStalePrep(a) ? 'FAILED' : a.status;
  return ok({ application: { ...a, status, error: status === 'FAILED' && !a.error ? 'Preparing stopped before it finished. Try again.' : a.error, resume } });
});

const Patch = z.object({
  answers: z.array(z.object({ key: z.string().max(200), value: z.string().max(6000) })).max(80).optional(),
  coverLetter: z.string().max(8000).optional(),
});

// Edits during review. An approved application goes back to review when it changes.
export const PATCH = route(async (req: Request, { params }: Ctx) => {
  const patch = Patch.parse(await readJson(req));
  const a = await load(params.jobId);
  if (a.status === 'SUBMITTED') throw new HttpError(409, 'This application was already submitted.');
  if (a.status === 'PREPARING') throw new HttpError(409, 'Wait until it is prepared.');
  const answers = ((a.answers as unknown as Answer[] | null) || []).map((x) => {
    const edit = patch.answers?.find((e) => e.key === x.key);
    return edit && edit.value !== x.value ? { ...x, value: edit.value, source: 'you' as const } : x;
  });
  const updated = await prisma.application.update({
    where: { jobId: params.jobId },
    data: {
      answers: answers as unknown as Prisma.InputJsonValue,
      ...(patch.coverLetter !== undefined ? { coverLetter: patch.coverLetter } : {}),
      status: 'PENDING',
      approvedAt: null,
    },
  });
  return ok({ application: updated });
});

export const DELETE = route(async (_req: Request, { params }: Ctx) => {
  const a = await load(params.jobId);
  if (a.status === 'SUBMITTED') throw new HttpError(409, 'Submitted applications stay on record.');
  await prisma.application.delete({ where: { jobId: params.jobId } });
  return ok({ ok: true });
});
