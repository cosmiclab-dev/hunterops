'use client';

import { useState } from 'react';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { SlopReportView } from '@/components/slop-checker';
import { api } from '@/lib/api-client';
import { scanSlop } from '@/lib/modules/anti-slop';

export type EmailRow = {
  id: string; toEmail: string; subject: string; body: string; status: string; kind: string; framework: string;
  error: string | null; sentAt: string | null; createdAt: string; job?: { id: string; title: string; company: string } | null;
};
type JobOption = { id: string; title: string; company: string };

const KINDS = { cold: 'Cold email', referral: 'Referral ask', follow_up: 'Follow-up', thank_you: 'Thank you', cover_letter: 'Cover letter' };
const FRAMEWORKS = { aida: 'AIDA (Attention, Interest, Desire, Action)', pas: 'PAS (Problem, Agitation, Solution)', plain: 'Plain' };

function Select({ value, onChange, options, id }: { value: string; onChange: (v: string) => void; options: Record<string, string>; id: string }) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className="h-11 w-full rounded-xl border border-input bg-card px-3.5">
      {Object.entries(options).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
    </select>
  );
}

function Draft({ email, onChange }: { email: EmailRow; onChange: (e: EmailRow | null) => void }) {
  const [subject, setSubject] = useState(email.subject);
  const [body, setBody] = useState(email.body);
  const [to, setTo] = useState(email.toEmail);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const dirty = subject !== email.subject || body !== email.body || to !== email.toEmail;
  const sent = email.status === 'SENT';

  async function save() {
    setBusy(true);
    setErr('');
    try {
      const { email: e } = await api<{ email: EmailRow }>(`/api/emails/${email.id}`, { method: 'PATCH', json: { subject, body, toEmail: to } });
      onChange(e);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    setBusy(true);
    setErr('');
    try {
      const { email: e } = await api<{ email: EmailRow }>(`/api/emails/${email.id}/send`, {
        method: 'POST', json: { approve: true, subject: email.subject, body: email.body },
      });
      onChange(e);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function plain() {
    setBusy(true);
    setErr('');
    try {
      const out = await api<{ text: string }>('/api/refine', { method: 'POST', json: { text: body } });
      setBody(out.text);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await api(`/api/emails/${email.id}`, { method: 'DELETE' });
      onChange(null);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="surface flex flex-col gap-3 p-4" data-testid="email-draft">
      <div className="flex items-center justify-between gap-2">
        <span className="meta truncate">{KINDS[email.kind as keyof typeof KINDS] ?? email.kind} · {(FRAMEWORKS[email.framework as keyof typeof FRAMEWORKS] ?? email.framework).split(' ')[0]}{email.job ? ` · ${email.job.company}` : ''}</span>
        <Badge variant={sent ? 'default' : 'outline'}>{email.status.toLowerCase()}</Badge>
      </div>
      {sent ? (
        <>
          <p className="meta">To {email.toEmail} · sent {email.sentAt ? new Date(email.sentAt).toLocaleString('en-IN') : ''}</p>
          <p className="font-semibold">{email.subject}</p>
          <p className="whitespace-pre-wrap text-sm leading-5">{email.body}</p>
        </>
      ) : (
        <>
          <Input value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" type="email" />
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="Subject" />
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={8} aria-label="Body" />
          <SlopReportView report={scanSlop(`${subject}\n${body}`)} />
          {email.error && <p className="text-sm text-destructive">Last attempt failed: {email.error}</p>}
          <div className="flex flex-wrap gap-2">
            {dirty ? (
              <Button size="sm" onClick={save} disabled={busy}>Save changes</Button>
            ) : (
              <Dialog>
                <DialogTrigger asChild>
                  <Button size="sm" disabled={busy}><Send /> Review and send</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Send this email?</DialogTitle>
                    <DialogDescription>It goes out from your Gmail exactly as shown. Nothing is sent until you press Approve and send.</DialogDescription>
                  </DialogHeader>
                  <div className="flex flex-col gap-2 rounded-xl border bg-muted/40 p-3">
                    <p className="meta">To {email.toEmail}</p>
                    <p className="font-semibold">{email.subject}</p>
                    <p className="whitespace-pre-wrap text-sm leading-5">{email.body}</p>
                  </div>
                  <DialogFooter>
                    <DialogClose asChild><Button variant="outline">Keep editing</Button></DialogClose>
                    <DialogClose asChild><Button onClick={send} data-testid="approve-send">Approve and send</Button></DialogClose>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
            <Button size="sm" variant="outline" onClick={plain} disabled={busy} title="Rewrite in ASD-STE100 plain English">Plain English</Button>
            <Button size="sm" variant="ghost" onClick={remove} disabled={busy}>Delete</Button>
          </div>
        </>
      )}
      {busy && <p className="meta" role="status">Working…</p>}
      {err && <p className="text-sm text-destructive" role="alert">{err}</p>}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <legend className="mb-2 text-[13px] uppercase tracking-[0.02em] text-muted-foreground">{title}</legend>
      {children}
    </fieldset>
  );
}

// Unverified address guesses from the person's name; a tap fills the To field.
function GuessEmail({ name, company, jobId, onPick }: { name: string; company: string; jobId?: string; onPick: (email: string) => void }) {
  const [res, setRes] = useState<{ guesses: string[]; note: string; mx: boolean } | null>(null);
  const [domain, setDomain] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function guess() {
    setBusy(true);
    setErr('');
    try {
      setRes(await api('/api/email-guess', { method: 'POST', json: { name, company, jobId: jobId || undefined, domain: domain || undefined } }));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-col gap-2 sm:col-span-2" data-testid="email-guess">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={guess} disabled={busy || !name.trim()}>{busy ? 'Guessing…' : 'Guess their email'}</Button>
        {res && <Input aria-label="Company email domain" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="company.com (optional)" className="h-9 w-48" />}
      </div>
      {res && (
        <>
          <p className="meta">{res.note} Unverified: check on LinkedIn or the company site before sending.</p>
          <div className="flex flex-wrap gap-1.5">
            {res.guesses.map((g) => <button key={g} type="button" className="chip" onClick={() => onPick(g)}>{g}</button>)}
          </div>
        </>
      )}
      {err && <p className="text-sm text-destructive" role="alert">{err}</p>}
    </div>
  );
}

// Compose and manage recruiter emails: for one job (job page) or any job or
// company (Mailroom, where `jobs` lists the pipeline to pick from).
export function EmailPanel({ jobId, initial, jobs }: { jobId?: string; initial: EmailRow[]; jobs?: JobOption[] }) {
  const [emails, setEmails] = useState(initial);
  const [form, setForm] = useState({ jobId: jobId ?? '', company: '', role: '', toEmail: '', recipientName: '', recipientTitle: '', kind: 'cold', framework: 'aida' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [filter, setFilter] = useState<'all' | 'DRAFT' | 'SENT'>('all');
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const picker = !jobId && jobs;

  async function draft(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      const { jobId: jid, company, role, ...rest } = form;
      const { email } = await api<{ email: EmailRow }>('/api/emails', { method: 'POST', json: jid ? { jobId: jid, ...rest } : { company, role, ...rest } });
      const job = jobs?.find((j) => j.id === jid) ?? null;
      setEmails((list) => [{ ...email, job }, ...list]);
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const shown = emails.filter((e) => filter === 'all' || (filter === 'SENT' ? e.status === 'SENT' : e.status !== 'SENT'));
  return (
    <div className={picker ? 'grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]' : 'flex flex-col gap-4'}>
      <form onSubmit={draft} className={picker ? 'surface flex flex-col gap-5 self-start p-4' : 'flex flex-col gap-5'} data-testid="email-compose">
        {picker && <p className="text-[15px] font-semibold">New email</p>}
        {picker && (
          <Group title="About">
            <div className="flex flex-col gap-1 sm:col-span-2">
              <Label htmlFor="em-job">Job</Label>
              <select id="em-job" value={form.jobId} onChange={(e) => set('jobId')(e.target.value)} className="h-11 w-full rounded-xl border border-input bg-card px-3.5">
                <option value="">No job: type the company</option>
                {jobs!.map((j) => <option key={j.id} value={j.id}>{j.company}: {j.title}</option>)}
              </select>
            </div>
            {!form.jobId && (
              <>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="em-company">Company</Label>
                  <Input id="em-company" value={form.company} onChange={(e) => set('company')(e.target.value)} required />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="em-role">Role</Label>
                  <Input id="em-role" value={form.role} onChange={(e) => set('role')(e.target.value)} placeholder="Senior Recruiter" />
                </div>
              </>
            )}
          </Group>
        )}
        <Group title="To">
          <div className="flex flex-col gap-1">
            <Label htmlFor="rname">Their name</Label>
            <Input id="rname" value={form.recipientName} onChange={(e) => set('recipientName')(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="rtitle">Their title</Label>
            <Input id="rtitle" value={form.recipientTitle} onChange={(e) => set('recipientTitle')(e.target.value)} placeholder="Head of Talent" />
          </div>
          <div className="flex flex-col gap-1 sm:col-span-2">
            <Label htmlFor="to">Their email</Label>
            <Input id="to" type="email" required value={form.toEmail} onChange={(e) => set('toEmail')(e.target.value)} placeholder="name@company.com" />
          </div>
          <GuessEmail name={form.recipientName} company={form.company || jobs?.find((j) => j.id === form.jobId)?.company || ''} jobId={form.jobId || undefined} onPick={set('toEmail')} />
        </Group>
        <Group title="Message">
          <div className="flex flex-col gap-1">
            <Label htmlFor="kind">Type</Label>
            <Select id="kind" value={form.kind} onChange={set('kind')} options={KINDS} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="fw">Structure</Label>
            <Select id="fw" value={form.framework} onChange={set('framework')} options={FRAMEWORKS} />
          </div>
          <p className="meta sm:col-span-2">Tone, length and signature come from <a href="/settings#writing" className="text-info">Settings, Writing</a>.</p>
        </Group>
        <Button type="submit" disabled={busy}>{busy ? 'Writing…' : 'Write draft'}</Button>
        {err && <p className="text-sm text-destructive" role="alert">{err}</p>}
      </form>
      <div className="flex min-w-0 flex-col gap-3">
        {picker && (
          <div className="flex items-center gap-1.5">
            {(['all', 'DRAFT', 'SENT'] as const).map((f) => (
              <button key={f} type="button" className="chip" data-on={filter === f} onClick={() => setFilter(f)}>
                {f === 'all' ? 'All' : f === 'DRAFT' ? 'Drafts' : 'Sent'} <span className="opacity-70">{emails.filter((e) => f === 'all' || (f === 'SENT' ? e.status === 'SENT' : e.status !== 'SENT')).length}</span>
              </button>
            ))}
          </div>
        )}
        {shown.map((e) => (
          <Draft key={e.id} email={e} onChange={(next) => setEmails((list) => (next ? list.map((x) => (x.id === e.id ? { ...next, job: e.job } : x)) : list.filter((x) => x.id !== e.id)))} />
        ))}
        {picker && !shown.length && <p className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">No emails yet. Write one on the left; nothing is sent until you approve it.</p>}
      </div>
    </div>
  );
}
