import { prisma } from '@/lib/db';
import { HttpError, ok, readJson, route } from '@/lib/http';
import { StoryFields } from '@/lib/career-ops/stories';

export const dynamic = 'force-dynamic';

export const GET = route(async () => ok({ stories: await prisma.story.findMany({ orderBy: [{ verified: 'desc' }, { createdAt: 'desc' }], take: 200 }) }));

// A story the person writes by hand counts as checked by them.
export const POST = route(async (req: Request) => {
  const b = StoryFields.parse(await readJson(req));
  if (await prisma.story.findUnique({ where: { title: b.title }, select: { id: true } })) throw new HttpError(409, 'A story with this title is already in the bank. Give it a different title.');
  const story = await prisma.story.create({ data: { ...b, source: 'Written by you', verified: true } });
  return ok({ story }, 201);
});
