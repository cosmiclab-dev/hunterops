import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { PageHeader, Pill } from '@/components/kit';
import { ApplyView } from '@/components/apply-view';
import { GrillScoreBadge } from '@/components/grill-score-badge';
import type { Evaluation } from '@/lib/career-ops/evaluate';

export const dynamic = 'force-dynamic';

export default async function ApplyPage({ params }: { params: { jobId: string } }) {
  if (!/^[0-9a-f-]{36}$/i.test(params.jobId)) notFound();
  const job = await prisma.job.findUnique({ where: { id: params.jobId }, select: { title: true, company: true, url: true, grillScore: true, location: true } });
  if (!job) notFound();
  const report = await prisma.report.findFirst({ where: { jobId: params.jobId, mode: 'evaluation' }, orderBy: { createdAt: 'desc' }, select: { score: true, data: true } });
  const ev = report?.data as unknown as Evaluation | undefined;
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div className="flex items-start gap-3">
        <GrillScoreBadge score={job.grillScore} />
        <PageHeader className="min-w-0 flex-1" eyebrow="Apply" title={job.title} sub={[job.company, job.location].filter(Boolean).join(' · ')} />
      </div>
      <ApplyView jobId={params.jobId} job={job} />
      {ev?.verdict && (
        <section className="surface flex flex-col gap-3 p-4" data-testid="apply-evaluation">
          <div className="flex items-center justify-between gap-3">
            <p className="label-caps">Career-Ops evaluation</p>
            <Pill tone={ev.verdict.apply ? 'success' : 'warning'}>{ev.verdict.apply ? 'Worth applying' : 'Think twice'}</Pill>
          </div>
          <div className="flex items-baseline gap-3">
            <span className="text-[40px] font-semibold leading-none tabular-nums">{report?.score?.toFixed(1) ?? '–'}</span>
            <span className="text-sm text-muted-foreground">out of 5</span>
          </div>
          <p className="font-semibold leading-6">{ev.verdict.headline}</p>
          <p className="text-sm leading-6 text-muted-foreground">{ev.verdict.why}</p>
          {ev.match?.gaps?.length > 0 && (
            <ul className="flex flex-col gap-1.5 text-sm leading-6">
              {ev.match.gaps.slice(0, 3).map((g) => <li key={g.requirement}><span className="font-medium">{g.requirement}:</span> {g.mitigation}</li>)}
            </ul>
          )}
          <Link href={`/jobs/${params.jobId}`} className="text-sm font-semibold text-primary">Full report, interview stories and pay questions</Link>
        </section>
      )}
    </div>
  );
}
