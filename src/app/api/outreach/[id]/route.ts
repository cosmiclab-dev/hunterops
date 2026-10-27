import { z } from 'zod';
import { prisma } from '@/lib/db';
import { HttpError, ok, readJson, route } from '@/lib/http';

export const dynamic = 'force-dynamic';

const DAY = 86_400_000;
const Patch = z.object({
  status: z.enum(['drafted', 'sent', 'replied']).optional(),
  followUpAt: z.string().datetime().nullable().optional(),
  message: z.string().trim().min(1).max(5000).optional(),
});

type Ctx = { params: { id: string } };

function checkId(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(404, 'Not found.');
}

export const PATCH = route(async (req: Request, { params }: Ctx) => {
  checkId(params.id);
  const b = Patch.parse(await readJson(req));
  const cur = await prisma.outreach.findUnique({ where: { id: params.id } });
  if (!cur) throw new HttpError(404, 'Not found.');
  const data: Record<string, unknown> = {};
  if (b.message) data.message = b.message;
  if (b.status) {
    data.status = b.status;
    if (b.status === 'sent' && !cur.sentAt) {
      data.sentAt = new Date();
      data.followUpAt = new Date(Date.now() + 5 * DAY);
    }
    if (b.status === 'replied') data.followUpAt = null;
  }
  if (b.followUpAt !== undefined) data.followUpAt = b.followUpAt ? new Date(b.followUpAt) : null;
  const item = await prisma.outreach.update({ where: { id: params.id }, data });
  return ok({ item });
});

export const DELETE = route(async (_req: Request, { params }: Ctx) => {
  checkId(params.id);
  await prisma.outreach.delete({ where: { id: params.id } }).catch(() => { throw new HttpError(404, 'Not found.'); });
  return ok({ ok: true });
});
