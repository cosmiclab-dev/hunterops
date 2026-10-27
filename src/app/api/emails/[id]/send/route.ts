import { prisma } from '@/lib/db';
import { HttpError, ok, readJson, route } from '@/lib/http';
import { sendApproved } from '@/lib/mailer';
import { loadSettings } from '@/lib/settings';
import { clip } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// The person's approval: the request must carry approve: true and the exact
// subject and body they saw, so a stale or edited draft is never sent.
export const POST = route(async (req: Request, { params }: { params: { id: string } }) => {
  const { approve, subject, body } = await readJson<{ approve?: boolean; subject?: string; body?: string }>(req);
  if (approve !== true) throw new HttpError(400, 'Sending needs your approval.');
  const email = await prisma.email.findUnique({ where: { id: params.id } });
  if (!email) throw new HttpError(404, 'Email not found.');
  if (email.status === 'SENT') throw new HttpError(409, 'This email was already sent.');
  if (subject !== email.subject || body !== email.body) throw new HttpError(409, 'The draft changed. Review it again before sending.');
  // Claim the draft first so a double tap cannot send it twice.
  const claimed = await prisma.email.updateMany({
    where: { id: email.id, status: { in: ['DRAFT', 'FAILED'] } },
    data: { status: 'APPROVED', approvedAt: new Date() },
  });
  if (!claimed.count) throw new HttpError(409, 'This email is already being sent.');
  try {
    const messageId = await sendApproved(await loadSettings(), email);
    const sent = await prisma.email.update({ where: { id: email.id }, data: { status: 'SENT', sentAt: new Date(), messageId, error: null } });
    return ok({ email: sent });
  } catch (err) {
    const message = err instanceof HttpError ? err.message : `Gmail refused the message: ${(err as Error).message}`;
    await prisma.email.update({ where: { id: email.id }, data: { status: 'FAILED', error: clip(message, 500) } });
    throw err instanceof HttpError ? err : new HttpError(502, message);
  }
});
