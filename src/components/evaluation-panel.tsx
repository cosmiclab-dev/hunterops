'use client';

import { useState } from 'react';
import { ClipboardCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/copy-button';
import { EmptyState, Pill, type Tone } from '@/components/kit';
import { api } from '@/lib/api-client';
import { DIMENSIONS } from '@/lib/career-ops/shared';
import type { Evaluation } from '@/lib/career-ops/evaluate';
import type { Signal } from '@/lib/career-ops/signals';
import { timeAgo } from '@/lib/utils';

type Data = Evaluation & { signals: Signal[]; liveness: { state: string; reason: string } };
export type ReportRow = { id: string; score: number | null; createdAt: string; model: string | null; data: Data };

const MATCH_LABEL = { strong: 'Strong', partial: 'Partial', missing: 'Missing', na: 'N/A' } as const;
const MATCH_TONE: Record<string, Tone> = { strong: 'success', partial: 'warning', missing: 'danger', na: 'muted' };
const SIGNAL_TONE: Record<Signal['tone'], Tone> = { good: 'success', mixed: 'warning', concern: 'danger', unknown: 'muted' };
const LEGIT = { high: ['Looks real and active', 'success'], caution: ['Proceed with caution', 'warning'], suspicious: ['Check before you invest time', 'danger'] } as const;

function scoreTone(s: number | null): Tone {
  if (s == null) return 'muted';
  if (s >= 4) return 'success';
  if (s >= 3.5) return 'warning';
  return 'danger';
}

function Block({ letter, title, children }: { letter: string; title: string; children: React.ReactNode }) {
  return (
    <section className="surface flex flex-col gap-3 p-4 md:p-5">
      <h3 className="flex items-baseline gap-2 text-[15px] font-semibold">
        <span className="font-mono text-xs text-muted-foreground">{letter}</span>{title}
      </h3>
      {children}
    </section>
  );
}

function List({ items }: { items: string[] }) {
  if (!items.length) return null;
  return <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm leading-6">{items.map((x, i) => <li key={i}>{x}</li>)}</ul>;
}

// Career-Ops A-H evaluation for one job: verdict first, then each block.
export function EvaluationPanel({ jobId, initial }: { jobId: string; initial: ReportRow | null }) {
  const [report, setReport] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');

  async function run() {
    setBusy(true);
    setErr('');
    setNote('');
    try {
      const out = await api<{ report: ReportRow; storiesAdded: number }>('/api/career-ops/evaluate', { method: 'POST', json: { jobId } });
      setReport(out.report);
      if (out.storiesAdded) setNote(`${out.storiesAdded} new interview stories saved to your story bank.`);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const button = <Button onClick={run} disabled={busy}>{busy ? 'Evaluating… (up to 3 min)' : report ? 'Evaluate again' : 'Run full evaluation'}</Button>;
  if (!report) {
    return (
      <div className="flex flex-col gap-3" data-testid="evaluation">
        <EmptyState icon={ClipboardCheck} title="Full A–H evaluation" action={button}>
          Checks the posting is still open, looks for reposts and layoffs, then scores the role 1–5 against your profile with a match table, pay read, interview stories and draft answers.
        </EmptyState>
        {err && <p className="text-sm text-destructive" role="alert">{err}</p>}
      </div>
    );
  }

  const e = report.data;
  const [legitLabel, legitTone] = LEGIT[e.legitimacy.tier];
  return (
    <div className="flex flex-col gap-4" data-testid="evaluation">
      <section className="surface flex flex-col gap-4 p-4 md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-4">
            <div className="text-center">
              <div className="text-[40px] font-bold leading-none tabular-nums" data-testid="eval-score">{e.score?.toFixed(1) ?? '–'}</div>
              <div className="meta mt-1">out of 5</div>
            </div>
            <div className="min-w-0">
              <Pill tone={scoreTone(e.score)}>{e.verdict.apply ? 'Apply' : 'Skip unless you have a reason'}</Pill>
              <p className="mt-2 font-semibold leading-6">{e.verdict.headline}</p>
            </div>
          </div>
          {button}
        </div>
        <p className="text-sm leading-6 text-muted-foreground">{e.verdict.why}</p>
        <div className="flex flex-wrap gap-2">
          <Pill tone={legitTone}>{legitLabel}</Pill>
          <Pill>Confidence: {e.confidence}</Pill>
          <Pill>{e.archetype.targeted ? e.archetype.name || 'Target role' : 'Not one of your target roles'}</Pill>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {(Object.keys(DIMENSIONS) as (keyof typeof DIMENSIONS)[]).map((k) => (
            <div key={k} className="rounded-xl bg-muted/60 px-3 py-2">
              <div className="text-xs text-muted-foreground">{DIMENSIONS[k]}</div>
              <div className="mt-0.5 font-semibold tabular-nums">{e.dimensions[k] ?? '–'}<span className="text-xs font-normal text-muted-foreground"> /5 · {e.evidence[k]}</span></div>
            </div>
          ))}
        </div>
        {e.confidenceGaps.length > 0 && <div><p className="label-caps text-muted-foreground">What could change this</p><List items={e.confidenceGaps} /></div>}
        <p className="meta">Evaluated {timeAgo(new Date(report.createdAt))}{report.model ? ` · ${report.model}` : ''}</p>
        {note && <p className="meta" role="status">{note}</p>}
        {err && <p className="text-sm text-destructive" role="alert">{err}</p>}
      </section>

      <Block letter="A" title="Role summary">
        <p className="text-sm leading-6">{e.summary.tldr}</p>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {([['Domain', e.summary.domain], ['Function', e.summary.function], ['Seniority', e.summary.seniority], ['Work mode', e.summary.workMode], ['Team', e.summary.teamSize]] as const).filter(([, v]) => v).map(([k, v]) => (
            <div key={k} className="flex gap-2"><dt className="w-24 shrink-0 text-muted-foreground">{k}</dt><dd className="min-w-0">{v}</dd></div>
          ))}
        </dl>
        <p className="text-sm leading-6"><span className="font-medium">Culture: {e.summary.culture.verdict}.</span> {e.summary.culture.evidence}</p>
        {e.flags.map((f, i) => <p key={i} className="rounded-lg bg-warning/10 px-3 py-2 text-sm leading-6"><span className="font-medium">{f.kind.replace(/_/g, ' ')}:</span> {f.quote}</p>)}
      </Block>

      <Block letter="B" title="Match with your CV">
        <ul className="divide-y divide-border rounded-xl border border-border">
          {e.match.rows.map((r, i) => (
            <li key={i} className="flex flex-col gap-1 px-3 py-2.5 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{r.requirement}</span>
                <Pill tone={MATCH_TONE[r.match]}>{MATCH_LABEL[r.match]}</Pill>
                <span className="text-xs text-muted-foreground">{r.importance.replace('_', ' ')} ({r.tier})</span>
              </div>
              {r.jdSignal && <p className="text-xs leading-5 text-muted-foreground">JD: “{r.jdSignal}”</p>}
              <p className="leading-6 text-muted-foreground">{r.evidence}</p>
            </li>
          ))}
        </ul>
        {e.match.dropped > 0 && <p className="meta">+{e.match.dropped} lower-importance requirements not listed.</p>}
        {e.match.gaps.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="label-caps text-muted-foreground">Gaps and how to cover them</p>
            {e.match.gaps.map((g, i) => (
              <div key={i} className="rounded-xl bg-muted/60 p-3 text-sm leading-6">
                <p className="font-medium">{g.requirement}{g.blocker ? ' · hard blocker' : ''}</p>
                <p><span className="text-muted-foreground">Risk:</span> {g.risk}</p>
                <p><span className="text-muted-foreground">Cover it:</span> {g.mitigation}</p>
              </div>
            ))}
          </div>
        )}
      </Block>

      <Block letter="C" title="Level and strategy">
        <p className="text-sm leading-6">The JD reads as <span className="font-medium">{e.level.detected || 'unclear'}</span>; your natural level is <span className="font-medium">{e.level.natural || 'unclear'}</span>.</p>
        <List items={e.level.sellSenior} />
        {e.level.ifDownleveled.length > 0 && <><p className="label-caps text-muted-foreground">If they offer a lower level</p><List items={e.level.ifDownleveled} /></>}
      </Block>

      <Block letter="D" title="Pay and demand">
        <p className="text-sm leading-6">Advertised: <span className="font-medium">{e.comp.advertised}</span> · {e.comp.companyType} · reliability {e.comp.reliability}</p>
        <List items={e.comp.notes} />
        {e.comp.hrQuestions.length > 0 && <><p className="label-caps text-muted-foreground">Ask HR</p><List items={e.comp.hrQuestions} /></>}
        {e.comp.demand && <p className="text-sm leading-6 text-muted-foreground">{e.comp.demand}</p>}
      </Block>

      <Block letter="E" title="What to change before applying">
        {[['CV', e.plan.cv], ['LinkedIn', e.plan.linkedin]].map(([label, items]) => (items as Evaluation['plan']['cv']).length > 0 && (
          <div key={label as string} className="flex flex-col gap-2">
            <p className="label-caps text-muted-foreground">{label as string}</p>
            {(items as Evaluation['plan']['cv']).map((x, i) => (
              <p key={i} className="text-sm leading-6"><span className="font-medium">{x.section}:</span> {x.change} <span className="text-muted-foreground">({x.why})</span></p>
            ))}
          </div>
        ))}
      </Block>

      <Block letter="F" title="Interview plan">
        {e.interview.stories.map((s, i) => (
          <details key={i} className="rounded-xl bg-muted/60 p-3 text-sm leading-6">
            <summary className="cursor-pointer font-medium">{s.title} <span className="font-normal text-muted-foreground">· for “{s.requirement}”</span></summary>
            <div className="mt-2 flex flex-col gap-1">
              <p><span className="text-muted-foreground">Situation:</span> {s.situation}</p>
              <p><span className="text-muted-foreground">Task:</span> {s.task}</p>
              <p><span className="text-muted-foreground">Action:</span> {s.action}</p>
              <p><span className="text-muted-foreground">Result:</span> {s.result}</p>
              <p><span className="text-muted-foreground">Reflection:</span> {s.reflection}</p>
            </div>
          </details>
        ))}
        {e.interview.caseStudy && <p className="text-sm leading-6"><span className="font-medium">Case study to present:</span> {e.interview.caseStudy}</p>}
        {e.interview.hardQuestions.map((q, i) => (
          <div key={i} className="text-sm leading-6"><p className="font-medium">“{q.question}”</p><p className="text-muted-foreground">{q.answer}</p></div>
        ))}
      </Block>

      <Block letter="G" title="Is the posting real and open?">
        <ul className="flex flex-col gap-2">
          {e.signals.map((s) => (
            <li key={s.id} className="flex items-start gap-2 text-sm leading-6">
              <Pill tone={SIGNAL_TONE[s.tone]} className="mt-0.5 shrink-0">{s.label}</Pill><span>{s.detail}</span>
            </li>
          ))}
        </ul>
        <List items={e.legitimacy.observations} />
        {e.risks.length > 0 && <><p className="label-caps text-muted-foreground">Risks</p><List items={e.risks} /></>}
      </Block>

      <Block letter="H" title="Draft answers for the application form">
        {e.answers.map((a, i) => (
          <div key={i} className="flex flex-col gap-1 text-sm leading-6">
            <div className="flex items-center justify-between gap-2"><p className="font-medium">{a.question}</p><CopyButton text={a.answer} /></div>
            <p className="whitespace-pre-wrap text-muted-foreground">{a.answer}</p>
          </div>
        ))}
        {e.keywords.length > 0 && <p className="text-sm leading-6"><span className="text-muted-foreground">Keywords to mirror:</span> {e.keywords.join(', ')}</p>}
      </Block>
    </div>
  );
}
