'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Loader2, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api-client';

type Out = { prepared: { title: string }[]; started?: { title: string }[]; failed: { title: string; error: string }[]; off: boolean; minScore?: number };

export function prepareTopMessage(out: Out) {
  if (out.off) return 'Auto-prepare is off. Turn it on in Settings, Applications.';
  const started = out.started?.length || 0;
  if (!out.prepared.length && !started && !out.failed.length) return `No new matches scored ${out.minScore ?? 75}+ without an application. Scan for new jobs, or lower the score in Settings.`;
  return [
    started ? `Preparing ${started} application${started === 1 ? '' : 's'}. The progress shows at the bottom of every screen, and you'll get a notification when each is ready for your approval.` : '',
    out.prepared.length ? `${out.prepared.length} application${out.prepared.length === 1 ? '' : 's'} ready for your approval.` : '',
    out.failed.length ? `${out.failed.length} could not be prepared: ${out.failed[0].error}` : '',
  ].filter(Boolean).join(' ');
}

// Has the AI prepare the best new matches at once. Nothing is submitted.
export function PrepareTop({ label = 'Prepare my top matches', size = 'default' }: { label?: string; size?: 'default' | 'sm' }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function run() {
    setBusy(true);
    setMsg('');
    try {
      setMsg(prepareTopMessage(await api<Out>('/api/applications/auto', { method: 'POST' })));
      router.refresh();
      window.dispatchEvent(new Event('hunterops:activity'));
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button size={size} onClick={run} disabled={busy} data-testid="prepare-top">
        {busy ? <><Loader2 className="animate-spin" /> Starting…</> : <><Wand2 /> {label}</>}
      </Button>
      {msg && <p className="text-sm leading-6 opacity-80" role="status">{msg}</p>}
    </div>
  );
}
