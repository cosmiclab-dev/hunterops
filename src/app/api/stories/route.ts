import { prisma } from '@/lib/db';
import { ok, readJson, route } from '@/lib/http';
import { StoryFields } from '@/lib/career-ops/stories';

export const dynamic = 'force-dynamic';

export const GET = route(async () => ok({ stories: await prisma.story.findMany({ orderBy: [{ verified: 'desc' }, { createdAt: 'desc' }], take: 200 }) }));

// A story the person writes by hand counts as checked by them.
export const POST = route(async (req: Request) => {
  const b = StoryFields.parse(await readJson(req));
  const story = await prisma.story.upsert({ where: { title: b.title }, create: { ...b, source: 'Written by you', verified: true }, update: { ...b, verified: true } });
  return ok({ story }, 201);
});
