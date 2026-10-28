import Link from 'next/link';
import { ChevronRight, Wand2 } from 'lucide-react';
import { prisma } from '@/lib/db';
import { autoSettings, isStalePrep } from '@/lib/apply';
import { loadSettings } from '@/lib/settings';
import { EmptyState, PageHeader, Pill, Section, type Tone } from '@/components/kit';
import { GrillScoreBadge } from '@/components/grill-score-badge';
import { PrepareTop } from '@/components/prepare-top';
import { Button } from '@/components/ui/button';
import { timeAgo } from '@/lib/utils';

export const dynamic = 'force-dynamic';

type Row = { jobId: string; title: string; company: string; grillScore: number | null; when: Date; note?: string | null };

const GROUPS: { key: string; title: string; pill: string; tone: Tone; empty?: string }[] = [
  { key: 'PENDING', title: 'Waiting for your approval', pill: 'Approval pending', tone: 'warning' },
  { key: 'APPROVED', title: 'Approved: submit on the company site', pill: 'Ready to submit', tone: 'primary' },
  { key: 'PREPARING', title: 'Being prepared', pill: 'Preparing', tone: 'info' },
  { key: 'FAILED', title: 'Could not be prepared', pill: 'Try again', tone: 'danger' },
];

function Rows({ rows, pill, tone }: { rows: Row[]; pill?: string; tone?: Tone }) {
  return (
    <div className="surface divide-y overflow-hidden p-0">
      {rows.map((r) => (
        <Link key={r.jobId} href={`/apply/${r.jobId}`} className="flex items-center gap-3 px-4 py-3 active:bg-muted/60" data-testid="apply-row">
          <GrillScoreBadge score={r.grillScore} size="sm" />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{r.company}</span>
            <span className="block truncate text-sm text-muted-foreground">{r.title}</span>
            {r.note && <span className="mt-0.5 block truncate text-xs text-muted-foreground">{r.note}</span>}
          </span>
          <span className="flex shrink-0 flex-col items-end gap-1">
            {pill && <Pill tone={tone}>{pill}</Pill>}
            <span className="meta">{timeAgo(r.when)}</span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Link>
      ))}
    </div>
  );
}

// The Apply hub: every application the AI prepared, grouped by what it needs
// from the person, and the best matches that do not have one yet.
export default async function ApplyHub() {
  const settings = await loadSettings();
  const conf = autoSettings((k) => settings.get(k));
  const [apps, ready, scored] = await Promise.all([
    prisma.application.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 200,
      select: { jobId: true, status: true, updatedAt: true, submittedAt: true, error: true, job: { select: { title: true, company: true, grillScore: true } } },
    }),
    prisma.job.findMany({
      where: { status: { in: ['NEW', 'SAVED'] }, application: null, grillScore: { not: null } },
      orderBy: [{ grillScore: 'desc' }, { firstSeenAt: 'desc' }],
      take: 12,
      select: { id: true, title: true, company: true, grillScore: true, firstSeenAt: true, source: true },
    }),
    prisma.job.count({ where: { grillScore: { not: null } } }),
  ]);
  const byStatus = new Map<string, Row[]>();
  for (const a of apps) {
    const status = isStalePrep(a) ? 'FAILED' : a.status;
    const row = { jobId: a.jobId, title: a.job.title, company: a.job.company, grillScore: a.job.grillScore, when: a.submittedAt || a.updatedAt, note: status === 'FAILED' ? a.error || 'Preparing stopped before it finished.' : null };
    byStatus.set(status, [...(byStatus.get(status) || []), row]);
  }
  const submitted = byStatus.get('SUBMITTED') || [];
  const open = GROUPS.reduce((n, g) => n + (byStatus.get(g.key)?.length || 0), 0);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Apply" sub="The AI reads each posting, answers the form from your profile, tailors your resume, writes a cover letter and runs the Career-Ops evaluation. You approve it, then press Submit on the company’s site." />

      <section className="tile-dark flex flex-col gap-4 px-5 py-6 sm:px-8">
        <div>
          <p className="text-[21px] font-semibold leading-tight">Apply to your best matches</p>
          <p className="mt-1 text-[15px] leading-6 text-white/70">
            {conf.count
              ? `Prepares up to ${conf.count} jobs scored ${conf.minScore}+ that have no application yet. It also runs every morning after the scan. Change the count and score in Settings.`
              : 'Auto-prepare is off. Turn it on in Settings, Applications.'}
          </p>
        </div>
        <PrepareTop />
      </section>

      {GROUPS.map((g) => {
        const rows = byStatus.get(g.key) || [];
        return rows.length ? (
          <Section key={g.key} title={`${g.title} (${rows.length})`}>
            <Rows rows={rows} pill={g.pill} tone={g.tone} />
          </Section>
        ) : null;
      })}
      {!open && (
        <EmptyState icon={Wand2} title="Nothing waiting on you">
          Tap Prepare above, or pick a job below and tap Apply with AI.
        </EmptyState>
      )}

      <Section title="Best matches without an application" action={<Link href="/jobs" className="text-sm font-semibold text-primary">All jobs</Link>}>
        {ready.length ? (
          <div className="surface divide-y overflow-hidden p-0" data-testid="ready-to-apply">
            {ready.map((j) => (
              <div key={j.id} className="flex items-center gap-3 px-4 py-3">
                <GrillScoreBadge score={j.grillScore} size="sm" />
                <Link href={`/jobs/${j.id}`} className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{j.title}</span>
                  <span className="block truncate text-sm text-muted-foreground">{j.company} · found {timeAgo(j.firstSeenAt)}</span>
                </Link>
                <Button asChild size="sm" className="shrink-0">
                  <Link href={`/apply/${j.id}`}><Wand2 /> Apply</Link>
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm leading-6 text-muted-foreground">{scored ? 'Every open match already has an application. Run a scan for new jobs.' : 'No scored jobs yet. Upload your CV on Home and run a scan.'}</p>
        )}
      </Section>

      {submitted.length > 0 && (
        <Section title={`Applied (${submitted.length})`}>
          <Rows rows={submitted.slice(0, 20)} pill="Applied" tone="success" />
        </Section>
      )}
    </div>
  );
}
