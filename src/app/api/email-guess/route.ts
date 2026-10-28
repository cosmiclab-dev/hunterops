import { z } from 'zod';
import { prisma } from '@/lib/db';
import { ok, readJson, route } from '@/lib/http';
import { guessEmails } from '@/lib/email-guess';

export const dynamic = 'force-dynamic';

const Body = z.object({ name: z.string().trim().min(1).max(120), company: z.string().trim().max(120).default(''), domain: z.string().trim().max(120).optional(), jobId: z.string().uuid().optional() });

// Unverified address guesses for a recruiter; nothing is sent or probed.
export const POST = route(async (req: Request) => {
  const b = Body.parse(await readJson(req));
  const job = b.jobId ? await prisma.job.findUnique({ where: { id: b.jobId }, select: { company: true, url: true } }) : null;
  return ok(await guessEmails({ name: b.name, company: b.company || job?.company || '', domain: b.domain || undefined, urls: job ? [job.url] : [] }));
});
