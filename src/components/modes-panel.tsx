'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { CopyButton } from '@/components/copy-button';
import { Pill } from '@/components/kit';
import { api } from '@/lib/api-client';
import { MODE_META, type ModeId } from '@/lib/career-ops/shared';
import type { ModeAction, ModeOutput } from '@/lib/career-ops/modes';
import { cn, timeAgo } from '@/lib/utils';

export type ModeReport = { id: string; mode: string; createdAt: string; model: string | null; data: ModeOutput & { input?: string } };

function Actions({ actions, feed }: { actions: ModeAction[]; feed: string }) {
  const titles = actions.find((a) => a.kind === 'add_titles') as Extract<ModeAction, { kind: 'add_titles' }> | undefined;
  const status = actions.filter((a) => a.kind === 'set_status') as Extract<ModeAction, { kind: 'set_status' }>[];
  const [picked, setPicked] = useState<string[]>([]);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  if (!titles && !status.length) return null;

  async function addTitles() {
    setErr('');
    try {
      const current = feed.split(',').map((s) => s.trim()).filter(Boolean);
      const next = [...new Set([...current, ...picked.map((t) => t.toLowerCase())])];
      await api('/api/settings', { method: 'PUT', json: { values: { feed_keywords: next.join(', ') } } });
      setMsg(`Added ${picked.length} titles to your job feed. The next scan uses them.`);
      setPicked([]);
    } catch (e) {
      setErr((e as Error).message);
    }
  }
  async function setStatus(a: Extract<ModeAction, { kind: 'set_status' }>) {
    setErr('');
    try {
      await api(`/api/jobs/${a.jobId}`, { method: 'PATCH', json: { status: a.status } });
      setMsg('Status updated.');
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  return (
    <section className="surface flex flex-col gap-3 p-4">
      {titles && (
        <>
          <p className="text-sm font-medium">Add titles to your job feed</p>
          <div className="flex flex-wrap gap-2">
            {titles.titles.map((t) => {
              const on = picked.includes(t);
              return (
                <button key={t} type="button" aria-pressed={on} onClick={() => setPicked(on ? picked.filter((x) => x !== t) : [...picked, t])}
                  className={cn('rounded-full border px-3 py-1 text-sm', on ? 'border-foreground bg-foreground text-background' : 'border-border')}>{t}</button>
              );
            })}
          </div>
          <Button onClick={addTitles} disabled={!picked.length} className="w-fit">Add {picked.length || ''} to job feed</Button>
        </>
      )}
      {status.map((a) => <Button key={a.jobId} variant="outline" className="h-auto w-fit whitespace-normal text-left" onClick={() => setStatus(a)}>{a.label}</Button>)}
      {msg && <p className="meta" role="status">{msg}</p>}
      {err && <p className="text-sm text-destructive" role="alert">{err}</p>}
    </section>
  );
}

export function ReportView({ report, feed = '' }: { report: ModeReport; feed?: string }) {
  const d = report.data;
  return (
    <div className="flex flex-col gap-3" data-testid="mode-report">
      {d.summary && <p className="text-sm leading-6">{d.summary}</p>}
      {d.actions?.length ? <Actions actions={d.actions} feed={feed} /> : null}
      {d.sections.map((s, i) => (
        <section key={i} className="surface flex flex-col gap-2 p-4">
          <h3 className="text-[15px] font-semibold">{s.heading}</h3>
          <ul className="flex flex-col gap-2.5">
            {s.items.map((it, j) => (
              <li key={j} className="flex flex-col gap-1 text-sm leading-6">
                {(it.title || it.tag || it.copy) && (
                  <div className="flex flex-wrap items-center gap-2">
                    {it.title && <span className="font-medium">{it.title}</span>}
                    {it.tag && <Pill>{it.tag}</Pill>}
                    {it.copy && <CopyButton text={it.text} className="ml-auto" />}
                  </div>
                )}
                <p className={cn('whitespace-pre-wrap', it.title ? 'text-muted-foreground' : '')}>{it.text}</p>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <p className="meta">Made {timeAgo(new Date(report.createdAt))}{report.model ? ` · ${report.model}` : ''}</p>
    </div>
  );
}

// Career-Ops modes: pick one, paste anything it needs, run it, read the result.
export function ModesPanel({ scope, jobId, initial, feed = '' }: { scope: 'job' | 'global'; jobId?: string; initial: ModeReport[]; feed?: string }) {
  const modes = useMemo(() => (Object.keys(MODE_META) as ModeId[]).filter((m) => MODE_META[m].scope === scope), [scope]);
  const [mode, setMode] = useState<ModeId>(modes[0]);
  const [reports, setReports] = useState(initial);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const meta = MODE_META[mode];
  const latest = reports.find((r) => r.mode === mode);

  async function run() {
    setBusy(true);
    setErr('');
    try {
      const out = await api<{ report: ModeReport }>('/api/career-ops/run', { method: 'POST', json: { mode, jobId, input } });
      setReports([out.report, ...reports]);
      setInput('');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4" data-testid={`modes-${scope}`}>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Tool">
        {modes.map((m) => (
          <button key={m} type="button" role="radio" aria-checked={m === mode} onClick={() => { setMode(m); setErr(''); }}
            className={cn('rounded-xl border p-3 text-left transition-colors', m === mode ? 'border-foreground bg-muted/60' : 'border-border hover:bg-muted/40')}>
            <span className="flex items-center justify-between gap-2 text-sm font-semibold">
              {MODE_META[m].label}
              {reports.some((r) => r.mode === m) && <span className="text-xs font-normal text-muted-foreground">done</span>}
            </span>
            <span className="mt-1 block text-xs leading-5 text-muted-foreground">{MODE_META[m].blurb}</span>
          </button>
        ))}
      </div>
      <section className="surface flex flex-col gap-3 p-4">
        {meta.input && (
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            {meta.input.label}
            <Textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder={meta.input.placeholder} rows={6} />
          </label>
        )}
        <Button onClick={run} disabled={busy || (!!meta.input?.required && input.trim().length < 20)} className="w-fit">
          {busy ? 'Working… (up to 3 min)' : latest ? `Run ${meta.label.toLowerCase()} again` : `Run ${meta.label.toLowerCase()}`}
        </Button>
        {err && <p className="text-sm text-destructive" role="alert">{err}</p>}
      </section>
      {latest && <ReportView report={latest} feed={feed} />}
    </div>
  );
}
