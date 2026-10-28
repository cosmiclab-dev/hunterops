import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { PageHeader } from '@/components/kit';
import { ApplyView } from '@/components/apply-view';
import { GrillScoreBadge } from '@/components/grill-score-badge';

export const dynamic = 'force-dynamic';

export default async function ApplyPage({ params }: { params: { jobId: string } }) {
  if (!/^[0-9a-f-]{36}$/i.test(params.jobId)) notFound();
  const job = await prisma.job.findUnique({ where: { id: params.jobId }, select: { title: true, company: true, url: true, grillScore: true, location: true } });
  if (!job) notFound();
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div className="flex items-start gap-3">
        <GrillScoreBadge score={job.grillScore} />
        <PageHeader className="min-w-0 flex-1" eyebrow="Apply" title={job.title} sub={[job.company, job.location].filter(Boolean).join(' · ')} />
      </div>
      <ApplyView jobId={params.jobId} job={job} />
    </div>
  );
}
