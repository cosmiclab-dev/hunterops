'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Bookmark, CalendarClock, FileText, MessageSquareText, Send, Trophy, XCircle } from 'lucide-react';
import { GrillScoreBadge } from '@/components/grill-score-badge';
import { EmptyState } from '@/components/kit';
import { api } from '@/lib/api-client';
import { cn, timeAgo } from '@/lib/utils';

export type KanbanJob = {
  id: string; title: string; company: string; location: string | null; status: string; grillScore: number | null;
  appliedAt: string | null; updatedAt: string; notes: string | null; touches: number; resumes: number;
};

const STAGES = [
  { id: 'SAVED', label: 'Saved', icon: Bookmark, dot: 'bg-info' },
  { id: 'APPLIED', label: 'Applied', icon: Send, dot: 'bg-primary' },
  { id: 'INTERVIEW', label: 'Interview', icon: CalendarClock, dot: 'bg-warning' },
  { id: 'OFFER', label: 'Offer', icon: Trophy, dot: 'bg-success' },
  { id: 'REJECTED', label: 'Closed', icon: XCircle, dot: 'bg-muted-foreground' },
] as const;

export function KanbanBoard({ initial }: { initial: KanbanJob[] }) {
  const [jobs, setJobs] = useState(initial);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [stage, setStage] = useState<string>('ALL');

  const byStage = useMemo(() => {
    const m: Record<string, KanbanJob[]> = {};
    for (const s of STAGES) m[s.id] = [];
    for (const j of jobs) (m[j.status] ||= []).push(j);
    return m;
  }, [jobs]);

  async function move(id: string, status: string) {
    const prev = jobs;
    const now = new Date().toISOString();
    setJobs((js) => js.map((j) => (j.id === id ? { ...j, status, updatedAt: now, appliedAt: status === 'APPLIED' && !j.appliedAt ? now : j.appliedAt } : j)));
    setError('');
    try {
      await api(`/api/jobs/${id}`, { method: 'PATCH', json: { status } });
    } catch (e) {
      setJobs(prev);
      setError((e as Error).message);
    }
  }

  if (!jobs.length) {
    return (
      <EmptyState icon={Bookmark} title="Your pipeline is empty" action={<Link href="/jobs" className="text-sm font-semibold text-primary">Go to the job board</Link>}>
        Save jobs from the board or add one from Discover and they appear here.
      </EmptyState>
    );
  }

  const visible = stage === 'ALL' ? STAGES : STAGES.filter((s) => s.id === stage);

  return (
    <div className="flex flex-col gap-4">
      <div className="scroll-x">
        <div className="inline-flex gap-2">
          <button type="button" className="chip" data-on={stage === 'ALL'} onClick={() => setStage('ALL')}>All stages <span className="opacity-70">{jobs.length}</span></button>
          {STAGES.map((s) => (
            <button key={s.id} type="button" className="chip" data-on={stage === s.id} onClick={() => setStage(s.id)}>
              <i className={cn('h-2 w-2 rounded-full', s.dot)} /> {s.label} <span className="opacity-70">{byStage[s.id].length}</span>
            </button>
          ))}
        </div>
      </div>
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      <div className={cn('scroll-x', stage !== 'ALL' && 'mx-0 overflow-visible px-0')}>
        <div className={cn('flex gap-3 pb-2', stage === 'ALL' ? 'snap-x snap-mandatory' : '')}>
          {visible.map((s) => (
            <section
              key={s.id}
              aria-label={s.label}
              onDragOver={(e) => { e.preventDefault(); setOver(s.id); }}
              onDragLeave={() => setOver((o) => (o === s.id ? null : o))}
              onDrop={(e) => { e.preventDefault(); setOver(null); if (dragId) move(dragId, s.id); setDragId(null); }}
              className={cn(
                'flex shrink-0 snap-start flex-col gap-2 rounded-2xl border bg-muted/50 p-2 transition-colors',
                stage === 'ALL' ? 'w-[82vw] max-w-[300px] md:w-[260px]' : 'w-full',
                over === s.id && 'border-primary bg-primary/5',
              )}
            >
              <header className="flex items-center gap-2 px-2 pb-1 pt-1.5">
                <s.icon className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-bold">{s.label}</span>
                <span className="ml-auto rounded-full bg-card px-2 text-xs font-semibold tabular-nums text-muted-foreground">{byStage[s.id].length}</span>
              </header>
              {byStage[s.id].map((j) => (
                <article
                  key={j.id}
                  draggable
                  onDragStart={() => setDragId(j.id)}
                  onDragEnd={() => setDragId(null)}
                  className={cn('surface flex cursor-grab flex-col gap-2 p-3 active:cursor-grabbing', dragId === j.id && 'opacity-50')}
                  data-testid="kanban-card"
                >
                  <div className="flex items-start gap-2.5">
                    <GrillScoreBadge score={j.grillScore} size="sm" />
                    <div className="min-w-0 flex-1">
                      <Link href={`/jobs/${j.id}`} className="line-clamp-2 text-sm font-semibold leading-5 hover:text-primary">{j.title}</Link>
                      <p className="truncate text-xs text-muted-foreground">{j.company}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                    <span>{j.appliedAt ? `Applied ${timeAgo(j.appliedAt)}` : `Updated ${timeAgo(j.updatedAt)}`}</span>
                    {j.touches > 0 && <span className="inline-flex items-center gap-1"><MessageSquareText className="h-3 w-3" />{j.touches}</span>}
                    {j.resumes > 0 && <span className="inline-flex items-center gap-1"><FileText className="h-3 w-3" />{j.resumes}</span>}
                  </div>
                  {j.notes && <p className="line-clamp-2 rounded-lg bg-muted px-2 py-1.5 text-xs leading-4 text-muted-foreground">{j.notes}</p>}
                  <label className="relative">
                    <span className="sr-only">Move {j.title}</span>
                    <select
                      value=""
                      onChange={(e) => e.target.value && move(j.id, e.target.value)}
                      className="h-8 w-full appearance-none rounded-full border bg-card px-3 text-xs font-semibold"
                    >
                      <option value="" disabled>Move to…</option>
                      {STAGES.filter((o) => o.id !== j.status).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                    </select>
                  </label>
                </article>
              ))}
              {!byStage[s.id].length && <p className="px-2 py-6 text-center text-xs text-muted-foreground">Drop a job here</p>}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
