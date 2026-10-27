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

  return (
    <div className="surface flex flex-col gap-3 p-4">
      <p className="text-sm font-semibold">Status</p>
      <div>
        <div className="flex flex-wrap gap-1.5">
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => save({ status: s })}
              className="chip capitalize"
              data-on={s === cur}
            >
              {s.toLowerCase()}
            </button>
          ))}
        </div>
      </div>
      <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="Notes: referral, recruiter name, follow-up date" aria-label="Notes" />
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => save({ notes: text })}>Save notes</Button>
        {msg && <span className="meta" role="status">{msg}</span>}
      </div>
    </div>
  );
}
