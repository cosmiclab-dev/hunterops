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
  error: string | null; sentAt: string | null; createdAt: string;
};

const KINDS = { cold: 'Cold email', referral: 'Referral ask', follow_up: 'Follow-up', thank_you: 'Thank you' };
const FRAMEWORKS = { plain: 'Plain', aida: 'AIDA', pas: 'PAS' };

function Select({ value, onChange, options, id }: { value: string; onChange: (v: string) => void; options: Record<string, string>; id: string }) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className="h-10 w-full rounded-md border bg-background px-3">
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
    <div className="flex flex-col gap-3 rounded-lg border p-4" data-testid="email-draft">
      <div className="flex items-center justify-between gap-2">
        <span className="meta">{KINDS[email.kind as keyof typeof KINDS] ?? email.kind} · {FRAMEWORKS[email.framework as keyof typeof FRAMEWORKS] ?? email.framework}</span>
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
                  <div className="flex flex-col gap-2 rounded-md border p-3">
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
            <Button size="sm" variant="ghost" onClick={remove} disabled={busy}>Delete</Button>
          </div>
        </>
      )}
      {busy && <p className="meta" role="status">Working…</p>}
      {err && <p className="text-sm text-destructive" role="alert">{err}</p>}
    </div>
  );
}

export function EmailPanel({ jobId, initial }: { jobId: string; initial: EmailRow[] }) {
  const [emails, setEmails] = useState(initial);
  const [form, setForm] = useState({ toEmail: '', recipientName: '', recipientTitle: '', kind: 'cold', framework: 'plain' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function draft(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      const { email } = await api<{ email: EmailRow }>('/api/emails', { method: 'POST', json: { jobId, ...form } });
      setEmails((list) => [email, ...list]);
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={draft} className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-1 md:col-span-2">
          <Label htmlFor="to">Recruiter email</Label>
          <Input id="to" type="email" required value={form.toEmail} onChange={(e) => set('toEmail')(e.target.value)} placeholder="name@company.com" />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="rname">Their name</Label>
          <Input id="rname" value={form.recipientName} onChange={(e) => set('recipientName')(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="rtitle">Their title</Label>
          <Input id="rtitle" value={form.recipientTitle} onChange={(e) => set('recipientTitle')(e.target.value)} placeholder="Head of Talent" />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="kind">Type</Label>
          <Select id="kind" value={form.kind} onChange={set('kind')} options={KINDS} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="fw">Structure</Label>
          <Select id="fw" value={form.framework} onChange={set('framework')} options={FRAMEWORKS} />
        </div>
        <Button type="submit" disabled={busy} className="md:col-span-2">{busy ? 'Writing…' : 'Write draft'}</Button>
      </form>
      {err && <p className="text-sm text-destructive" role="alert">{err}</p>}
      {emails.map((e) => (
        <Draft key={e.id} email={e} onChange={(next) => setEmails((list) => (next ? list.map((x) => (x.id === e.id ? next : x)) : list.filter((x) => x.id !== e.id)))} />
      ))}
    </div>
  );
}
