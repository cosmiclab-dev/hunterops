'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ChevronRight, Loader2, ShieldCheck, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GrillScoreBadge } from '@/components/grill-score-badge';
import { api } from '@/lib/api-client';
import { cn } from '@/lib/utils';

type Waiting = { id: string; title: string; company: string; status: 'PENDING' | 'APPROVED'; grillScore: number | null };

// Applications waiting on the person, above the board, plus the button that
// has the AI prepare the best new matches.
export function ApprovalsStrip({ waiting }: { waiting: Waiting[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function prepareTop() {
    setBusy(true);
    setMsg('');
    try {
      const out = await api<{ prepared: { title: string }[]; failed: { title: string; error: string }[]; off: boolean; minScore?: number }>('/api/applications/auto', { method: 'POST' });
      if (out.off) setMsg('Auto-prepare is off. Turn it on in Settings, Applications.');
      else if (!out.prepared.length && !out.failed.length) setMsg(`No new matches scored ${out.minScore ?? 75}+ without an application. Scan for new jobs, or lower the score in Settings.`);
      else setMsg([out.prepared.length ? `${out.prepared.length} ready for your approval.` : '', out.failed.length ? `${out.failed.length} could not be prepared: ${out.failed[0].error}` : ''].filter(Boolean).join(' '));
      router.refresh();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-3" aria-label="Applications">
      <div className="flex items-center justify-between gap-3">
        <h2 className="whitespace-nowrap text-[21px] font-semibold leading-tight">Applications{waiting.length ? ` (${waiting.length})` : ''}</h2>
        <Button size="sm" variant="outline" onClick={prepareTop} disabled={busy} data-testid="prepare-top">
          {busy ? <><Loader2 className="animate-spin" /> Preparing…</> : <><Wand2 /> Prepare matches</>}
        </Button>
      </div>
      {msg && <p className="text-sm text-muted-foreground" role="status">{msg}</p>}
      {waiting.length > 0 ? (
        <div className="surface divide-y overflow-hidden p-0">
          {waiting.map((w) => (
            <Link key={w.id} href={`/apply/${w.id}`} className="flex items-center gap-3 px-4 py-3 active:bg-muted/60" data-testid="approval-row">
              <GrillScoreBadge score={w.grillScore} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{w.title}</span>
                <span className="block truncate text-sm text-muted-foreground">{w.company}</span>
                <span className={cn('mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold', w.status === 'PENDING' ? 'bg-warning/15 text-warning' : 'bg-primary/10 text-primary')}>
                  <ShieldCheck className="h-3 w-3" /> {w.status === 'PENDING' ? 'Approval pending' : 'Ready to submit'}
                </span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>
          ))}
        </div>
      ) : (
        <p className="text-sm leading-6 text-muted-foreground">Each morning the AI prepares your best new matches here for approval. You can also open any job and tap Prepare application.</p>
      )}
    </section>
  );
}
