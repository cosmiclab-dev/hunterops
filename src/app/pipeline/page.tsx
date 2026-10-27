import { prisma } from '@/lib/db';
import { PageHeader } from '@/components/kit';
import { KanbanBoard, type KanbanJob } from '@/components/kanban-board';

export const dynamic = 'force-dynamic';

export default async function PipelinePage() {
  const rows = await prisma.job.findMany({
    where: { status: { in: ['SAVED', 'APPLIED', 'INTERVIEW', 'OFFER', 'REJECTED'] } },
    orderBy: [{ updatedAt: 'desc' }],
    take: 300,
    select: {
      id: true, title: true, company: true, location: true, status: true, grillScore: true, appliedAt: true, updatedAt: true, notes: true,
      _count: { select: { outreach: true, emails: true, resumes: true } },
    },
  });
  const jobs: KanbanJob[] = rows.map((j) => ({
    id: j.id, title: j.title, company: j.company, location: j.location, status: j.status, grillScore: j.grillScore,
    appliedAt: j.appliedAt?.toISOString() ?? null, updatedAt: j.updatedAt.toISOString(), notes: j.notes,
    touches: j._count.outreach + j._count.emails, resumes: j._count.resumes,
  }));
  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="Tracker" title="Pipeline" sub="Every job you're working, by stage. Drag a card on desktop, or tap Move on your phone." />
      <KanbanBoard initial={jobs} />
    </div>
  );
}
