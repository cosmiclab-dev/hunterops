import Link from 'next/link';
import { Briefcase, UserRound } from 'lucide-react';
import { EmptyState, PageHeader } from '@/components/kit';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { JobCard, type JobCardData } from '@/components/job-card';
import { ScanButton } from '@/components/scan-button';
import type { GrillResult } from '@/lib/modules/grill';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const VIEWS = {
  new: { label: 'New', where: { status: 'NEW' } },
  saved: { label: 'Saved', where: { status: 'SAVED' } },
  applied: { label: 'Applied', where: { status: { in: ['APPLIED', 'INTERVIEW', 'OFFER'] } } },
  all: { label: 'All', where: { status: { not: 'DISMISSED' } } },
} satisfies Record<string, { label: string; where: Prisma.JobWhereInput }>;

const LOCS = {
  all: { label: 'Anywhere', where: {} },
  bengaluru: { label: 'Bengaluru', where: { locationClass: 'bengaluru' } },
  remote: { label: 'Remote', where: { OR: [{ workMode: 'REMOTE' }, { locationClass: { in: ['remote_india', 'remote_global'] } }] } },
} satisfies Record<string, { label: string; where: Prisma.JobWhereInput }>;

const SORTS = { score: 'Best fit', newest: 'Newest' } as const;

type Search = { view?: string; loc?: string; sort?: string };

function href(cur: Search, patch: Search) {
  const p = new URLSearchParams({ ...cur, ...patch } as Record<string, string>);
  return `/jobs?${p.toString()}`;
}

export default async function JobBoard({ searchParams }: { searchParams: Search }) {
  const view = (searchParams.view && searchParams.view in VIEWS ? searchParams.view : 'new') as keyof typeof VIEWS;
  const loc = (searchParams.loc && searchParams.loc in LOCS ? searchParams.loc : 'all') as keyof typeof LOCS;
  const sort = (searchParams.sort && searchParams.sort in SORTS ? searchParams.sort : 'score') as keyof typeof SORTS;
  const cur = { view, loc, sort };

  const where: Prisma.JobWhereInput = { AND: [VIEWS[view].where, LOCS[loc].where] };
  const [rows, counts, hasProfile, lastRun] = await Promise.all([
    prisma.job.findMany({
      where,
      orderBy: sort === 'score'
        ? [{ grillScore: { sort: 'desc', nulls: 'last' } }, { firstSeenAt: 'desc' }]
        : [{ postedAt: { sort: 'desc', nulls: 'last' } }, { firstSeenAt: 'desc' }],
      take: 100,
      select: {
        id: true, title: true, company: true, location: true, workMode: true, source: true, url: true,
        postedAt: true, firstSeenAt: true, salary: true, status: true, grillScore: true, grillBreakdown: true,
      },
    }),
    prisma.job.groupBy({ by: ['status'], _count: true }),
    prisma.profile.count(),
    prisma.scanRun.findFirst({ orderBy: { startedAt: 'desc' }, select: { startedAt: true, inserted: true } }),
  ]);
  const count = (statuses: string[]) => counts.filter((c) => statuses.includes(c.status)).reduce((n, c) => n + c._count, 0);
  const tabCounts: Record<keyof typeof VIEWS, number> = {
    new: count(['NEW']),
    saved: count(['SAVED']),
    applied: count(['APPLIED', 'INTERVIEW', 'OFFER']),
    all: count(['NEW', 'SAVED', 'APPLIED', 'INTERVIEW', 'OFFER', 'REJECTED']),
  };

  const jobs: JobCardData[] = rows.map((j) => {
    const g = j.grillBreakdown as unknown as GrillResult | null;
    return {
      ...j,
      postedAt: j.postedAt?.toISOString() ?? null,
      firstSeenAt: j.firstSeenAt.toISOString(),
      matched: g?.skills.matched ?? [],
      missing: g?.skills.missing ?? [],
    };
  });

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Grill-scored feed"
        title="Jobs"
        sub={lastRun ? `Last scan ${lastRun.startedAt.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' })}` : 'No scans yet'}
        action={<ScanButton />}
      />

      {!hasProfile && (
        <Link href="/profile" className="surface flex items-center gap-3 border-primary/40 p-4 text-sm leading-5">
          <UserRound className="h-5 w-5 text-primary" />
          <span>Grill Scores need your profile. <span className="font-semibold text-primary">Import your resume</span> and every job is scored against it.</span>
        </Link>
      )}

      <div className="scroll-x">
        <div className="inline-flex gap-1 rounded-full border bg-muted p-1" role="tablist" aria-label="Status">
          {(Object.keys(VIEWS) as (keyof typeof VIEWS)[]).map((v) => (
            <Link
              key={v}
              href={href(cur, { view: v })}
              role="tab"
              aria-selected={v === view}
              className={cn('inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full px-4 text-sm font-semibold text-muted-foreground transition-colors', v === view && 'bg-card text-foreground shadow-sm')}
            >
              {VIEWS[v].label} <span className={cn('rounded-full px-1.5 text-xs tabular-nums', v === view ? 'bg-primary text-primary-foreground' : 'bg-background')}>{tabCounts[v]}</span>
            </Link>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(LOCS) as (keyof typeof LOCS)[]).map((l) => (
          <Link key={l} href={href(cur, { loc: l })} className="chip" data-on={l === loc}>{LOCS[l].label}</Link>
        ))}
        <span className="mx-1 h-5 w-px bg-border" />
        {(Object.keys(SORTS) as (keyof typeof SORTS)[]).map((s) => (
          <Link key={s} href={href(cur, { sort: s })} className="chip" data-on={s === sort}>{SORTS[s]}</Link>
        ))}
        <div className="ml-auto hidden items-center gap-3 text-xs text-muted-foreground md:flex">
          <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-grill-green" /> 75+</span>
          <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-grill-yellow" /> 50–74</span>
          <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-grill-red" /> under 50</span>
        </div>
      </div>

      {jobs.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {jobs.map((j) => <JobCard key={j.id} job={j} />)}
        </div>
      ) : (
        <EmptyState icon={Briefcase} title={view === 'new' ? 'No new jobs here' : 'Nothing in this view yet'} action={<Link href="/discover" className="text-sm font-semibold text-primary">Search ATS boards directly</Link>}>
          {view === 'new' ? 'Press Scan now to check the company boards, or run an X-Ray search from Discover.' : 'Save or apply to jobs and they show up here.'}
        </EmptyState>
      )}
    </div>
  );
}
