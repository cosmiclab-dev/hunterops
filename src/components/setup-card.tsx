'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { Check, FileUp, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScanButton } from '@/components/scan-button';
import { cn } from '@/lib/utils';

type Step = { id: string; title: string; sub: string; done: boolean; optional?: boolean };

// First-run setup on Home. Step one uploads the CV, which fills the profile and
// scores every job in one go.
export function SetupCard({ steps }: { steps: Step[] }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const left = steps.filter((s) => !s.done && !s.optional).length;

  async function upload(file: File) {
    setBusy(true);
    setErr('');
    setMsg('Reading your CV… (up to a minute)');
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('save', '1');
      const res = await fetch('/api/profile/import', { method: 'POST', body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Upload failed (HTTP ${res.status})`);
      setMsg(`Profile filled from your CV${data.grilled ? ` and ${data.grilled} jobs scored` : ''}.${data.warning ? ` ${data.warning}` : ''}`);
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
      setMsg('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="surface overflow-hidden" data-testid="setup-card">
      <div className="flex items-center justify-between gap-3 border-b px-5 py-4">
        <div>
          <h2 className="font-semibold">Set up HunterOps</h2>
          <p className="text-sm text-muted-foreground">{left ? `${left} step${left > 1 ? 's' : ''} left. Everything else works off these.` : 'All set.'}</p>
        </div>
        <span className="text-sm tabular-nums text-muted-foreground">{steps.filter((s) => s.done).length}/{steps.length}</span>
      </div>
      <ol className="divide-y">
        {steps.map((s, i) => (
          <li key={s.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center" data-step={s.id} data-done={s.done}>
            <span className={cn('grid h-7 w-7 shrink-0 place-items-center rounded-full border text-xs font-semibold', s.done ? 'border-success bg-success text-white' : 'text-muted-foreground')}>
              {s.done ? <Check className="h-4 w-4" /> : i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className={cn('text-sm font-medium', s.done && 'text-muted-foreground line-through')}>{s.title}{s.optional && <span className="ml-2 text-xs font-normal text-muted-foreground no-underline">optional</span>}</p>
              <p className="text-xs leading-5 text-muted-foreground">{s.sub}</p>
            </div>
            {!s.done && s.id === 'cv' && (
              <>
                <input ref={input} type="file" accept=".pdf,.docx,.txt" className="hidden" data-testid="cv-input" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
                <Button size="sm" onClick={() => input.current?.click()} disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <FileUp />} Upload CV</Button>
              </>
            )}
            {!s.done && s.id === 'ai' && <Button size="sm" variant="outline" asChild><Link href="/settings">Open Settings</Link></Button>}
            {!s.done && s.id === 'prefs' && <Button size="sm" variant="outline" asChild><Link href="/profile#p-pay">Add in Profile</Link></Button>}
            {!s.done && s.id === 'search' && <Button size="sm" variant="outline" asChild><Link href="/settings#search">Add key</Link></Button>}
            {!s.done && s.id === 'scan' && <ScanButton label="Run first scan" />}
          </li>
        ))}
      </ol>
      {(msg || err) && <p className={cn('border-t px-5 py-3 text-sm', err ? 'text-destructive' : 'text-muted-foreground')} role="status">{err || msg}</p>}
    </section>
  );
}
