import { prisma } from '@/lib/db';
import { PageHeader } from '@/components/kit';
import { OutreachWorkspace, type LogItem } from '@/components/outreach-workspace';

export const dynamic = 'force-dynamic';

export default async function OutreachPage({ searchParams }: { searchParams: { tab?: string; jobId?: string } }) {
  const [items, job] = await Promise.all([
    prisma.outreach.findMany({ orderBy: { createdAt: 'desc' }, take: 200, include: { job: { select: { id: true, title: true } } } }),
    searchParams.jobId && /^[0-9a-f-]{36}$/i.test(searchParams.jobId)
      ? prisma.job.findUnique({ where: { id: searchParams.jobId }, select: { id: true, title: true, company: true } })
      : null,
  ]);
  const log: LogItem[] = items.map((i) => ({
    id: i.id, company: i.company, recipientName: i.recipientName, recipientRole: i.recipientRole, channel: i.channel, kind: i.kind,
    message: i.message, status: i.status, sentAt: i.sentAt?.toISOString() ?? null, followUpAt: i.followUpAt?.toISOString() ?? null,
    createdAt: i.createdAt.toISOString(), job: i.job,
  }));
  const tab = ['write', 'gap', 'log'].includes(searchParams.tab || '') ? searchParams.tab! : 'write';
  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="Outreach machine" title="Outreach" sub="Short messages that get replies, gap answers that close the question, and a log so nobody falls through." />
      <OutreachWorkspace initialTab={tab} log={log} job={job} />
    </div>
  );
}
