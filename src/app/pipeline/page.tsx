import { prisma } from '@/lib/db';
import { PageHeader } from '@/components/kit';
import { KanbanBoard, type KanbanJob } from '@/components/kanban-board';
import { ScanButton } from '@/components/scan-button';
import { ApprovalsStrip } from '@/components/approvals-strip';
import { isStalePrep } from '@/lib/apply';

export const dynamic = 'force-dynamic';

export default async function PipelinePage() {
  const fresh = new Date(Date.now() - 14 * 864e5);
  const select = {
    id: true, title: true, company: true, location: true, status: true, grillScore: true, appliedAt: true, updatedAt: true, notes: true,
    _count: { select: { outreach: true, emails: true, resumes: true } },
    application: { select: { status: true, updatedAt: true } },
  } as const;
  const [tracked, scouted] = await Promise.all([
    prisma.job.findMany({ where: { status: { in: ['SAVED', 'APPLIED', 'INTERVIEW', 'OFFER', 'REJECTED'] } }, orderBy: { updatedAt: 'desc' }, take: 300, select }),
    // New jobs from the scanner: the best 60 of the last two weeks.
    prisma.job.findMany({
      where: { status: 'NEW', OR: [{ postedAt: { gte: fresh } }, { postedAt: null, firstSeenAt: { gte: fresh } }] },
      orderBy: [{ grillScore: { sort: 'desc', nulls: 'last' } }, { firstSeenAt: 'desc' }], take: 60, select,
    }),
  ]);
  const jobs: KanbanJob[] = [...tracked, ...scouted].map((j) => ({
    id: j.id, title: j.title, company: j.company, location: j.location, status: j.status, grillScore: j.grillScore,
    appliedAt: j.appliedAt?.toISOString() ?? null, updatedAt: j.updatedAt.toISOString(), notes: j.notes,
    touches: j._count.outreach + j._count.emails, resumes: j._count.resumes,
    application: j.application ? (isStalePrep(j.application) ? 'FAILED' : j.application.status) : null,
  }));
  const waiting = jobs.filter((j) => j.application === 'PENDING' || j.application === 'APPROVED');
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Pipeline" sub="Drag a card, or use Move to, as a job moves forward." action={<ScanButton />} />
      <ApprovalsStrip waiting={waiting.map((j) => ({ id: j.id, title: j.title, company: j.company, status: j.application as 'PENDING' | 'APPROVED', grillScore: j.grillScore }))} />
      <KanbanBoard initial={jobs} />
    </div>
  );
}
