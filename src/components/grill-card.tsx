'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Download, Flame, RefreshCw, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api, download } from '@/lib/api-client';
import { grillBand, type GrillResult } from '@/lib/modules/grill';
import { cn } from '@/lib/utils';

const BAND_STROKE = { red: '#C9343E', yellow: '#B7791F', green: '#2F8A4C' } as const;
const BAND_TEXT = { red: 'text-grill-red', yellow: 'text-grill-yellow', green: 'text-grill-green' } as const;
const BAND_LABEL = { red: 'Weak match', yellow: 'Possible match', green: 'Strong match' } as const;

// Radial 0-100 gauge, coloured by the Grill band.
export function ScoreGauge({ score, size = 148 }: { score: number | null; size?: number }) {
  const r = size / 2 - 10;
  const c = 2 * Math.PI * r;
  const band = score === null ? null : grillBand(score);
  const pct = score === null ? 0 : Math.max(0, Math.min(100, score)) / 100;
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }} data-testid="score-gauge" data-band={band ?? 'none'} aria-label={score === null ? 'Not grilled yet' : `Match score ${score} out of 100`} role="img">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth={10} />
        {band && (
          <circle
            cx={size / 2} cy={size / 2} r={r} fill="none" stroke={BAND_STROKE[band]} strokeWidth={10} strokeLinecap="round"
            strokeDasharray={c} strokeDashoffset={c * (1 - pct)} style={{ transition: 'stroke-dashoffset 600ms ease' }}
          />
        )}
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className={cn('text-4xl font-semibold tabular-nums tracking-tight', band ? BAND_TEXT[band] : 'text-muted-foreground')}>{score ?? '–'}</span>
        <span className="text-xs text-muted-foreground">{band ? BAND_LABEL[band] : 'Not scored'}</span>
      </div>
    </div>
  );
}

function Dimension({ label, score, max, note }: { label: string; score: number; max: number; note?: string }) {
  const ratio = max ? score / max : 0;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-muted-foreground"><span className="font-medium text-foreground">{score}</span> / {max}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className={cn('h-full rounded-full', ratio >= 0.75 ? 'bg-grill-green' : ratio >= 0.5 ? 'bg-grill-yellow' : 'bg-grill-red')} style={{ width: `${Math.round(ratio * 100)}%` }} />
      </div>
      {note && <p className="text-xs leading-5 text-muted-foreground">{note}</p>}
    </div>
  );
}

type Tailored = { resume: { id: string; name: string }; pages: number };

// The Grill card: match score, the four career-ops dimensions, missing keywords
// and one-tap resume generation for this job.
export function GrillCard({ g, jobId, compact = false, onRegrill }: { g: GrillResult | null; jobId?: string; compact?: boolean; onRegrill?: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [made, setMade] = useState<Tailored | null>(null);

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

  const generate = () => run('resume', async () => {
    const out = await api<Tailored>('/api/resume/tailor', { method: 'POST', json: { jobId } });
    setMade(out);
    await download('/api/resume/render', { format: 'pdf', resumeId: out.resume.id }, 'Resume.pdf');
  });
  const regrill = () => run('grill', async () => {
    await api(`/api/jobs/${jobId}/grill`, { method: 'POST' });
    onRegrill ? onRegrill() : router.refresh();
  });

  const missing = g ? (g.missingKeywords ?? [...g.skills.missing]) : [];
  return (
    <section className="surface flex flex-col" data-testid="grill-card">
      <div className="flex items-center justify-between border-b px-5 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold"><Flame className="h-4 w-4 text-primary" /> The Grill</h2>
        {jobId && <Button size="sm" variant="ghost" onClick={regrill} disabled={!!busy}><RefreshCw className={busy === 'grill' ? 'animate-spin' : ''} /> Re-grill</Button>}
      </div>
      <div className={cn('flex gap-6 p-5', compact ? 'flex-col items-center' : 'flex-col items-center sm:flex-row sm:items-start')}>
        <ScoreGauge score={g?.score ?? null} size={compact ? 132 : 148} />
        {g ? (
          <div className="flex w-full flex-1 flex-col gap-4" data-testid="grill-breakdown">
            <Dimension label="Hard skills" score={g.skills.score} max={g.skills.max} note={g.skills.note} />
            <Dimension label="Experience" score={g.experience.score} max={g.experience.max} note={g.experience.reason} />
            <Dimension label="Location fit" score={g.location.score} max={g.location.max} note={g.location.reason} />
            {g.salary && <Dimension label="Salary fit" score={g.salary.score} max={g.salary.max} note={g.salary.reason} />}
          </div>
        ) : (
          <p className="flex-1 text-sm leading-6 text-muted-foreground">
            Not scored yet. Upload your CV on the <a href="/" className="font-medium text-foreground underline">Home</a> page and every job is scored against it.
          </p>
        )}
      </div>
      {g && (
        <div className="flex flex-col gap-3 border-t px-5 py-4">
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Missing keywords {missing.length ? `(${missing.length})` : ''}</p>
            <div className="flex flex-wrap gap-1.5" data-testid="missing-keywords">
              {missing.length ? missing.map((k) => (
                <span key={k} className="rounded-md border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">{k}</span>
              )) : <span className="text-xs text-muted-foreground">None. Every skill the JD names is in your profile.</span>}
            </div>
          </div>
          {g.skills.matched.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">Matched</p>
              <div className="flex flex-wrap gap-1.5">
                {[...g.skills.matched, ...(g.skills.nice?.matched ?? [])].map((k) => (
                  <span key={k} className="rounded-md border border-success/30 bg-success/10 px-2 py-0.5 text-xs font-medium text-success">{k}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      {jobId && (
        <div className="flex flex-col gap-2 border-t px-5 py-4">
          <Button onClick={generate} disabled={!!busy} data-testid="generate-resume">
            <Wand2 /> {busy === 'resume' ? 'Generating resume… (up to a minute)' : 'Generate resume'}
          </Button>
          {made && (
            <button type="button" className="inline-flex items-center gap-1.5 text-xs font-medium text-primary" onClick={() => run('pdf', () => download('/api/resume/render', { format: 'pdf', resumeId: made.resume.id }, 'Resume.pdf'))}>
              <Download className="h-3.5 w-3.5" /> {made.resume.name} · {made.pages} page{made.pages > 1 ? 's' : ''}
            </button>
          )}
          {err && <p className="text-sm text-destructive" role="alert">{err}</p>}
        </div>
      )}
    </section>
  );
}
