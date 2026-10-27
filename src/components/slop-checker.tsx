'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { scanSlop, applySafeFixes, type SlopReport } from '@/lib/modules/anti-slop';

// Module A in the browser: the same code the server runs, so results match.
export function SlopReportView({ report }: { report: SlopReport }) {
  if (report.clean) return <p className="meta" data-testid="slop-clean">Anti-Slop: clean (100/100)</p>;
  return (
    <div className="flex flex-col gap-2" data-testid="slop-report">
      <p className="meta">Anti-Slop: {report.score}/100 · {report.hits.length} flagged</p>
      <ul className="flex flex-col gap-2">
        {report.hits.map((h, i) => (
          <li key={`${h.index}-${i}`} className="border-l-2 border-ink pl-3 text-sm leading-5">
            <span className="font-semibold">“{h.match}”</span> {h.replacement ? <>→ “{h.replacement}”. </> : ' '}{h.why}
            <span className="meta block">{h.context}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SlopChecker({ initial = '' }: { initial?: string }) {
  const [text, setText] = useState(initial);
  const report = scanSlop(text);
  return (
    <div className="flex flex-col gap-3">
      <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} placeholder="Paste a cover note, LinkedIn message or resume bullet" aria-label="Text to check" />
      {text.trim() && <SlopReportView report={report} />}
      {text.trim() && report.hits.some((h) => h.replacement) && (
        <Button variant="outline" size="sm" className="self-start" onClick={() => setText(applySafeFixes(text).text)}>Apply simple swaps</Button>
      )}
    </div>
  );
}
