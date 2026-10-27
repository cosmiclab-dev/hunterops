'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api-client';

type Check = { id: string; group: string; label: string; ok: boolean; skipped?: boolean; ms: number; detail: string };
type Result = { ranAt: string; passed: number; failed: number; checks: Check[] };

// Runs real requests from this deploy: the AI, every job source, free search,
// Gmail sign-in and the in-app browser. Nothing is sent or saved.
export function SelfTest() {
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Result | null>(null);
  const [err, setErr] = useState('');

  async function runTest() {
    setBusy(true);
    setErr('');
    try {
      setRes(await api<Result>('/api/selftest', { method: 'POST' }));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const groups = res ? [...new Set(res.checks.map((c) => c.group))] : [];
  const skipped = res ? res.checks.filter((c) => c.skipped).length : 0;

  return (
    <section id="selftest" className="surface flex scroll-mt-8 flex-col gap-4 p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">Live self-test</h2>
          <p className="mt-1 text-sm leading-5 text-muted-foreground">Checks every service this app uses, from your live site. Takes up to a minute. Nothing is sent or saved.</p>
        </div>
        <Button onClick={runTest} disabled={busy}>{busy ? 'Testing…' : res ? 'Run again' : 'Run self-test'}</Button>
      </div>
      {err && <p className="text-sm text-destructive" role="alert">{err}</p>}
      {res && (
        <div className="flex flex-col gap-4" data-testid="selftest-results">
          <p className="text-sm font-medium" role="status">
            {res.passed} passed{res.failed ? `, ${res.failed} failed` : ''}{skipped ? `, ${skipped} not set up` : ''}.
          </p>
          {groups.map((g) => (
            <div key={g} className="flex flex-col gap-1">
              <p className="label-caps text-muted-foreground">{g}</p>
              <ul className="divide-y divide-border rounded-xl border border-border">
                {res.checks.filter((c) => c.group === g).map((c) => (
                  <li key={c.id} className="flex items-start gap-3 px-3 py-2.5 text-sm" data-check={c.id} data-ok={c.ok}>
                    <span aria-hidden className={`mt-1.5 size-2 shrink-0 rounded-full ${c.ok ? 'bg-emerald-500' : c.skipped ? 'bg-muted-foreground/40' : 'bg-destructive'}`} />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{c.label} <span className="sr-only">{c.ok ? 'passed' : c.skipped ? 'not set up' : 'failed'}</span></p>
                      <p className="break-words text-muted-foreground">{c.detail}</p>
                    </div>
                    <span className="shrink-0 tabular-nums text-xs text-muted-foreground">{(c.ms / 1000).toFixed(1)}s</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
