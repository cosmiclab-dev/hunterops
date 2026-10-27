import Link from 'next/link';
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
  return `/?${p.toString()}`;
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
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Job Board</h1>
          <p className="meta mt-1">
            {lastRun ? `Last scan ${lastRun.startedAt.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' })}` : 'No scans yet'}
          </p>
        </div>
        <ScanButton />
      </div>

      {!hasProfile && (
        <div className="rounded-lg border p-4 text-sm leading-5">
          Grill Scores need your profile. <Link href="/profile" className="font-semibold underline">Import your resume</Link> and every job is scored against it.
        </div>
      )}

      <div className="-mx-4 overflow-x-auto px-4">
        <div className="inline-flex gap-1 rounded-md border p-1" role="tablist" aria-label="Status">
          {(Object.keys(VIEWS) as (keyof typeof VIEWS)[]).map((v) => (
            <Link
              key={v}
              href={href(cur, { view: v })}
              role="tab"
              aria-selected={v === view}
              className={cn('inline-flex h-8 items-center gap-1 whitespace-nowrap rounded-sm px-3 font-mono text-xs uppercase tracking-wider', v === view && 'bg-primary text-primary-foreground')}
            >
              {VIEWS[v].label} <span className="tabular-nums opacity-70">{tabCounts[v]}</span>
            </Link>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex gap-3">
          {(Object.keys(LOCS) as (keyof typeof LOCS)[]).map((l) => (
            <Link key={l} href={href(cur, { loc: l })} className={cn('label-caps', l === loc ? 'underline underline-offset-4' : 'opacity-60')}>{LOCS[l].label}</Link>
          ))}
        </div>
        <div className="ml-auto flex gap-3">
          {(Object.keys(SORTS) as (keyof typeof SORTS)[]).map((s) => (
            <Link key={s} href={href(cur, { sort: s })} className={cn('label-caps', s === sort ? 'underline underline-offset-4' : 'opacity-60')}>{SORTS[s]}</Link>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3 meta">
        <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-grill-green" /> 75+</span>
        <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-grill-yellow" /> 50–74</span>
        <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-grill-red" /> under 50</span>
      </div>

      {jobs.length ? (
        <div className="flex flex-col gap-3">
          {jobs.map((j) => <JobCard key={j.id} job={j} />)}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm leading-5">
          {view === 'new' ? 'No new jobs here. Press Scan now to check the company boards.' : 'Nothing in this view yet.'}
        </div>
      )}
    </div>
  );
}
