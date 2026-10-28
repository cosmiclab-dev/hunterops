import { prisma } from '@/lib/db';
import { HttpError, ok, readJson, route } from '@/lib/http';
import { StoryFields } from '@/lib/career-ops/stories';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

function checkId(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(404, 'Not found.');
}

export const PATCH = route(async (req: Request, { params }: Ctx) => {
  checkId(params.id);
  const raw = await readJson<Record<string, unknown>>(req);
  const b = StoryFields.partial().parse(raw);
  const verified = typeof raw.verified === 'boolean' ? raw.verified : undefined;
  const story = await prisma.story.update({ where: { id: params.id }, data: { ...b, ...(verified === undefined ? {} : { verified }) } }).catch(() => {
    throw new HttpError(404, 'Story not found.');
  });
  return ok({ story });
});

export const DELETE = route(async (_req: Request, { params }: Ctx) => {
  checkId(params.id);
  await prisma.story.delete({ where: { id: params.id } }).catch(() => {
    throw new HttpError(404, 'Story not found.');
  });
  return ok({ ok: true });
});
