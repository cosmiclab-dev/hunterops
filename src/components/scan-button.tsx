'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api-client';
import { refreshActivity } from '@/lib/toast';

type Summary = {
  inserted: number; matched: number; fetched: number; sources: number; skipped_for_time: number; already_on_board?: number;
  errors: { source: string; error: string }[]; ms: number;
};

export function scanMessage(s: Summary) {
  const boards = `${s.sources - s.skipped_for_time} sources`;
  const failed = s.errors.length ? ` ${s.errors.length} did not answer (${s.errors.slice(0, 3).map((e) => e.source).join(', ')}${s.errors.length > 3 ? '…' : ''}).` : '';
  if (s.inserted > 0) return `Found ${s.inserted} new job${s.inserted === 1 ? '' : 's'} across ${boards}.${failed}`;
  if (s.matched > 0) return `No new jobs since your last scan: ${s.fetched.toLocaleString('en-IN')} postings checked, and all ${s.matched} that match your roles are already on your Jobs tab.${failed}`;
  return `No matching jobs right now across ${boards} (${s.fetched.toLocaleString('en-IN')} postings checked).${failed}`;
}

export function ScanButton({ label = 'Scan now' }: { label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [found, setFound] = useState(0);

  async function scan() {
    setBusy(true);
    setFound(0);
    setMsg('Checking company boards and job sites… (about 30 seconds). You can leave this page.');
    // The scan's progress shows in the bar at the bottom while it runs.
    const peek = setTimeout(refreshActivity, 1200);
    try {
      const s = await api<Summary>('/api/scan', { method: 'POST', json: { force: true } });
      clearTimeout(peek);
      refreshActivity();
      setMsg(scanMessage(s));
      setFound(s.inserted);
      router.refresh();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" onClick={scan} disabled={busy} data-testid="scan">
        <RefreshCw className={busy ? 'animate-spin' : ''} /> {busy ? 'Scanning' : label}
      </Button>
      {msg && (
        <p className="max-w-72 text-right text-xs leading-5" role="status">
          <span className="opacity-70">{msg}</span>
          {found > 0 && <> <Link href="/jobs?view=new&sort=newest" className="font-semibold underline underline-offset-2">See them</Link></>}
          {found === 0 && !busy && /already on your Jobs tab/.test(msg) && <> <Link href="/jobs" className="font-semibold underline underline-offset-2">Open Jobs</Link></>}
        </p>
      )}
    </div>
  );
}
