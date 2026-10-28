'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, ClipboardCheck, ExternalLink, FileText, Globe, Loader2, RefreshCw, ShieldCheck, Trash2, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { CopyButton } from '@/components/copy-button';
import { IconChip, Pill } from '@/components/kit';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { api, download } from '@/lib/api-client';
import { cn } from '@/lib/utils';

type Answer = { key: string; label: string; type: string; required: boolean; value: string; source: 'profile' | 'ai' | 'you'; note?: string; options?: string[] };
export type ApplicationRow = {
  status: 'PREPARING' | 'PENDING' | 'APPROVED' | 'SUBMITTED' | 'FAILED';
  answers: Answer[] | null; coverLetter: string | null; applyUrl: string | null; embedUrl: string | null;
  notes: string[]; error: string | null; preparedAt: string | null; approvedAt: string | null; submittedAt: string | null;
  resume: { id: string; name: string; density: string } | null;
};

const SOURCE: Record<Answer['source'], { label: string; tone: 'success' | 'primary' | 'warning' }> = {
  profile: { label: 'Profile', tone: 'success' },
  ai: { label: 'AI', tone: 'primary' },
  you: { label: 'You', tone: 'warning' },
};

const STEPS = ['Prepared', 'Approved', 'Submitted'] as const;

function Steps({ status }: { status: ApplicationRow['status'] | null }) {
  const at = status === 'SUBMITTED' ? 3 : status === 'APPROVED' ? 2 : status === 'PENDING' ? 1 : 0;
  return (
    <ol className="grid grid-cols-3 gap-1.5" aria-label="Application steps">
      {STEPS.map((s, i) => (
        <li key={s} className="flex flex-col gap-1.5">
          <span className={cn('h-1.5 rounded-full', i < at ? 'bg-primary' : 'bg-muted')} />
          <span className={cn('text-xs font-medium', i < at ? 'text-foreground' : 'text-muted-foreground')}>{s}</span>
        </li>
      ))}
    </ol>
  );
}

// One job's application: the AI prepares it, the person reviews and approves
// it, then fills the company's own form and presses Submit there.
export function ApplyView({ jobId, job }: { jobId: string; job: { title: string; company: string; url: string; grillScore: number | null } }) {
  const [app, setApp] = useState<ApplicationRow | null | undefined>(undefined);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [letter, setLetter] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { application } = await api<{ application: ApplicationRow | null }>(`/api/applications/${jobId}`);
    setApp(application);
    return application;
  }, [jobId]);
  useEffect(() => { load().catch((e) => setErr((e as Error).message)); }, [load]);
  // While it is being prepared (here or by the morning run), check back every few seconds.
  useEffect(() => {
    if (app?.status !== 'PREPARING') return;
    const t = setInterval(() => { load().catch(() => {}); }, 5000);
    return () => clearInterval(t);
  }, [app?.status, load]);

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

  const prepare = () => run('prepare', async () => {
    setApp((a) => ({ ...(a || ({} as ApplicationRow)), status: 'PREPARING' }));
    try {
      await api('/api/applications', { method: 'POST', json: { jobId } });
    } finally {
      await load();
    }
    setEdits({});
    setLetter(null);
  });
  const dirty = Object.keys(edits).length > 0 || letter !== null;
  const saveEdits = async () => {
    if (!dirty) return;
    await api(`/api/applications/${jobId}`, { method: 'PATCH', json: { answers: Object.entries(edits).map(([key, value]) => ({ key, value })), ...(letter !== null ? { coverLetter: letter } : {}) } });
    setEdits({});
    setLetter(null);
  };
  const approve = () => run('approve', async () => {
    await saveEdits();
    await api(`/api/applications/${jobId}/approve`, { method: 'POST', json: { approve: true } });
    await load();
  });
  const submitted = () => run('submitted', async () => {
    await api(`/api/applications/${jobId}/submitted`, { method: 'POST' });
    await load();
  });
  const discard = () => run('discard', async () => {
    await api(`/api/applications/${jobId}`, { method: 'DELETE' });
    setApp(null);
  });
  const backToReview = () => run('review', async () => {
    await api(`/api/applications/${jobId}`, { method: 'PATCH', json: {} });
    await load();
  });

  if (app === undefined && !err) {
    return <div className="flex items-center gap-2 py-10 text-muted-foreground" role="status"><Loader2 className="h-5 w-5 animate-spin" /> Loading…</div>;
  }

  const status = app?.status ?? null;
  const answers = app?.answers || [];
  const filled = answers.filter((a) => a.type !== 'file' && (edits[a.key] ?? a.value));
  const all = filled.map((a) => `${a.label}\n${edits[a.key] ?? a.value}`).join('\n\n');
  const formHref = app?.embedUrl ? `/browser/${jobId}?view=apply` : app?.applyUrl || job.url;

  return (
    <div className="flex flex-col gap-5" data-testid="apply-view" data-status={status ?? 'NONE'}>
      <div className="surface flex flex-col gap-4 p-4">
        <Steps status={status} />
        {err && <p className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive" role="alert">{err}</p>}

        {(status === null || status === 'FAILED') && (
          <div className="flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <IconChip icon={Wand2} tone="primary" />
              <div className="min-w-0">
                <p className="font-semibold">Let the AI prepare this application</p>
                <p className="text-sm leading-6 text-muted-foreground">It reads the form, answers every question from your profile, tailors your resume and writes a cover letter. Nothing is sent or submitted: you review it first.</p>
              </div>
            </div>
            {status === 'FAILED' && app?.error && <p className="rounded-xl bg-warning/15 p-3 text-sm text-warning">Last try: {app.error}</p>}
            <Button onClick={prepare} disabled={!!busy} data-testid="prepare-application">
              {busy === 'prepare' ? <><Loader2 className="animate-spin" /> Preparing… (up to 2 minutes)</> : <><Wand2 /> {status === 'FAILED' ? 'Try again' : 'Prepare application'}</>}
            </Button>
          </div>
        )}

        {status === 'PREPARING' && (
          <div className="flex items-center gap-3 py-2" role="status">
            <Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary" />
            <p className="text-sm leading-6">Preparing the answers, resume and cover letter. This takes a minute or two; you can leave this page.</p>
          </div>
        )}

        {status === 'PENDING' && (
          <div className="flex items-start gap-3">
            <IconChip icon={ShieldCheck} tone="warning" />
            <div className="min-w-0">
              <p className="font-semibold">Approval pending</p>
              <p className="text-sm leading-6 text-muted-foreground">Check the answers below and fix anything that is off. Approving submits nothing: it opens the step where you fill the company’s form.</p>
            </div>
          </div>
        )}

        {status === 'APPROVED' && (
          <div className="flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <IconChip icon={ClipboardCheck} tone="primary" />
              <div className="min-w-0">
                <p className="font-semibold">Approved: fill the form and submit</p>
                <p className="text-sm leading-6 text-muted-foreground">Open the form, attach the resume, paste each answer, and press Submit on the company’s site. Then come back and tap “I submitted it”.</p>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button asChild data-testid="open-form">
                {app?.embedUrl ? <Link href={formHref}><Globe /> Open the form in HunterOps</Link> : <a href={formHref} target="_blank" rel="noopener noreferrer"><ExternalLink /> Open the form</a>}
              </Button>
              <Button variant="outline" onClick={submitted} disabled={!!busy} data-testid="mark-submitted">
                <CheckCircle2 /> {busy === 'submitted' ? 'Saving…' : 'I submitted it'}
              </Button>
            </div>
          </div>
        )}

        {status === 'SUBMITTED' && (
          <div className="flex items-start gap-3">
            <IconChip icon={CheckCircle2} tone="success" />
            <div className="min-w-0">
              <p className="font-semibold">Applied</p>
              <p className="text-sm leading-6 text-muted-foreground">Submitted {app?.submittedAt ? new Date(app.submittedAt).toLocaleDateString('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }) : ''}. It is in the Applied column of your Pipeline.</p>
            </div>
          </div>
        )}
      </div>

      {app && (status === 'PENDING' || status === 'APPROVED' || status === 'SUBMITTED') && (
        <>
          {app.notes?.length > 0 && (
            <ul className="flex flex-col gap-1.5 rounded-2xl bg-muted/60 p-3 text-sm leading-6 text-muted-foreground">
              {app.notes.map((n) => <li key={n}>{n}</li>)}
            </ul>
          )}

          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[21px] font-semibold leading-tight">Resume</h2>
            </div>
            {app.resume ? (
              <button type="button" className="surface flex items-center gap-3 p-4 text-left active:scale-[0.99]" onClick={() => run('pdf', () => download('/api/resume/render', { format: 'pdf', resumeId: app.resume!.id }, 'Resume.pdf'))} data-testid="apply-resume">
                <IconChip icon={FileText} tone="danger" />
                <span className="min-w-0 flex-1"><span className="block truncate font-medium">{app.resume.name}</span><span className="meta">Tailored to this job · tap to download the PDF</span></span>
              </button>
            ) : (
              <p className="text-sm text-muted-foreground">No tailored resume yet. Make one in the <Link className="font-semibold text-primary" href={`/browser/${jobId}`}>Browser</Link>.</p>
            )}
          </section>

          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[21px] font-semibold leading-tight">Answers</h2>
              {all && <CopyButton text={all} label="Copy all" size="sm" variant="outline" />}
            </div>
            <div className="flex flex-col gap-2.5" data-testid="apply-answers">
              {answers.map((a) => {
                const value = edits[a.key] ?? a.value;
                const src = SOURCE[a.source] || SOURCE.you;
                return (
                  <div key={a.key} className="surface flex flex-col gap-2 p-3.5" data-testid="apply-answer">
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 text-sm font-medium leading-5">{a.label}{a.required && <span className="text-destructive"> *</span>}</p>
                      <Pill tone={src.tone} className="shrink-0">{src.label}</Pill>
                    </div>
                    {a.type === 'file' ? (
                      <p className="text-sm text-muted-foreground">{a.value || a.note || 'Attach the file yourself.'}</p>
                    ) : status === 'PENDING' && a.type !== 'textarea' && a.value.length <= 80 ? (
                      <Input
                        value={value}
                        onChange={(e) => setEdits((x) => ({ ...x, [a.key]: e.target.value }))}
                        placeholder={a.note || 'Type your answer'}
                        aria-label={a.label}
                        className="text-[15px]"
                      />
                    ) : status === 'PENDING' ? (
                      <Textarea
                        value={value}
                        onChange={(e) => setEdits((x) => ({ ...x, [a.key]: e.target.value }))}
                        rows={value.length > 240 ? 7 : 4}
                        placeholder={a.note || 'Type your answer'}
                        aria-label={a.label}
                        className="text-[15px] leading-6"
                      />
                    ) : value ? (
                      <div className="flex items-start gap-2">
                        <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-[15px] leading-6">{value}</p>
                        <CopyButton text={value} label="" aria-label={`Copy ${a.label}`} className="h-9 w-9 shrink-0 p-0" variant="ghost" />
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">{a.note || 'Fill this in on the form yourself.'}</p>
                    )}
                    {a.options?.length ? <p className="meta">Options: {a.options.slice(0, 8).join(' · ')}</p> : null}
                  </div>
                );
              })}
            </div>
          </section>

          {(app.coverLetter || letter !== null) && (
            <section className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-[21px] font-semibold leading-tight">Cover letter</h2>
                <CopyButton text={letter ?? app.coverLetter ?? ''} label="Copy" size="sm" variant="outline" />
              </div>
              {status === 'PENDING' ? (
                <Textarea value={letter ?? app.coverLetter ?? ''} onChange={(e) => setLetter(e.target.value)} rows={12} aria-label="Cover letter" className="text-[15px] leading-6" />
              ) : (
                <p className="surface whitespace-pre-wrap break-words p-4 text-[15px] leading-6">{app.coverLetter}</p>
              )}
            </section>
          )}

          {status === 'PENDING' && (
            <div className="sticky bottom-24 z-10 flex flex-col gap-2 rounded-2xl glass-float p-2 lg:bottom-4">
              <Dialog>
                <DialogTrigger asChild>
                  <Button size="lg" disabled={!!busy} data-testid="approve-application"><ShieldCheck /> {busy === 'approve' ? 'Approving…' : 'Approve application'}</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Approve this application?</DialogTitle>
                    <DialogDescription>
                      {job.title} at {job.company}. Approving does not submit anything. Next you open the company’s form, paste these answers and press Submit there yourself.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter className="gap-2">
                    <DialogClose asChild><Button variant="outline">Not yet</Button></DialogClose>
                    <DialogClose asChild><Button onClick={approve} data-testid="confirm-approve">Approve</Button></DialogClose>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" size="sm" onClick={prepare} disabled={!!busy}><RefreshCw /> Prepare again</Button>
                <Button variant="ghost" size="sm" onClick={discard} disabled={!!busy} className="text-destructive"><Trash2 /> Discard</Button>
              </div>
            </div>
          )}
          {status === 'APPROVED' && (
            <Button variant="ghost" size="sm" className="self-start" onClick={backToReview} disabled={!!busy}>Back to review</Button>
          )}
        </>
      )}
    </div>
  );
}
