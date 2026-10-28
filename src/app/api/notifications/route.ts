import { z } from 'zod';
import { prisma } from '@/lib/db';
import { ok, readJson, route } from '@/lib/http';

export const dynamic = 'force-dynamic';

export const GET = route(async () => {
  const notifications = await prisma.notification.findMany({ orderBy: { createdAt: 'desc' }, take: 60 });
  return ok({ notifications, unread: notifications.filter((n) => !n.readAt).length });
});

const Body = z.object({ ids: z.array(z.string().uuid()).max(100).optional() });

// Marks the given notifications read, or all of them.
export const POST = route(async (req: Request) => {
  const { ids } = Body.parse(await readJson(req));
  await prisma.notification.updateMany({ where: { readAt: null, ...(ids ? { id: { in: ids } } : {}) }, data: { readAt: new Date() } });
  return ok({ ok: true });
});
