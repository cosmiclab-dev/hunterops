import { z } from 'zod';
import { prisma } from '@/lib/db';
import { HttpError, ok, readJson, route } from '@/lib/http';
import { EMAIL_RE } from '@/lib/mailer';
import { scanSlop } from '@/lib/modules/anti-slop';

export const dynamic = 'force-dynamic';

const Patch = z.object({
  subject: z.string().min(1).max(200).optional(),
  body: z.string().min(1).max(5000).optional(),
  toEmail: z.string().max(200).regex(EMAIL_RE, 'Enter a valid email address').optional(),
});

type Ctx = { params: { id: string } };

// Edits are allowed until the email is sent.
export const PATCH = route(async (req: Request, { params }: Ctx) => {
  const patch = Patch.parse(await readJson(req));
  const email = await prisma.email.findUnique({ where: { id: params.id } });
  if (!email) throw new HttpError(404, 'Email not found.');
  if (email.status === 'SENT') throw new HttpError(409, 'This email was already sent.');
  const next = { ...email, ...patch };
  const updated = await prisma.email.update({
    where: { id: params.id },
    data: { ...patch, status: 'DRAFT', approvedAt: null, slopScore: scanSlop(`${next.subject}\n${next.body}`).score },
  });
  return ok({ email: updated });
});

export const DELETE = route(async (_req: Request, { params }: Ctx) => {
  const email = await prisma.email.findUnique({ where: { id: params.id } });
  if (!email) throw new HttpError(404, 'Email not found.');
  if (email.status === 'SENT') throw new HttpError(409, 'Sent emails stay in the log.');
  await prisma.email.delete({ where: { id: params.id } });
  return ok({ ok: true });
});
