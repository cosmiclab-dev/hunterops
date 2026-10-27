'use client';

import { useState } from 'react';
import { ArrowDown, Flame, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { CopyButton } from '@/components/copy-button';
import { EmptyState, IconChip, Pill } from '@/components/kit';
import { api } from '@/lib/api-client';

type Roast = {
  critique: { original: string; why: string; verdict: string; rewrite: string }[];
  rewrites: { focus: string; bullet: string }[];
  summary: string;
  weakPhrases: string[];
};

const VERDICT_TONE: Record<string, 'success' | 'warning' | 'danger'> = { keep: 'success', rewrite: 'warning', cut: 'danger' };

export function ProfileRoaster({ seed }: { seed: string }) {
  const [bullets, setBullets] = useState(seed);
  const [domain, setDomain] = useState('');
  const [target, setTarget] = useState('GCCs, product companies, Tier-1 IT');
  const [out, setOut] = useState<Roast | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function roast(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      setOut(await api<Roast>('/api/roast', { method: 'POST', json: { bullets, domain, target } }));
      setTimeout(() => document.getElementById('roast-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const allBullets = out ? [...out.critique.filter((c) => c.verdict.toLowerCase() !== 'cut').map((c) => c.rewrite), ...out.rewrites.map((r) => r.bullet)].filter(Boolean) : [];

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={roast} className="surface flex flex-col gap-4 p-4 md:p-5">
        <div className="flex items-center gap-3">
          <IconChip icon={Flame} tone="danger" />
          <div>
            <p className="font-bold leading-5">Capgemini profile roaster</p>
            <p className="text-sm text-muted-foreground">A TA Director&apos;s red-line audit: duty language out, enterprise metrics in.</p>
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="r-bullets">Your bullets (one per line)</Label>
          <Textarea id="r-bullets" rows={7} value={bullets} onChange={(e) => setBullets(e.target.value)} placeholder={'Responsible for end-to-end recruitment for IT roles\nHandled stakeholder meetings and candidate screening'} />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="r-domain">What you hired for</Label>
            <Input id="r-domain" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="Cloud, data, Java, leadership…" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="r-target">Target employers</Label>
            <Input id="r-target" value={target} onChange={(e) => setTarget(e.target.value)} />
          </div>
        </div>
        <Button type="submit" disabled={busy || bullets.trim().length < 10} className="self-start">
          {busy ? <Loader2 className="animate-spin" /> : <Sparkles />} {busy ? 'Auditing…' : 'Roast my bullets'}
        </Button>
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      </form>

      {out ? (
        <div id="roast-results" className="flex scroll-mt-20 flex-col gap-6">
          {out.weakPhrases.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="section-title mr-1">Weak phrases found</span>
              {out.weakPhrases.map((p) => <Pill key={p} tone="danger">{p}</Pill>)}
            </div>
          )}

          <section className="flex flex-col gap-3">
            <h2 className="text-base font-bold">Red-line critique</h2>
            {out.critique.map((c, i) => (
              <div key={i} className="surface grid overflow-hidden md:grid-cols-2" data-testid="roast-row">
                <div className="flex flex-col gap-2 border-b bg-destructive/5 p-4 md:border-b-0 md:border-r">
                  <div className="flex items-center gap-2">
                    <span className="label-caps text-destructive">Before</span>
                    <Pill tone={VERDICT_TONE[c.verdict.toLowerCase()] || 'warning'} className="ml-auto">{c.verdict}</Pill>
                  </div>
                  <p className="text-sm leading-6 line-through decoration-destructive/40">{c.original}</p>
                  <p className="text-xs leading-5 text-muted-foreground">{c.why}</p>
                </div>
                <div className="flex flex-col gap-2 bg-success/5 p-4">
                  <div className="flex items-center gap-2">
                    <span className="label-caps text-success">After</span>
                    {c.rewrite && <CopyButton text={c.rewrite} label="" className="ml-auto h-8 w-8 px-0" aria-label="Copy rewrite" />}
                  </div>
                  <p className="text-sm font-medium leading-6">{c.rewrite || 'Cut this bullet.'}</p>
                </div>
              </div>
            ))}
          </section>

          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold">Five enterprise-metric bullets</h2>
              <CopyButton text={allBullets.map((b) => `• ${b}`).join('\n')} label="Copy all" />
            </div>
            <div className="surface divide-y">
              {out.rewrites.map((r, i) => (
                <div key={i} className="flex items-start gap-3 p-4">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-sm font-bold text-primary">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="label-caps text-muted-foreground">{r.focus}</p>
                    <p className="mt-1 text-sm font-medium leading-6">{r.bullet}</p>
                  </div>
                  <CopyButton text={r.bullet} label="" className="h-8 w-8 shrink-0 px-0" aria-label="Copy bullet" />
                </div>
              ))}
            </div>
          </section>

          {out.summary && (
            <section className="surface hero-glow flex flex-col gap-3 p-4 md:p-5">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold">Immediate-availability summary</h2>
                <CopyButton text={out.summary} className="ml-auto" />
              </div>
              <p className="text-[15px] leading-7">{out.summary}</p>
              <p className="text-xs text-muted-foreground">Paste it into the Summary field on the Profile tab, then Save, and every tailored resume uses it.</p>
            </section>
          )}
          <p className="text-xs text-muted-foreground">Anything in [brackets] is a number only you know. Fill it with a figure you can defend in an interview.</p>
        </div>
      ) : (
        <EmptyState icon={ArrowDown} title="Before and after, side by side">
          Each bullet gets a verdict, the reason a hiring manager would pass, and a rewrite: action, volume, channel, outcome. Plus five new metric bullets and a 3-line summary.
        </EmptyState>
      )}
    </div>
  );
}
