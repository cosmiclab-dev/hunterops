import Link from 'next/link';
import {
  ArrowRight, BellRing, Bookmark, Briefcase, CalendarClock, Columns3, Flame, Handshake, MessageSquareText, Radar, Send, Sparkles, Target, Trophy, UserRound,
} from 'lucide-react';
import { prisma } from '@/lib/db';
import { EmptyState, IconChip, PageHeader, Pill, Section, StatTile } from '@/components/kit';
import { GrillScoreBadge } from '@/components/grill-score-badge';
import { ScanButton } from '@/components/scan-button';
import { cn, timeAgo } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const DAY = 86_400_000;
// The person's goal: an offer before the end of the year.
const GOAL_DATE = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), 11, 31, 18, 29));

function istDayKey(d: Date) {
  return new Date(d.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);
}

export default async function Dashboard() {
  const now = new Date();
  const since14 = new Date(now.getTime() - 13 * DAY);
  const [counts, profile, fresh, followUps, staleApplied, appliedDates, sentDates, lastRun, outreachCount] = await Promise.all([
    prisma.job.groupBy({ by: ['status'], _count: true }),
    prisma.profile.findFirst({ select: { name: true, skills: true } }),
    prisma.job.findMany({
      where: { status: 'NEW', firstSeenAt: { gte: new Date(now.getTime() - DAY) } },
      orderBy: [{ grillScore: { sort: 'desc', nulls: 'last' } }, { firstSeenAt: 'desc' }],
      take: 5,
      select: { id: true, title: true, company: true, location: true, grillScore: true, firstSeenAt: true, postedAt: true, source: true },
    }),
    prisma.outreach.findMany({
      where: { status: 'sent', followUpAt: { lte: new Date(now.getTime() + DAY) } },
      orderBy: { followUpAt: 'asc' },
      take: 5,
      select: { id: true, company: true, recipientRole: true, recipientName: true, followUpAt: true },
    }),
    prisma.job.findMany({
      where: { status: 'APPLIED', appliedAt: { lte: new Date(now.getTime() - 7 * DAY) } },
      orderBy: { appliedAt: 'asc' },
      take: 5,
      select: { id: true, title: true, company: true, appliedAt: true },
    }),
    prisma.job.findMany({ where: { appliedAt: { gte: since14 } }, select: { appliedAt: true } }),
    prisma.outreach.findMany({ where: { sentAt: { gte: since14 } }, select: { sentAt: true } }),
    prisma.scanRun.findFirst({ orderBy: { startedAt: 'desc' }, select: { startedAt: true, inserted: true } }),
    prisma.outreach.count({ where: { status: { in: ['sent', 'replied'] } } }),
  ]);
  const n = (s: string[]) => counts.filter((c) => s.includes(c.status)).reduce((a, c) => a + c._count, 0);
  const daysLeft = Math.max(0, Math.ceil((GOAL_DATE(now).getTime() - now.getTime()) / DAY));
  const firstName = profile?.name?.split(' ')[0];
  const hour = Number(now.toLocaleString('en-IN', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kolkata' }));
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  // 14-day activity: applications and outreach sent, per IST day.
  const days = Array.from({ length: 14 }, (_, i) => istDayKey(new Date(since14.getTime() + i * DAY)));
  const tally = (dates: (Date | null)[]) => {
    const m = new Map<string, number>();
    for (const d of dates) if (d) m.set(istDayKey(d), (m.get(istDayKey(d)) || 0) + 1);
    return days.map((k) => m.get(k) || 0);
  };
  const apps = tally(appliedDates.map((a) => a.appliedAt));
  const msgs = tally(sentDates.map((s) => s.sentAt));
  const peak = Math.max(1, ...apps.map((a, i) => a + msgs[i]));
  const weekTotal = apps.slice(7).reduce((a, b) => a + b, 0) + msgs.slice(7).reduce((a, b) => a + b, 0);

  const pipeline = [
    { label: 'Saved', value: n(['SAVED']), tone: 'bg-info' },
    { label: 'Applied', value: n(['APPLIED']), tone: 'bg-primary' },
    { label: 'Interview', value: n(['INTERVIEW']), tone: 'bg-warning' },
    { label: 'Offer', value: n(['OFFER']), tone: 'bg-success' },
  ];
  const pipeTotal = Math.max(1, pipeline.reduce((a, p) => a + p.value, 0));
  const nudges = followUps.length + staleApplied.length;

  return (
    <div className="flex flex-col gap-8">
      <div className="hero-glow -mx-4 -mt-5 px-4 pb-2 pt-5 md:-mx-8 md:-mt-8 md:rounded-b-3xl md:px-8 md:pt-8">
        <PageHeader
          eyebrow={now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' })}
          title={`${greet}${firstName ? `, ${firstName}` : ''}`}
          sub={lastRun ? <>Last scan {timeAgo(lastRun.startedAt)} · {lastRun.inserted ?? 0} new jobs</> : 'No scans yet. Run your first scan to fill the board.'}
          action={<ScanButton />}
        />
        <div className="mt-5 grid grid-cols-[auto_1fr] items-center gap-4 rounded-2xl border bg-card/70 p-4 backdrop-blur">
          <div className="grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-primary to-info text-primary-foreground">
            <div className="text-center">
              <div className="text-2xl font-extrabold leading-none tabular-nums">{daysLeft}</div>
              <div className="mt-0.5 text-[9px] font-bold uppercase tracking-wider">days</div>
            </div>
          </div>
          <div className="min-w-0">
            <p className="font-semibold leading-6">to your 31 December offer goal</p>
            <p className="text-sm leading-5 text-muted-foreground">
              {weekTotal} applications and messages in the last 7 days. Aim for 15 or more a week.
            </p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-gradient-to-r from-primary to-info" style={{ width: `${Math.min(100, Math.round((weekTotal / 15) * 100))}%` }} />
            </div>
          </div>
        </div>
      </div>

      {!profile && (
        <Link href="/profile" className="surface flex items-center gap-3 border-primary/40 p-4">
          <IconChip icon={UserRound} />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Import your resume first</p>
            <p className="text-sm text-muted-foreground">Grill Scores, tailored resumes and messages all read from it.</p>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
        </Link>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="New jobs" value={n(['NEW'])} hint={`${fresh.length} in the last 24h`} icon={Flame} tone="danger" href="/jobs?view=new" />
        <StatTile label="Applied" value={n(['APPLIED', 'INTERVIEW', 'OFFER'])} hint="all time" icon={Send} tone="primary" href="/pipeline" />
        <StatTile label="Interviews" value={n(['INTERVIEW'])} hint={n(['OFFER']) ? `${n(['OFFER'])} offer${n(['OFFER']) > 1 ? 's' : ''}` : 'keep going'} icon={Trophy} tone="warning" href="/pipeline" />
        <StatTile label="Outreach sent" value={outreachCount} hint={nudges ? `${nudges} follow-up${nudges > 1 ? 's' : ''} due` : 'none due'} icon={MessageSquareText} tone="info" href="/outreach?tab=log" />
      </div>

      <div className="grid gap-8 md:grid-cols-[1.4fr_1fr]">
        <Section title="Fresh in the last 24 hours" action={<Link href="/jobs?view=new&sort=score" className="text-sm font-semibold text-primary">All jobs</Link>}>
          {fresh.length ? (
            <div className="surface divide-y overflow-hidden">
              {fresh.map((j) => (
                <Link key={j.id} href={`/jobs/${j.id}`} className="flex items-center gap-3 p-3 transition-colors hover:bg-accent/60">
                  <GrillScoreBadge score={j.grillScore} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold leading-5">{j.title}</p>
                    <p className="truncate text-sm text-muted-foreground">{j.company}{j.location ? ` · ${j.location}` : ''}</p>
                  </div>
                  <span className="meta shrink-0">{timeAgo(j.postedAt || j.firstSeenAt)}</span>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState icon={Radar} title="Nothing new today yet" action={<Link href="/discover" className="text-sm font-semibold text-primary">Run an X-Ray search</Link>}>
              The scanner checks company boards every morning at 8:00. You can also scan now or search the ATS sites directly.
            </EmptyState>
          )}
        </Section>

        <div className="flex flex-col gap-8">
          <Section title="Pipeline" action={<Link href="/pipeline" className="text-sm font-semibold text-primary">Open board</Link>}>
            <div className="surface flex flex-col gap-4 p-4">
              <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
                {pipeline.map((p) => p.value > 0 && <div key={p.label} className={p.tone} style={{ width: `${(p.value / pipeTotal) * 100}%` }} />)}
              </div>
              <div className="grid grid-cols-4 gap-2">
                {pipeline.map((p) => (
                  <div key={p.label}>
                    <div className="flex items-center gap-1.5"><i className={cn('h-2 w-2 rounded-full', p.tone)} /><span className="text-xs text-muted-foreground">{p.label}</span></div>
                    <div className="mt-1 text-xl font-bold tabular-nums">{p.value}</div>
                  </div>
                ))}
              </div>
            </div>
          </Section>

          <Section title="Last 14 days">
            <div className="surface p-4">
              <div className="flex h-24 items-end gap-1.5" role="img" aria-label="Applications and outreach per day">
                {days.map((d, i) => (
                  <div key={d} className="flex flex-1 flex-col justify-end gap-0.5" title={`${d}: ${apps[i]} applied, ${msgs[i]} messages`}>
                    {msgs[i] > 0 && <div className="rounded-sm bg-info" style={{ height: `${(msgs[i] / peak) * 80}px` }} />}
                    {apps[i] > 0 && <div className="rounded-sm bg-primary" style={{ height: `${(apps[i] / peak) * 80}px` }} />}
                    {apps[i] + msgs[i] === 0 && <div className="h-1 rounded-sm bg-muted" />}
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-primary" /> Applied</span>
                <span className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-info" /> Messages sent</span>
              </div>
            </div>
          </Section>
        </div>
      </div>

      <Section title="Follow-ups due">
        {nudges ? (
          <div className="surface divide-y overflow-hidden">
            {followUps.map((f) => (
              <Link key={f.id} href="/outreach?tab=log" className="flex items-center gap-3 p-3 hover:bg-accent/60">
                <IconChip icon={BellRing} tone="warning" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold leading-5">Follow up with {f.recipientName || f.recipientRole}</p>
                  <p className="truncate text-sm text-muted-foreground">{f.company}</p>
                </div>
                <Pill tone={f.followUpAt && f.followUpAt < now ? 'danger' : 'warning'}>{f.followUpAt && f.followUpAt < now ? 'overdue' : 'today'}</Pill>
              </Link>
            ))}
            {staleApplied.map((j) => (
              <Link key={j.id} href={`/jobs/${j.id}`} className="flex items-center gap-3 p-3 hover:bg-accent/60">
                <IconChip icon={CalendarClock} tone="info" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold leading-5">No reply from {j.company}</p>
                  <p className="truncate text-sm text-muted-foreground">Applied {timeAgo(j.appliedAt)} · {j.title}</p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Nothing due. When you log a sent message, HunterOps reminds you to follow up after 5 days.</p>
        )}
      </Section>

      <Section title="Quick actions">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { href: '/discover', icon: Radar, title: 'X-Ray search', sub: '5 ATS, last 24h', tone: 'primary' as const },
            { href: '/outreach', icon: Handshake, title: 'Write outreach', sub: '3 scripts, under 60 words', tone: 'info' as const },
            { href: '/profile?tab=roast', icon: Sparkles, title: 'Roast my CV', sub: 'Duty to metric rewrite', tone: 'warning' as const },
            { href: '/pipeline', icon: Columns3, title: 'Pipeline', sub: 'Move jobs through stages', tone: 'success' as const },
            { href: '/jobs?view=saved', icon: Bookmark, title: 'Saved jobs', sub: `${n(['SAVED'])} waiting`, tone: 'muted' as const },
            { href: '/outreach?tab=gap', icon: Target, title: 'Gap scripts', sub: 'Email and phone screen', tone: 'muted' as const },
            { href: '/jobs', icon: Briefcase, title: 'Job board', sub: 'Grill-scored feed', tone: 'muted' as const },
            { href: '/profile', icon: UserRound, title: 'Profile', sub: profile?.skills.length ? `${profile.skills.length} skills` : 'Import resume', tone: 'muted' as const },
          ].map((a) => (
            <Link key={a.href + a.title} href={a.href} className="surface flex flex-col gap-3 p-4 transition-colors hover:border-primary/40">
              <IconChip icon={a.icon} tone={a.tone} />
              <div>
                <p className="font-semibold leading-5">{a.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{a.sub}</p>
              </div>
            </Link>
          ))}
        </div>
      </Section>
    </div>
  );
}
