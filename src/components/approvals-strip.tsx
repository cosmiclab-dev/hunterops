'use client';

import Link from 'next/link';
import { ChevronRight, ShieldCheck } from 'lucide-react';
import { PrepareTop } from '@/components/prepare-top';
import { GrillScoreBadge } from '@/components/grill-score-badge';
import { cn } from '@/lib/utils';

type Waiting = { id: string; title: string; company: string; status: 'PENDING' | 'APPROVED'; grillScore: number | null };

// Applications waiting on the person, above the board, plus the button that
// has the AI prepare the best new matches.
export function ApprovalsStrip({ waiting }: { waiting: Waiting[] }) {
  return (
    <section className="flex flex-col gap-3" aria-label="Applications">
      <div className="flex items-center justify-between gap-3">
        <h2 className="whitespace-nowrap text-[21px] font-semibold leading-tight">Applications{waiting.length ? ` (${waiting.length})` : ''}</h2>
        <PrepareTop size="sm" label="Prepare matches" />
      </div>
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
