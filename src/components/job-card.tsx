'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Bookmark, BookmarkCheck, Building2, Clock3, ExternalLink, MapPin, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GrillScoreBadge } from '@/components/grill-score-badge';
import { Pill } from '@/components/kit';
import { api } from '@/lib/api-client';
import { cn, timeAgo } from '@/lib/utils';

export type JobCardData = {
  id: string;
  title: string;
  company: string;
  location: string | null;
  workMode: string;
  source: string;
  url: string;
  postedAt: string | null;
  firstSeenAt: string;
  salary: string | null;
  status: string;
  grillScore: number | null;
  matched: string[];
  missing: string[];
};

const MODE_LABEL: Record<string, string> = { REMOTE: 'Remote', HYBRID: 'Hybrid', ONSITE: 'On-site', UNKNOWN: '' };
const STATUS_TONE: Record<string, 'primary' | 'info' | 'warning' | 'success' | 'muted'> = {
  SAVED: 'info', APPLIED: 'primary', INTERVIEW: 'warning', OFFER: 'success', REJECTED: 'muted',
};

export function JobCard({ job }: { job: JobCardData }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(job.status);
  const [error, setError] = useState('');
  const fresh = Date.now() - new Date(job.postedAt || job.firstSeenAt).getTime() < 86_400_000;

  async function setJobStatus(next: string) {
    setBusy(true);
    setError('');
    try {
      await api(`/api/jobs/${job.id}`, { method: 'PATCH', json: { status: next } });
      setStatus(next);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (status === 'DISMISSED') return null;
  return (
    <article className="surface group flex flex-col gap-3 p-4 transition-colors hover:border-primary/40" data-testid="job-card">
      <div className="flex items-start gap-3">
        <GrillScoreBadge score={job.grillScore} />
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 font-semibold leading-6">
            <Link href={`/jobs/${job.id}`} className="hover:text-primary">{job.title}</Link>
          </h3>
          <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground"><Building2 className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{job.company}</span></p>
        </div>
        <Button size="icon-sm" variant="ghost" className="-mr-2 -mt-1 text-muted-foreground" onClick={() => setJobStatus('DISMISSED')} disabled={busy} aria-label="Dismiss"><X /></Button>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex min-w-0 items-center gap-1"><MapPin className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{[job.location, MODE_LABEL[job.workMode]].filter(Boolean).join(' · ') || 'Location not stated'}</span></span>
        <span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" />{timeAgo(job.postedAt || job.firstSeenAt)}</span>
        {fresh && <Pill tone="danger" className="px-2 py-0 text-[10px] uppercase tracking-wide">Fresh</Pill>}
        <span className="ml-auto font-mono text-[10px] uppercase tracking-wider">{job.source}</span>
      </div>
      {(job.matched.length > 0 || job.missing.length > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {job.matched.slice(0, 4).map((s) => <span key={s} className="rounded-full bg-success/10 px-2.5 py-0.5 text-xs font-medium text-success">{s}</span>)}
          {job.missing.slice(0, 2).map((s) => <span key={s} className="rounded-full border border-dashed px-2.5 py-0.5 text-xs text-muted-foreground" title="In the JD, not in your profile">{s}?</span>)}
        </div>
      )}
      <div className="mt-auto flex items-center gap-2 pt-1">
        <Button asChild size="sm" variant="secondary" className="flex-1">
          <Link href={`/jobs/${job.id}`}>Open</Link>
        </Button>
        <Button asChild size="sm" variant="outline" aria-label="Open the posting">
          <a href={job.url} target="_blank" rel="noopener noreferrer"><ExternalLink /> Post</a>
        </Button>
        {status === 'NEW' ? (
          <Button size="sm" onClick={() => setJobStatus('SAVED')} disabled={busy} aria-label="Save"><Bookmark /> Save</Button>
        ) : (
          <Pill tone={STATUS_TONE[status] || 'muted'} className={cn('h-9 px-3 capitalize')}>{status === 'SAVED' && <BookmarkCheck className="h-3.5 w-3.5" />}{status.toLowerCase()}</Pill>
        )}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </article>
  );
}
