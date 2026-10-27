'use client';

import { useState } from 'react';
import { ArrowRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { CopyButton } from '@/components/copy-button';
import { SlopReportView } from '@/components/slop-checker';
import { api } from '@/lib/api-client';
import { scanSlop } from '@/lib/modules/anti-slop';

// Module C in the UI: paste anything, get ASD-STE100 plain English back.
export function PlainEnglish() {
  const [text, setText] = useState('');
  const [out, setOut] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function refine() {
    setBusy(true);
    setErr('');
    try {
      setOut((await api<{ text: string }>('/api/refine', { method: 'POST', json: { text } })).text);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4" data-testid="plain-english">
      <p className="text-sm leading-6 text-muted-foreground">Rewrites any text in ASD-STE100 Simplified Technical English: one idea per sentence, active voice, no jargon. Good for emails, LinkedIn notes and answers to application questions.</p>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-muted-foreground">Your text</p>
          <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={12} placeholder="Paste a draft…" aria-label="Text to simplify" />
          <SlopReportView report={scanSlop(text)} />
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-muted-foreground">Plain English</p>
          <div className="min-h-[248px] whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-sm leading-6" data-testid="plain-output">{out || <span className="text-muted-foreground">The rewrite appears here.</span>}</div>
          {out && <CopyButton text={out} className="self-start" />}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button onClick={refine} disabled={busy || !text.trim()}>{busy ? <Loader2 className="animate-spin" /> : <ArrowRight />} Rewrite in plain English</Button>
        {err && <p className="text-sm text-destructive" role="alert">{err}</p>}
      </div>
    </div>
  );
}
