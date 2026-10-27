'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Bookmark, ExternalLink, X } from 'lucide-react';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { GrillScoreBadge } from '@/components/grill-score-badge';
import { api } from '@/lib/api-client';
import { timeAgo } from '@/lib/utils';

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

export function JobCard({ job }: { job: JobCardData }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(job.status);
  const [error, setError] = useState('');

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
    <Card data-testid="job-card">
      <CardHeader className="flex-row items-start gap-3 space-y-0">
        <GrillScoreBadge score={job.grillScore} />
        <div className="min-w-0 flex-1">
          <CardTitle className="line-clamp-2">
            <Link href={`/jobs/${job.id}`} className="hover:underline">{job.title}</Link>
          </CardTitle>
          <p className="text-sm leading-5">{job.company}</p>
          <p className="meta mt-1 truncate">
            {[job.location, MODE_LABEL[job.workMode]].filter(Boolean).join(' · ') || 'Location not stated'}
          </p>
        </div>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-1">
        {job.matched.slice(0, 4).map((s) => <Badge key={s}>{s}</Badge>)}
        {job.missing.slice(0, 2).map((s) => <Badge key={s} className="border-dashed opacity-70" title="In the JD, not in your profile">{s}?</Badge>)}
        <span className="meta ml-auto self-center">{job.source} · {timeAgo(job.postedAt || job.firstSeenAt)}</span>
      </CardContent>
      <CardFooter className="gap-2">
        <Button asChild size="sm" variant="outline" className="flex-1">
          <Link href={`/jobs/${job.id}`}>Open</Link>
        </Button>
        <Button asChild size="sm" variant="outline" aria-label="Open the posting">
          <a href={job.url} target="_blank" rel="noopener noreferrer"><ExternalLink /> Post</a>
        </Button>
        {status === 'NEW' ? (
          <Button size="sm" onClick={() => setJobStatus('SAVED')} disabled={busy} aria-label="Save"><Bookmark /> Save</Button>
        ) : (
          <Badge variant="default" className="h-8 px-3">{status.toLowerCase()}</Badge>
        )}
        <Button size="sm" variant="ghost" onClick={() => setJobStatus('DISMISSED')} disabled={busy} aria-label="Dismiss"><X /></Button>
      </CardFooter>
      {error && <p className="px-4 pb-4 text-sm text-destructive">{error}</p>}
    </Card>
  );
}
