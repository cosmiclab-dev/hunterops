'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api-client';
import { cn } from '@/lib/utils';

const STATUSES = ['NEW', 'SAVED', 'APPLIED', 'INTERVIEW', 'OFFER', 'REJECTED', 'DISMISSED'];

export function JobStatus({ id, status, notes }: { id: string; status: string; notes: string | null }) {
  const router = useRouter();
  const [cur, setCur] = useState(status);
  const [text, setText] = useState(notes ?? '');
  const [msg, setMsg] = useState('');

  async function save(patch: { status?: string; notes?: string }) {
    setMsg('');
    try {
      await api(`/api/jobs/${id}`, { method: 'PATCH', json: patch });
      if (patch.status) setCur(patch.status);
      setMsg('Saved');
      router.refresh();
    } catch (e) {
      setMsg((e as Error).message);
    }
  }

  async function regrill() {
    setMsg('');
    try {
      await api(`/api/jobs/${id}/grill`, { method: 'POST' });
      router.refresh();
      setMsg('Re-grilled');
    } catch (e) {
      setMsg((e as Error).message);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="-mx-4 overflow-x-auto px-4">
        <div className="inline-flex gap-1">
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => save({ status: s })}
              className={cn('h-8 whitespace-nowrap rounded-sm border px-2 font-mono text-xs uppercase tracking-wider', s === cur ? 'bg-primary text-primary-foreground' : '')}
            >
              {s.toLowerCase()}
            </button>
          ))}
        </div>
      </div>
      <p className="meta">You apply on the company site yourself, then mark it Applied here.</p>
      <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="Notes: referral, recruiter name, follow-up date" aria-label="Notes" />
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => save({ notes: text })}>Save notes</Button>
        <Button size="sm" variant="ghost" onClick={regrill}>Re-grill</Button>
        {msg && <span className="meta" role="status">{msg}</span>}
      </div>
    </div>
  );
}
