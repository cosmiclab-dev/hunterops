import Link from 'next/link';
import { Globe } from 'lucide-react';
import { prisma } from '@/lib/db';
import { BrowserView } from '@/components/browser-view';
import { OpenLinkForm } from '@/components/open-link-form';
import { GrillScoreBadge } from '@/components/grill-score-badge';
import { PageHeader } from '@/components/kit';
import { timeAgo } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function BrowserPage({ searchParams }: { searchParams: { url?: string } }) {
  if (searchParams.url) return <BrowserView url={searchParams.url} />;
  const [best, recent] = await Promise.all([
    prisma.job.findMany({ where: { status: { in: ['NEW', 'SAVED'] }, grillScore: { not: null } }, orderBy: { grillScore: 'desc' }, take: 8 }),
    prisma.job.findMany({ where: { status: { not: 'DISMISSED' } }, orderBy: { updatedAt: 'desc' }, take: 8 }),
  ]);
  const List = ({ jobs }: { jobs: typeof best }) => (
    <div className="surface divide-y">
      {jobs.map((j) => (
        <Link key={j.id} href={`/browser/${j.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/50" data-testid="browser-job">
          <GrillScoreBadge score={j.grillScore} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{j.title}</p>
            <p className="truncate text-xs text-muted-foreground">{j.company}{j.location ? ` · ${j.location}` : ''}</p>
          </div>
          <span className="meta hidden sm:inline">{timeAgo(j.postedAt || j.firstSeenAt)}</span>
        </Link>
      ))}
      {!jobs.length && <p className="px-4 py-6 text-sm text-muted-foreground">Nothing here yet.</p>}
    </div>
  );
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8">
      <PageHeader title="Browser" sub="Open any job posting inside HunterOps: read it, score it, auto-fill the application answers and generate a resume, side by side." />
      <div className="surface flex flex-col gap-3 p-5">
        <div className="flex items-center gap-2 text-sm font-semibold"><Globe className="h-4 w-4" /> Open a job link</div>
        <OpenLinkForm />
        <p className="text-xs text-muted-foreground">Works with Greenhouse, Lever, Ashby, Workday and SmartRecruiters links, company career pages and most job sites.</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="flex flex-col gap-3"><h2 className="text-sm font-semibold">Best matches</h2><List jobs={best} /></section>
        <section className="flex flex-col gap-3"><h2 className="text-sm font-semibold">Recently viewed or updated</h2><List jobs={recent} /></section>
      </div>
    </div>
  );
}
