'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { BellRing, Check, CheckCheck, Clock3, History, Loader2, MessageCircleReply, PenLine, Phone, Mail, Save, Send, ShieldQuestion, Sparkles, Trash2 } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { CopyButton } from '@/components/copy-button';
import { EmptyState, IconChip, Pill } from '@/components/kit';
import { api } from '@/lib/api-client';
import { cn, timeAgo, wordCount } from '@/lib/utils';

export type LogItem = {
  id: string; company: string; recipientName: string | null; recipientRole: string; channel: string; kind: string;
  message: string; status: string; sentAt: string | null; followUpAt: string | null; createdAt: string;
  job: { id: string; title: string } | null;
};
type Script = { kind: string; label: string; message: string; words: number; slop: number };

const KIND_ROLE: Record<string, string> = { head_of_ta: 'Head of TA', peer_referral: 'Peer recruiter', practice_head: 'Practice Head' };
const CHANNELS = { linkedin_dm: 'LinkedIn DM', email: 'Email', referral: 'Referral', other: 'Other' } as const;

export function OutreachWorkspace({ initialTab, log, job }: { initialTab: string; log: LogItem[]; job: { id: string; title: string; company: string } | null }) {
  const router = useRouter();
  const [tab, setTab] = useState(initialTab);
  const due = log.filter((l) => l.status === 'sent' && l.followUpAt && new Date(l.followUpAt).getTime() < Date.now() + 86_400_000).length;
  return (
    <Tabs value={tab} onValueChange={(v) => { setTab(v); router.replace(`/outreach?tab=${v}${job ? `&jobId=${job.id}` : ''}`, { scroll: false }); }}>
      <div className="scroll-x">
        <TabsList>
          <TabsTrigger value="write"><PenLine /> Write</TabsTrigger>
          <TabsTrigger value="gap"><ShieldQuestion /> Gap scripts</TabsTrigger>
          <TabsTrigger value="log">
            <History /> Log
            {due > 0 && <span className="ml-1 rounded-full bg-warning px-1.5 text-[10px] font-bold text-background">{due}</span>}
          </TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="write"><Writer job={job} onLogged={() => router.refresh()} /></TabsContent>
      <TabsContent value="gap"><GapScripts /></TabsContent>
      <TabsContent value="log"><Log items={log} /></TabsContent>
    </Tabs>
  );
}

function Writer({ job, onLogged }: { job: { id: string; title: string; company: string } | null; onLogged: () => void }) {
  const [f, setF] = useState({ company: job?.company ?? '', role: job?.title ?? '', recipientName: '', recipientTitle: '', req: '' });
  const [scripts, setScripts] = useState<Script[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await api<{ scripts: Script[] }>('/api/outreach', { method: 'POST', json: { ...f, jobId: job?.id } });
      setScripts(r.scripts);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <form onSubmit={generate} className="surface flex h-fit flex-col gap-3 p-4 md:p-5">
        <div className="flex items-center gap-3">
          <IconChip icon={Sparkles} />
          <div>
            <p className="font-semibold leading-5">Three messages, under 60 words each</p>
            <p className="text-xs text-muted-foreground">Head of TA · Peer referral · Practice Head</p>
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="o-company">Company</Label>
          <Input id="o-company" required value={f.company} onChange={set('company')} placeholder="e.g. Atlassian" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="o-role">Role</Label>
          <Input id="o-role" value={f.role} onChange={set('role')} placeholder="Senior Recruiter" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="o-name">Their name</Label>
            <Input id="o-name" value={f.recipientName} onChange={set('recipientName')} placeholder="Optional" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="o-title">Their title</Label>
            <Input id="o-title" value={f.recipientTitle} onChange={set('recipientTitle')} placeholder="Head of TA" />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="o-req">Req details or link</Label>
          <Textarea id="o-req" rows={3} value={f.req} onChange={set('req')} placeholder="Paste the posting link or a line about the opening" />
        </div>
        {job && <p className="text-xs text-muted-foreground">Linked to <Link href={`/jobs/${job.id}`} className="font-semibold text-primary">{job.title}</Link>; the JD is used automatically.</p>}
        <Button type="submit" disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <Sparkles />} {busy ? 'Writing…' : scripts.length ? 'Write again' : 'Write messages'}</Button>
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      </form>

      <div className="flex flex-col gap-3">
        {scripts.length ? scripts.map((s) => <ScriptCard key={s.kind} s={s} company={f.company} recipientName={f.recipientName} jobId={job?.id} onLogged={onLogged} />) : (
          <EmptyState icon={Send} title="Your messages appear here">
            Each one follows: a specific observation, one line of Capgemini-scale proof, your 0-day joining advantage, and one small ask. Copy it, send it on LinkedIn, then tap Mark sent.
          </EmptyState>
        )}
      </div>
    </div>
  );
}

function ScriptCard({ s, company, recipientName, jobId, onLogged }: { s: Script; company: string; recipientName: string; jobId?: string; onLogged: () => void }) {
  const [text, setText] = useState(s.message);
  const [channel, setChannel] = useState<keyof typeof CHANNELS>(s.kind === 'peer_referral' ? 'referral' : 'linkedin_dm');
  const [saved, setSaved] = useState<'' | 'drafted' | 'sent'>('');
  const [error, setError] = useState('');
  const words = wordCount(text);

  async function log(status: 'drafted' | 'sent') {
    setError('');
    try {
      await api('/api/outreach/log', {
        method: 'POST',
        json: { company, recipientRole: KIND_ROLE[s.kind] || s.label, recipientName: recipientName || undefined, channel, kind: s.kind, message: text, status, jobId },
      });
      setSaved(status);
      onLogged();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="surface flex flex-col gap-3 p-4" data-testid="script-card">
      <div className="flex items-center gap-2">
        <span className="font-semibold">{s.label}</span>
        <Pill tone={words <= 60 ? 'success' : 'danger'} className="ml-auto">{words}/60 words</Pill>
        {s.slop < 100 && <Pill tone="warning">slop {s.slop}</Pill>}
      </div>
      <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} aria-label={`${s.label} message`} />
      <div className="flex flex-wrap items-center gap-2">
        <CopyButton text={text} />
        <select value={channel} onChange={(e) => setChannel(e.target.value as keyof typeof CHANNELS)} className="h-9 rounded-full border bg-card px-3 text-[13px] font-semibold" aria-label="Channel">
          {Object.entries(CHANNELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => log('drafted')} disabled={!!saved}><Save /> {saved === 'drafted' ? 'Saved' : 'Save'}</Button>
          <Button size="sm" onClick={() => log('sent')} disabled={saved === 'sent'}>{saved === 'sent' ? <CheckCheck /> : <Check />} {saved === 'sent' ? 'Logged' : 'Mark sent'}</Button>
        </div>
      </div>
      {saved === 'sent' && <p className="text-xs text-muted-foreground">Logged. You&apos;ll get a follow-up reminder in 5 days.</p>}
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
    </div>
  );
}

function GapScripts() {
  const [since, setSince] = useState('November 2025');
  const [reason, setReason] = useState('');
  const [out, setOut] = useState<{ email: string; phone: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      setOut(await api('/api/outreach/gap', { method: 'POST', json: { gapSince: since, reason } }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <form onSubmit={generate} className="surface flex h-fit flex-col gap-3 p-4 md:p-5">
        <div className="flex items-center gap-3">
          <IconChip icon={ShieldQuestion} tone="warning" />
          <div>
            <p className="font-semibold leading-5">Neutralise the gap</p>
            <p className="text-xs text-muted-foreground">No apology. A deliberate reset, then the 0-day advantage.</p>
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="g-since">Out of work since</Label>
          <Input id="g-since" value={since} onChange={(e) => setSince(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="g-reason">What you did with the time (optional)</Label>
          <Textarea id="g-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Family, a course, AI sourcing tools, freelance hiring…" />
        </div>
        <Button type="submit" disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <Sparkles />} {busy ? 'Writing…' : 'Write my scripts'}</Button>
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      </form>
      <div className="flex flex-col gap-3">
        {out ? (
          <>
            <ScriptBlock icon={Mail} title="Screening email" text={out.email} />
            <ScriptBlock icon={Phone} title="Phone screen (say it out loud)" text={out.phone} />
          </>
        ) : (
          <EmptyState icon={MessageCircleReply} title="Two scripts, ready to use">
            One short paragraph for a screening email and one you can say on a recruiter call, built from your profile.
          </EmptyState>
        )}
      </div>
    </div>
  );
}

function ScriptBlock({ icon, title, text }: { icon: typeof Mail; title: string; text: string }) {
  return (
    <div className="surface flex flex-col gap-3 p-4">
      <div className="flex items-center gap-3">
        <IconChip icon={icon} tone="info" />
        <span className="font-semibold">{title}</span>
        <CopyButton text={text} className="ml-auto" />
      </div>
      <p className="whitespace-pre-wrap text-[15px] leading-7">{text}</p>
    </div>
  );
}

function Log({ items }: { items: LogItem[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState<'all' | 'due' | 'sent' | 'replied' | 'drafted'>('all');
  const [busy, setBusy] = useState('');
  const now = Date.now();
  const isDue = (l: LogItem) => l.status === 'sent' && !!l.followUpAt && new Date(l.followUpAt).getTime() < now + 86_400_000;
  const shown = items.filter((l) => (filter === 'all' ? true : filter === 'due' ? isDue(l) : l.status === filter));
  const count = (k: typeof filter) => items.filter((l) => (k === 'all' ? true : k === 'due' ? isDue(l) : l.status === k)).length;

  async function patch(id: string, json: unknown) {
    setBusy(id);
    try { await api(`/api/outreach/${id}`, { method: 'PATCH', json }); router.refresh(); } finally { setBusy(''); }
  }
  async function remove(id: string) {
    setBusy(id);
    try { await api(`/api/outreach/${id}`, { method: 'DELETE' }); router.refresh(); } finally { setBusy(''); }
  }

  if (!items.length) {
    return <EmptyState icon={History} title="No messages logged yet">Write a message, send it on LinkedIn, then tap Mark sent. It shows up here with a follow-up date.</EmptyState>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="scroll-x">
        <div className="inline-flex gap-2">
          {(['all', 'due', 'sent', 'replied', 'drafted'] as const).map((k) => (
            <button key={k} type="button" className="chip capitalize" data-on={filter === k} onClick={() => setFilter(k)}>
              {k === 'due' && <BellRing className="h-3.5 w-3.5" />} {k === 'due' ? 'Follow-up due' : k} <span className="opacity-70">{count(k)}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-3">
        {shown.map((l) => (
          <article key={l.id} className={cn('surface flex flex-col gap-3 p-4', isDue(l) && 'border-warning/60')} data-testid="log-item">
            <div className="flex items-start gap-3">
              <IconChip icon={l.status === 'replied' ? MessageCircleReply : l.status === 'sent' ? Send : PenLine} tone={l.status === 'replied' ? 'success' : l.status === 'sent' ? 'primary' : 'muted'} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold leading-5">{l.recipientName ? `${l.recipientName} · ` : ''}{l.recipientRole}</p>
                <p className="text-sm text-muted-foreground">{l.company} · {CHANNELS[l.channel as keyof typeof CHANNELS] || l.channel}{l.job ? <> · <Link href={`/jobs/${l.job.id}`} className="text-primary">{l.job.title}</Link></> : null}</p>
              </div>
              <Pill tone={l.status === 'replied' ? 'success' : l.status === 'sent' ? 'primary' : 'muted'} className="capitalize">{l.status}</Pill>
            </div>
            <p className="line-clamp-4 whitespace-pre-wrap rounded-xl bg-muted px-3 py-2 text-sm leading-6">{l.message}</p>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" /> {l.sentAt ? `Sent ${timeAgo(l.sentAt)}` : `Saved ${timeAgo(l.createdAt)}`}</span>
              {l.followUpAt && l.status === 'sent' && (
                <span className={cn('inline-flex items-center gap-1', isDue(l) && 'font-semibold text-warning')}>
                  <BellRing className="h-3.5 w-3.5" /> Follow up {new Date(l.followUpAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <CopyButton text={l.message} />
              {l.status === 'drafted' && <Button size="sm" onClick={() => patch(l.id, { status: 'sent' })} disabled={busy === l.id}><Check /> Mark sent</Button>}
              {l.status === 'sent' && <Button size="sm" variant="soft" onClick={() => patch(l.id, { status: 'replied' })} disabled={busy === l.id}><MessageCircleReply /> Got a reply</Button>}
              {l.status === 'sent' && (
                <Button size="sm" variant="ghost" onClick={() => patch(l.id, { followUpAt: new Date(Date.now() + 3 * 86_400_000).toISOString() })} disabled={busy === l.id}>
                  <Clock3 /> Snooze 3 days
                </Button>
              )}
              <Button size="sm" variant="ghost" className="ml-auto text-muted-foreground" onClick={() => remove(l.id)} disabled={busy === l.id} aria-label="Delete"><Trash2 /></Button>
            </div>
          </article>
        ))}
        {!shown.length && <p className="py-6 text-center text-sm text-muted-foreground">Nothing here.</p>}
      </div>
    </div>
  );
}
