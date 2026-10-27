'use client';

import { useState } from 'react';
import { Download, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api, download } from '@/lib/api-client';
import { SlopReportView } from '@/components/slop-checker';
import type { SlopReport } from '@/lib/modules/anti-slop';
import type { DesignIssue } from '@/lib/modules/designer';

type Tailored = { resume: { id: string; name: string }; slop: SlopReport; issues: DesignIssue[]; pages: number; notes: string[]; model: string };
type Saved = { id: string; name: string; createdAt: string; slopScore: number | null };

export function ResumePanel({ jobId, saved }: { jobId: string; saved: Saved[] }) {
  const [density, setDensity] = useState<'standard' | 'compact'>('standard');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [result, setResult] = useState<Tailored | null>(null);

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setErr('');
    try {
      await fn();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy('');
    }
  }

  const get = (format: 'pdf' | 'docx', resumeId?: string) =>
    run(`${format}${resumeId ?? ''}`, () => download('/api/resume/render', { format, density, resumeId }, `Resume.${format}`));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-3">
        {(['standard', 'compact'] as const).map((d) => (
          <button key={d} type="button" onClick={() => setDensity(d)} className="chip capitalize" data-on={d === density}>{d}</button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => run('tailor', async () => setResult(await api<Tailored>('/api/resume/tailor', { method: 'POST', json: { jobId, density } })))} disabled={!!busy}>
          <Wand2 /> {busy === 'tailor' ? 'Tailoring… (up to a minute)' : 'Tailor to this job'}
        </Button>
        <Button variant="outline" onClick={() => get('pdf')} disabled={!!busy}><Download /> Master PDF</Button>
        <Button variant="outline" onClick={() => get('docx')} disabled={!!busy}><Download /> Master DOCX</Button>
      </div>
      {err && <p className="text-sm text-destructive" role="alert">{err}</p>}

      {result && (
        <div className="surface flex flex-col gap-3 p-4" data-testid="tailor-result">
          <p className="font-semibold">{result.resume.name}</p>
          <p className="meta">{result.pages} page{result.pages > 1 ? 's' : ''} · {result.model}</p>
          <SlopReportView report={result.slop} />
          {result.issues.length ? (
            <ul className="flex flex-col gap-1 text-sm leading-5">
              {result.issues.map((i, n) => <li key={n}><span className="label-caps">{i.rule}</span> {i.message}</li>)}
            </ul>
          ) : <p className="meta">Designer audit: passes DESIGN.md</p>}
          {result.notes.length > 0 && (
            <ul className="list-disc pl-5 text-sm leading-5">{result.notes.map((n) => <li key={n}>{n}</li>)}</ul>
          )}
          <div className="flex gap-2">
            <Button size="sm" onClick={() => get('pdf', result.resume.id)} disabled={!!busy}><Download /> PDF</Button>
            <Button size="sm" variant="outline" onClick={() => get('docx', result.resume.id)} disabled={!!busy}><Download /> DOCX</Button>
          </div>
        </div>
      )}

      {saved.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="label-caps">Saved for this job</p>
          {saved.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-2 border-t pt-2">
              <span className="meta truncate">{new Date(r.createdAt).toLocaleDateString('en-IN')} · slop {r.slopScore ?? '–'}</span>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" onClick={() => get('pdf', r.id)}>PDF</Button>
                <Button size="sm" variant="outline" onClick={() => get('docx', r.id)}>DOCX</Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
