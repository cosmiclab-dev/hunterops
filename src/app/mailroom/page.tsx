import { prisma } from '@/lib/db';
import { PageHeader } from '@/components/kit';
import { Mailroom } from '@/components/mailroom';
import type { LogItem } from '@/components/outreach-workspace';

const MAILROOM_TABS = ['email', 'linkedin', 'gap', 'log', 'plain'];

export const dynamic = 'force-dynamic';

export default async function MailroomPage({ searchParams }: { searchParams: { tab?: string; jobId?: string } }) {
  const jobId = searchParams.jobId && /^[0-9a-f-]{36}$/i.test(searchParams.jobId) ? searchParams.jobId : null;
  const [emails, jobs, items, job] = await Promise.all([
    prisma.email.findMany({ orderBy: { createdAt: 'desc' }, take: 100, include: { job: { select: { id: true, title: true, company: true } } } }),
    prisma.job.findMany({ where: { status: { in: ['SAVED', 'APPLIED', 'INTERVIEW', 'OFFER'] } }, orderBy: { updatedAt: 'desc' }, take: 100, select: { id: true, title: true, company: true } }),
    prisma.outreach.findMany({ orderBy: { createdAt: 'desc' }, take: 200, include: { job: { select: { id: true, title: true } } } }),
    jobId ? prisma.job.findUnique({ where: { id: jobId }, select: { id: true, title: true, company: true } }) : null,
  ]);
  const log: LogItem[] = items.map((i) => ({
    id: i.id, company: i.company, recipientName: i.recipientName, recipientRole: i.recipientRole, channel: i.channel, kind: i.kind,
    message: i.message, status: i.status, sentAt: i.sentAt?.toISOString() ?? null, followUpAt: i.followUpAt?.toISOString() ?? null,
    createdAt: i.createdAt.toISOString(), job: i.job,
  }));
  const tab = MAILROOM_TABS.includes(searchParams.tab || '') ? searchParams.tab! : jobId ? 'linkedin' : 'email';
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Mailroom" sub="Recruiter emails (AIDA or PAS) that you approve before they send, LinkedIn and referral messages, gap answers, follow-ups, and a plain-English editor." />
      <Mailroom
        initialTab={tab}
        job={job}
        jobs={jobs}
        log={log}
        emails={emails.map((e) => ({
          id: e.id, toEmail: e.toEmail, subject: e.subject, body: e.body, status: e.status, kind: e.kind, framework: e.framework,
          error: e.error, sentAt: e.sentAt?.toISOString() ?? null, createdAt: e.createdAt.toISOString(), job: e.job,
        }))}
      />
    </div>
  );
}
