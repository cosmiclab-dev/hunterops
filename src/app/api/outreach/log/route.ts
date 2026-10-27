import { z } from 'zod';
import { prisma } from '@/lib/db';
import { ok, readJson, route } from '@/lib/http';

export const dynamic = 'force-dynamic';

const DAY = 86_400_000;

const Body = z.object({
  company: z.string().trim().min(1).max(200),
  recipientRole: z.string().trim().min(1).max(160),
  recipientName: z.string().max(120).optional(),
  channel: z.enum(['linkedin_dm', 'email', 'referral', 'other']).default('linkedin_dm'),
  kind: z.string().max(40).default('custom'),
  message: z.string().trim().min(1).max(5000),
  status: z.enum(['drafted', 'sent']).default('drafted'),
  jobId: z.string().uuid().optional(),
});

// Saves a message to the outreach log. "sent" means the person sent it themselves.
export const POST = route(async (req: Request) => {
  const b = Body.parse(await readJson(req, 64 * 1024));
  const now = new Date();
  const item = await prisma.outreach.create({
    data: {
      ...b,
      recipientName: b.recipientName || null,
      jobId: b.jobId || null,
      sentAt: b.status === 'sent' ? now : null,
      followUpAt: b.status === 'sent' ? new Date(now.getTime() + 5 * DAY) : null,
    },
  });
  return ok({ item }, 201);
});
