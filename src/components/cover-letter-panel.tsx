'use client';

import { useState } from 'react';
import { FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { CopyButton } from '@/components/copy-button';
import { SlopReportView } from '@/components/slop-checker';
import { api } from '@/lib/api-client';
import { scanSlop } from '@/lib/modules/anti-slop';

const FRAMEWORKS = [
  { id: 'AIDA', label: 'AIDA', hint: 'Attention, Interest, Desire, Action' },
  { id: 'PAS', label: 'PAS', hint: 'Problem, Agitation, Solution' },
] as const;

// Cover letter for one job (Module B), saved with the job's artifacts.
export function CoverLetterPanel({ jobId, initial }: { jobId: string; initial: string | null }) {
  const [framework, setFramework] = useState<'AIDA' | 'PAS'>('AIDA');
  const [text, setText] = useState(initial ?? '');
  const [subject, setSubject] = useState('');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');

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

  const write = () => run('write', async () => {
    const out = await api<{ coverLetter: { subject: string; body: string } }>('/api/draft-email', { method: 'POST', json: { jobId, framework } });
    setText(out.coverLetter.body);
    setSubject(out.coverLetter.subject);
  });
  const plain = () => run('plain', async () => {
    const out = await api<{ text: string }>('/api/refine', { method: 'POST', json: { text } });
    setText(out.text);
  });

  return (
    <div className="flex flex-col gap-4" data-testid="cover-letter">
      <div className="flex flex-wrap items-center gap-2">
        {FRAMEWORKS.map((f) => (
          <button key={f.id} type="button" className="chip" data-on={framework === f.id} onClick={() => setFramework(f.id)} title={f.hint}>{f.label}</button>
        ))}
        <span className="text-xs text-muted-foreground">{FRAMEWORKS.find((f) => f.id === framework)?.hint}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={write} disabled={!!busy}><FileText /> {busy === 'write' ? 'Writing…' : text ? 'Write again' : 'Write cover letter'}</Button>
        {text && <Button variant="outline" onClick={plain} disabled={!!busy}>{busy === 'plain' ? 'Simplifying…' : 'Plain English'}</Button>}
        {text && <CopyButton text={subject ? `${subject}\n\n${text}` : text} label="Copy" />}
      </div>
      {err && <p className="text-sm text-destructive" role="alert">{err}</p>}
      {text ? (
        <>
          {subject && <p className="text-sm"><span className="text-muted-foreground">Subject:</span> <span className="font-medium">{subject}</span></p>}
          <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={12} aria-label="Cover letter" />
          <SlopReportView report={scanSlop(text)} />
        </>
      ) : (
        <p className="text-sm text-muted-foreground">A short cover letter from your profile and this job description. Banned AI phrases are rejected before it is saved.</p>
      )}
    </div>
  );
}
