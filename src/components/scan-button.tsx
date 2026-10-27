'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api-client';

type Summary = { inserted: number; matched: number; fetched: number; sources: number; errors: { source: string; error: string }[]; ms: number };

export function ScanButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function scan() {
    setBusy(true);
    setMsg('Scanning company boards…');
    try {
      const s = await api<Summary>('/api/scan', { method: 'POST', json: {} });
      setMsg(`${s.inserted} new of ${s.matched} matching jobs from ${s.sources} sources${s.errors.length ? ` (${s.errors.length} sources failed)` : ''}.`);
      router.refresh();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" onClick={scan} disabled={busy}>
        <RefreshCw className={busy ? 'animate-spin' : ''} /> {busy ? 'Scanning' : 'Scan now'}
      </Button>
      {msg && <p className="meta max-w-60 text-right" role="status">{msg}</p>}
    </div>
  );
}
