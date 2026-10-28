'use client';

import Link from 'next/link';
import { useMemo, useState, type ReactNode } from 'react';
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, TouchSensor, closestCorners, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { Clock3, Columns3, Loader2, ShieldCheck, FileText, Globe, GripVertical, MessageSquareText } from 'lucide-react';
import { GrillScoreBadge } from '@/components/grill-score-badge';
import { EmptyState } from '@/components/kit';
import { api } from '@/lib/api-client';
import { COLUMNS, columnOf, dropStatus, type ColumnId } from '@/lib/pipeline';
import { cn, timeAgo } from '@/lib/utils';

export type KanbanJob = {
  id: string; title: string; company: string; location: string | null; status: string; grillScore: number | null;
  appliedAt: string | null; updatedAt: string; notes: string | null; touches: number; resumes: number;
  application?: 'PREPARING' | 'PENDING' | 'APPROVED' | 'SUBMITTED' | 'FAILED' | null;
};

// The application badge on a card; it links to the review screen.
const APP_BADGE: Record<string, { label: string; className: string }> = {
  PREPARING: { label: 'Preparing…', className: 'bg-muted text-muted-foreground' },
  PENDING: { label: 'Approval pending', className: 'bg-warning/15 text-warning' },
  APPROVED: { label: 'Ready to submit', className: 'bg-primary/10 text-primary' },
  FAILED: { label: 'Prep failed', className: 'bg-destructive/10 text-destructive' },
};

const APPLIED_STAGES = [['APPLIED', 'Applied'], ['INTERVIEW', 'Interview'], ['OFFER', 'Offer']] as const;
const DOT: Record<ColumnId, string> = { scouted: 'bg-info', grilled: 'bg-grill-green', applied: 'bg-primary', rejected: 'bg-muted-foreground' };

function CardBody({ j, onStage, dragging, move }: { j: KanbanJob; onStage?: (s: string) => void; dragging?: boolean; move?: ReactNode }) {
  return (
    <div className={cn('flex flex-col gap-2.5 rounded-2xl border bg-card p-3.5 shadow-sm', dragging && 'rotate-1 shadow-lg ring-2 ring-primary/40')}>
      <div className="flex items-start gap-2.5">
        <GrillScoreBadge score={j.grillScore} size="sm" />
        <div className="min-w-0 flex-1">
          <Link href={`/jobs/${j.id}`} className="line-clamp-2 text-sm font-medium leading-5 hover:underline" onPointerDown={(e) => e.stopPropagation()}>{j.title}</Link>
          <p className="truncate text-xs text-muted-foreground">{j.company}{j.location ? ` · ${j.location}` : ''}</p>
        </div>
        <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground/60" aria-hidden />
      </div>
      {j.application && APP_BADGE[j.application] && (
        <Link href={`/apply/${j.id}`} onPointerDown={(e) => e.stopPropagation()} className={cn('inline-flex items-center gap-1.5 self-start rounded-full px-2.5 py-1 text-xs font-semibold', APP_BADGE[j.application].className)} data-testid="app-badge">
          {j.application === 'PREPARING' ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3" />}
          {APP_BADGE[j.application].label}
        </Link>
      )}
      <div className="flex items-center gap-2.5 text-[11px] text-muted-foreground">
        <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap"><Clock3 className="h-3 w-3 shrink-0" />{j.appliedAt ? `Applied ${timeAgo(j.appliedAt)}` : timeAgo(j.updatedAt)}</span>
        {j.touches > 0 && <span className="inline-flex items-center gap-1"><MessageSquareText className="h-3 w-3" />{j.touches}</span>}
        {j.resumes > 0 && <span className="inline-flex items-center gap-1"><FileText className="h-3 w-3" />{j.resumes}</span>}
        <Link href={`/browser/${j.id}`} className="ml-auto inline-flex items-center gap-1 hover:text-foreground" onPointerDown={(e) => e.stopPropagation()} aria-label={`Open ${j.title} in Browser`}>
          <Globe className="h-3 w-3" /><span className="max-[400px]:sr-only">Open</span>
        </Link>
        {move}
      </div>
      {onStage && (
        <div className="inline-flex rounded-[10px] bg-muted p-0.5" onPointerDown={(e) => e.stopPropagation()}>
          {APPLIED_STAGES.map(([id, label]) => (
            <button key={id} type="button" onClick={() => onStage(id)} className={cn('flex-1 rounded-lg px-2 py-1 text-xs font-semibold', j.status === id ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Card({ j, onStage, onMove }: { j: KanbanJob; onStage: (s: string) => void; onMove: (to: ColumnId) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: j.id });
  const col = columnOf(j);
  return (
    <article ref={setNodeRef} {...listeners} {...attributes} className={cn('touch-manipulation outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-2xl', isDragging && 'opacity-30')} data-testid="kanban-card" data-job={j.id}>
      <CardBody
        j={j}
        onStage={col === 'applied' ? onStage : undefined}
        move={
          // Phones and keyboards: move without dragging.
          <label className="lg:sr-only" onPointerDown={(e) => e.stopPropagation()}>
            <span className="sr-only">Move {j.title}</span>
            <select value="" onChange={(e) => e.target.value && onMove(e.target.value as ColumnId)} className="select-compact h-7 rounded-full bg-primary/10 pl-2.5 text-xs font-semibold text-primary">
              <option value="" disabled>Move to…</option>
              {COLUMNS.filter((c) => c.id !== col).map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </label>
        }
      />
    </article>
  );
}

function Column({ id, label, hint, jobs, children }: { id: ColumnId; label: string; hint: string; jobs: number; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <section
      ref={setNodeRef}
      aria-label={label}
      data-column={id}
      className={cn('flex w-[84vw] max-w-[320px] shrink-0 snap-start flex-col gap-2 rounded-xl border bg-muted/40 p-2 transition-colors lg:w-auto lg:max-w-none', isOver && 'border-primary/60 bg-primary/5')}
    >
      <header className="flex items-center gap-2 px-2 pb-1 pt-1.5">
        <i className={cn('h-2 w-2 rounded-full', DOT[id])} />
        <span className="whitespace-nowrap text-sm font-semibold">{label}</span>
        <span className="rounded-md bg-background px-1.5 text-xs font-medium tabular-nums text-muted-foreground">{jobs}</span>
        <span className="ml-auto hidden truncate text-[11px] text-muted-foreground 2xl:inline">{hint}</span>
      </header>
      <div className="flex min-h-24 flex-col gap-2">{children}</div>
    </section>
  );
}

export function KanbanBoard({ initial }: { initial: KanbanJob[] }) {
  const [jobs, setJobs] = useState(initial);
  const [active, setActive] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const byCol = useMemo(() => {
    const m: Record<ColumnId, KanbanJob[]> = { scouted: [], grilled: [], applied: [], rejected: [] };
    for (const j of jobs) {
      const c = columnOf(j);
      if (c) m[c].push(j);
    }
    m.grilled.sort((a, b) => (b.grillScore ?? 0) - (a.grillScore ?? 0));
    return m;
  }, [jobs]);

  async function setStatus(id: string, status: string) {
    const before = jobs.find((j) => j.id === id);
    const now = new Date().toISOString();
    setJobs((js) => js.map((j) => (j.id === id ? { ...j, status, updatedAt: now, appliedAt: status === 'APPLIED' && !j.appliedAt ? now : j.appliedAt } : j)));
    try {
      await api(`/api/jobs/${id}`, { method: 'PATCH', json: { status } });
    } catch (e) {
      // Put back only the card that failed, so a later move is kept.
      if (before) setJobs((js) => js.map((j) => (j.id === id ? before : j)));
      setMsg((e as Error).message);
    }
  }

  function move(id: string, to: ColumnId) {
    const j = jobs.find((x) => x.id === id);
    if (!j) return;
    const r = dropStatus(j, to);
    if ('error' in r) {
      setMsg(r.error);
      return;
    }
    setMsg('');
    if (r.status !== j.status) setStatus(id, r.status);
  }

  const onStart = (e: DragStartEvent) => setActive(String(e.active.id));
  const onEnd = (e: DragEndEvent) => {
    setActive(null);
    if (e.over) move(String(e.active.id), e.over.id as ColumnId);
  };

  if (!jobs.length) {
    return (
      <EmptyState icon={Columns3} title="Your pipeline is empty" action={<Link href="/discover" className="text-sm font-medium text-info">Find jobs in Discover</Link>}>
        Scanned jobs land in Scouted, strong matches in Grilled 75+. Save any job from Discover or the Browser.
      </EmptyState>
    );
  }

  const dragging = active ? jobs.find((j) => j.id === active) : null;
  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onStart} onDragEnd={onEnd} onDragCancel={() => setActive(null)}>
      {msg && <p className="mb-3 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm" role="alert">{msg}</p>}
      <div className="scroll-x lg:mx-0 lg:overflow-visible lg:px-0">
        <div className="flex snap-x snap-mandatory gap-3 pb-2 lg:grid lg:grid-cols-4">
          {COLUMNS.map((c) => (
            <Column key={c.id} id={c.id} label={c.label} hint={c.hint} jobs={byCol[c.id].length}>
              {byCol[c.id].map((j) => <Card key={j.id} j={j} onStage={(s) => setStatus(j.id, s)} onMove={(to) => move(j.id, to)} />)}
              {!byCol[c.id].length && <p className="px-2 py-8 text-center text-xs text-muted-foreground">Drop a job here</p>}
            </Column>
          ))}
        </div>
      </div>
      <DragOverlay dropAnimation={null}>{dragging ? <CardBody j={dragging} dragging /> : null}</DragOverlay>
    </DndContext>
  );
}
