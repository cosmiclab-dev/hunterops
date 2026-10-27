import type { GrillResult } from '@/lib/modules/grill';
import { Badge } from '@/components/ui/badge';
import { GrillScoreBadge } from '@/components/grill-score-badge';

function Bar({ score, max }: { score: number; max: number }) {
  return (
    <div className="h-1 w-full bg-rule" aria-hidden>
      <div className="h-1 bg-ink" style={{ width: `${Math.round((score / max) * 100)}%` }} />
    </div>
  );
}

function Row({ label, score, max, children }: { label: string; score: number; max: number; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-t py-3">
      <div className="flex items-baseline justify-between">
        <span className="label-caps">{label}</span>
        <span className="meta tabular-nums">{score} / {max}</span>
      </div>
      <Bar score={score} max={max} />
      {children}
    </div>
  );
}

export function GrillBreakdown({ g }: { g: GrillResult }) {
  return (
    <section className="flex flex-col" data-testid="grill-breakdown">
      <div className="flex items-center gap-4 pb-4">
        <GrillScoreBadge score={g.score} size="lg" />
        <div>
          <h2 className="text-lg font-semibold">The Grill</h2>
          <p className="meta">Skills 40 · Location 20 · Experience 20 · Nice-to-haves 20</p>
        </div>
      </div>
      <Row label="Skills match" score={g.skills.score} max={g.skills.max}>
        {g.skills.note && <p className="text-sm leading-5">{g.skills.note}</p>}
        <div className="flex flex-wrap gap-1">
          {g.skills.matched.map((s) => <Badge key={s}>{s}</Badge>)}
          {g.skills.missing.map((s) => <Badge key={s} className="border-dashed opacity-60" title="In the JD, not in your profile">{s}</Badge>)}
        </div>
      </Row>
      <Row label="Location fit" score={g.location.score} max={g.location.max}>
        <p className="text-sm leading-5">{g.location.reason}</p>
      </Row>
      <Row label="Experience" score={g.experience.score} max={g.experience.max}>
        <p className="text-sm leading-5">{g.experience.reason}</p>
      </Row>
      <Row label={g.keywords.source === 'nice_to_have' ? 'Nice-to-haves' : 'JD keywords (no nice-to-have list)'} score={g.keywords.score} max={g.keywords.max}>
        <div className="flex flex-wrap gap-1">
          {g.keywords.matched.map((s) => <Badge key={s}>{s}</Badge>)}
          {g.keywords.missing.map((s) => <Badge key={s} className="border-dashed opacity-60">{s}</Badge>)}
          {!g.keywords.matched.length && !g.keywords.missing.length && <p className="text-sm leading-5">No recognisable keywords in that part of the JD.</p>}
        </div>
      </Row>
    </section>
  );
}
