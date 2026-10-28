import { prisma } from '@/lib/db';
import { HttpError, ok, readJson, route } from '@/lib/http';
import { sendApproved } from '@/lib/mailer';
import { loadSettings } from '@/lib/settings';
import { clip } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const UNCONFIRMED = 'Gmail did not confirm this email. It may have gone out: check your Gmail Sent folder before writing it again.';

// No reply from Gmail after the message itself went over: it may have been delivered.
function maybeDelivered(err: unknown) {
  const e = err as { responseCode?: number; command?: string; code?: string };
  if (e.responseCode) return false; // Gmail answered with a refusal
  return e.command === 'DATA' || e.command === 'MESSAGE' || (e.code === 'ETIMEDOUT' && e.command !== 'CONN');
}

// The person's approval: the request must carry approve: true and the exact
// recipient, subject and body they saw, so a stale or edited draft is never sent.
export const POST = route(async (req: Request, { params }: { params: { id: string } }) => {
  const { approve, subject, body, toEmail } = await readJson<{ approve?: boolean; subject?: string; body?: string; toEmail?: string }>(req);
  if (approve !== true) throw new HttpError(400, 'Sending needs your approval.');
  const email = await prisma.email.findUnique({ where: { id: params.id } });
  if (!email) throw new HttpError(404, 'Email not found.');
  if (email.status === 'SENT') throw new HttpError(409, 'This email was already sent.');
  if (subject !== email.subject || body !== email.body || toEmail !== email.toEmail) throw new HttpError(409, 'The draft changed. Review it again before sending.');
  // Claim the exact text first so a double tap, or an edit from another tab, cannot send twice or send something else.
  const claimed = await prisma.email.updateMany({
    where: { id: email.id, status: { in: ['DRAFT', 'FAILED'] }, subject: email.subject, body: email.body, toEmail: email.toEmail },
    data: { status: 'APPROVED', approvedAt: new Date() },
  });
  if (!claimed.count) throw new HttpError(409, email.status === 'APPROVED' ? UNCONFIRMED : 'The draft changed. Review it again before sending.');
  let messageId: string;
  try {
    messageId = await sendApproved(await loadSettings(), email);
  } catch (err) {
    if (maybeDelivered(err)) {
      // Stays APPROVED: it cannot be sent again from the app, so it is never sent twice.
      await prisma.email.update({ where: { id: email.id }, data: { error: UNCONFIRMED } }).catch(() => {});
      throw new HttpError(502, UNCONFIRMED);
    }
    const message = err instanceof HttpError ? err.message : `Gmail refused the message: ${(err as Error).message}`;
    await prisma.email.update({ where: { id: email.id }, data: { status: 'FAILED', error: clip(message, 500) } });
    throw err instanceof HttpError ? err : new HttpError(502, message);
  }
  // Gmail accepted it: from here on it counts as sent, even if the log update fails.
  const data = { status: 'SENT' as const, sentAt: new Date(), messageId, error: null };
  try {
    return ok({ email: await prisma.email.update({ where: { id: email.id }, data }) });
  } catch (err) {
    console.error('[send] sent but not logged', err);
    return ok({ email: { ...email, ...data } });
  }
});
