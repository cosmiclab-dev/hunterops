'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BookOpen, Bookmark, CheckCircle2, ClipboardList, ExternalLink, FileText, Flame, Globe, Loader2, PanelRightClose, PanelRightOpen, Send, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/copy-button';
import { GrillCard } from '@/components/grill-card';
import { CoverLetterPanel } from '@/components/cover-letter-panel';
import { api, download } from '@/lib/api-client';
import type { GrillResult } from '@/lib/modules/grill';
import { cn } from '@/lib/utils';

type Field = { key: string; label: string; type: string; required: boolean; options?: string[] };
type Page = {
  url: string; applyUrl: string; source: string; title: string; company: string; location: string | null; salary: string | null;
  postedAt: string | null; description: string; html: string; fields: Field[]; embedUrl: string | null; frameable: boolean | null;
};
type Answer = { key: string; label: string; type: string; required: boolean; value: string; source: 'profile' | 'ai' | 'you'; note?: string };
type Sheet = { answers: Answer[]; generic: boolean; model: string | null };
type Opened = { page: Page; via?: { board: string; listing: string } | null; saved?: { reason: string } | null; board?: string | null; grill: GrillResult | null; job: { id: string; status: string; grillScore: number | null } | null; autofill: Sheet | null; coverLetter?: string | null };

type View = 'reader' | 'live' | 'apply';
type Tool = 'analyze' | 'autofill' | 'resume' | 'email';

function readerDoc(p: Page, dark: boolean) {
  const fg = dark ? '#fafafa' : '#09090b';
  const muted = dark ? '#a1a1aa' : '#71717a';
  const bg = dark ? '#09090b' : '#ffffff';
  const border = dark ? '#27272a' : '#e4e4e7';
  const link = dark ? '#a5b4fc' : '#4f46e5';
  const meta = [p.company, p.location, p.salary].filter(Boolean).join(' · ');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
body{margin:0;background:${bg};color:${fg};font:15px/1.65 Inter,system-ui,-apple-system,sans-serif;-webkit-font-smoothing:antialiased}
main{max-width:720px;margin:0 auto;padding:32px 24px 64px}
h1{font-size:26px;line-height:1.25;margin:0 0 6px;letter-spacing:-0.01em;font-weight:650}
.meta{color:${muted};font-size:13px;margin-bottom:24px;padding-bottom:20px;border-bottom:1px solid ${border}}
h2,h3,h4{font-size:16px;margin:24px 0 8px;font-weight:600}
p{margin:0 0 12px} ul,ol{padding-left:20px;margin:0 0 12px} li{margin:4px 0}
a{color:${link}} table{border-collapse:collapse} td,th{border:1px solid ${border};padding:4px 8px}
</style></head><body><main><h1>${p.title.replace(/</g, '&lt;')}</h1><div class="meta">${meta.replace(/</g, '&lt;')}</div>${p.html || '<p>This page has no readable text. Try the Live page view.</p>'}</main></body></html>`;
}

function useDark() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const el = document.documentElement;
    const read = () => setDark(el.classList.contains('dark'));
    read();
    const obs = new MutationObserver(read);
    obs.observe(el, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);
  return dark;
}

const TOOLS: { id: Tool; label: string; icon: typeof Flame }[] = [
  { id: 'analyze', label: 'Analyze', icon: Flame },
  { id: 'autofill', label: 'Auto-fill', icon: ClipboardList },
  { id: 'resume', label: 'Resume', icon: Wand2 },
  { id: 'email', label: 'Cover letter', icon: Send },
];

// The in-app Browser: the posting on the left (reader, live page, or the
// official application form), the HunterOps control panel on the right.
export function BrowserView({ jobId: initialJobId, url, initialView }: { jobId?: string; url?: string; initialView?: View }) {
  const dark = useDark();
  const [data, setData] = useState<Opened | null>(null);
  const [err, setErr] = useState('');
  const [view, setView] = useState<View>(initialView ?? 'reader');
  const [tool, setTool] = useState<Tool>('analyze');
  const [panel, setPanel] = useState(true);
  const [busy, setBusy] = useState('');
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [toolErr, setToolErr] = useState('');
  const [resume, setResume] = useState<{ id: string; name: string; pages: number } | null>(null);
  const jobId = data?.job?.id ?? initialJobId;

  const open = useCallback(async () => {
    setErr('');
    try {
      const d = await api<Opened>('/api/browser/open', { method: 'POST', json: initialJobId ? { jobId: initialJobId } : { url } });
      setData(d);
      if (d.autofill) setSheet(d.autofill);
      // A job board listing opened on the employer's site: show their form straight away.
      if (d.via && !initialView && (d.page.embedUrl || d.page.frameable !== false)) {
        setView('apply');
        if (d.autofill) setTool('autofill');
      }
    } catch (e) {
      setErr((e as Error).message);
    }
  }, [initialJobId, url, initialView]);
  useEffect(() => { open(); }, [open]);

  const srcDoc = useMemo(() => (data ? readerDoc(data.page, dark) : ''), [data, dark]);

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setToolErr('');
    try {
      await fn();
    } catch (e) {
      setToolErr((e as Error).message);
    } finally {
      setBusy('');
    }
  }

  // Tools that write files or letters need the job on the board.
  async function ensureJob(): Promise<string> {
    if (jobId) return jobId;
    const out = await api<{ job: { id: string; status: string; grillScore: number | null } }>('/api/jobs/import', { method: 'POST', json: { url: data!.page.url } });
    setData((d) => (d ? { ...d, job: { id: out.job.id, status: out.job.status, grillScore: out.job.grillScore } } : d));
    return out.job.id;
  }

  const analyze = () => run('analyze', async () => {
    const out = await api<{ grill: GrillResult }>('/api/grill', { method: 'POST', json: jobId ? { jobId } : { url: data!.page.url } });
    setData((d) => (d ? { ...d, grill: out.grill } : d));
  });
  const autofill = () => run('autofill', async () => {
    const id = jobId;
    setSheet(await api<Sheet>('/api/autofill', { method: 'POST', json: id ? { jobId: id } : { url: data!.page.url } }));
  });
  const makeResume = () => run('resume', async () => {
    const id = await ensureJob();
    const out = await api<{ resume: { id: string; name: string }; pages: number }>('/api/resume/tailor', { method: 'POST', json: { jobId: id } });
    setResume({ ...out.resume, pages: out.pages });
    await download('/api/resume/render', { format: 'pdf', resumeId: out.resume.id }, 'Resume.pdf');
  });
  const setStatus = (status: 'SAVED' | 'APPLIED') => run(status, async () => {
    const id = await ensureJob();
    await api(`/api/jobs/${id}`, { method: 'PATCH', json: { status } });
    setData((d) => (d && d.job ? { ...d, job: { ...d.job, status } } : d));
  });

  if (err) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center gap-4 py-20 text-center">
        <Globe className="h-10 w-10 text-muted-foreground" />
        <div>
          <p className="font-semibold">Could not open this page</p>
          <p className="mt-1 text-sm text-muted-foreground">{err}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild><Link href="/browser"><ArrowLeft /> Back</Link></Button>
          <Button onClick={open}>Try again</Button>
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-3 text-muted-foreground" role="status">
        <Loader2 className="h-6 w-6 animate-spin" />
        <p className="text-sm">Opening the posting…</p>
      </div>
    );
  }

  const p = data.page;
  const status = data.job?.status;
  const canLive = p.frameable !== false;
  const host = (() => { try { return new URL(p.url).hostname.replace(/^www\./, ''); } catch { return p.url; } })();
  const views: { id: View; label: string; icon: typeof Globe; off?: boolean }[] = [
    { id: 'reader', label: 'Reader', icon: BookOpen },
    { id: 'live', label: 'Live page', icon: Globe },
    { id: 'apply', label: 'Apply form', icon: FileText, off: !p.embedUrl && !canLive },
  ];

  return (
    <div className="-mx-4 -mt-5 flex flex-col md:-mx-6 lg:-mx-8 lg:-mt-8 lg:h-[100dvh]" data-testid="browser">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b bg-background px-3 py-2 lg:flex-nowrap">
        <Button variant="ghost" size="icon-sm" asChild aria-label="Back"><Link href={jobId ? `/jobs/${jobId}` : '/browser'}><ArrowLeft /></Link></Button>
        <div className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md border bg-muted/40 px-3 text-sm">
          <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate text-muted-foreground"><span className="text-foreground">{host}</span>{(() => { try { return new URL(p.url).pathname; } catch { return ''; } })()}</span>
        </div>
        <div className="order-last flex w-full rounded-md border p-0.5 lg:order-none lg:inline-flex lg:w-auto" role="tablist" aria-label="View">
          {views.map((v) => (
            <button
              key={v.id} type="button" role="tab" aria-selected={view === v.id} disabled={v.off}
              onClick={() => setView(v.id)}
              className={cn('inline-flex h-7 flex-1 items-center justify-center gap-1.5 rounded px-2.5 text-xs lg:flex-none font-medium transition-colors disabled:opacity-40', view === v.id ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground')}
            >
              <v.icon className="h-3.5 w-3.5" /> {v.label}
            </button>
          ))}
        </div>
        <Button variant="ghost" size="icon-sm" asChild aria-label="Open on the company site"><a href={p.applyUrl} target="_blank" rel="noopener noreferrer"><ExternalLink /></a></Button>
        <Button variant="ghost" size="icon-sm" className="hidden lg:inline-flex" onClick={() => setPanel((x) => !x)} aria-label={panel ? 'Hide control panel' : 'Show control panel'}>
          {panel ? <PanelRightClose /> : <PanelRightOpen />}
        </Button>
      </div>

      {data.via && (
        <p className="border-b bg-success/10 px-4 py-2 text-xs leading-5 text-foreground" data-testid="employer-banner">
          Opened <b>{p.company || host}</b>’s own posting. {data.via.board} hides the application form from apps, so HunterOps found the same job on the employer’s site.{' '}
          <a href={data.via.listing} target="_blank" rel="noopener noreferrer" className="font-medium text-primary">See the {data.via.board} listing</a>
        </p>
      )}
      {data.saved && (
        <p className="border-b bg-warning/15 px-4 py-2 text-xs leading-5 text-foreground" data-testid="saved-banner">
          {data.saved.reason} Showing the posting as the scan saved it{data.board ? `; HunterOps did not find it on ${p.company || 'the employer'}’s own site` : ''}.{' '}
          <a href={p.url} target="_blank" rel="noopener noreferrer" className="font-medium text-primary">Open the site</a> to apply; your answers stay here to copy.
        </p>
      )}
      <div className={cn('grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)]', panel ? 'lg:grid-cols-[minmax(0,1fr)_400px]' : 'lg:grid-cols-1')}>
        {/* Page */}
        <div className="relative h-[70vh] min-h-0 border-b bg-background lg:h-auto lg:border-b-0">
          {view === 'reader' && (
            <iframe title="Job posting" srcDoc={srcDoc} sandbox="allow-popups allow-popups-to-escape-sandbox" className="h-full w-full" data-testid="reader-frame" />
          )}
          {view === 'live' && (canLive ? (
            <iframe title="Live page" src={p.url} className="h-full w-full" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox" referrerPolicy="no-referrer" />
          ) : (
            <FrameBlocked host={host} url={p.url} board={data.board} onReader={() => setView('reader')} />
          ))}
          {view === 'apply' && (p.embedUrl ? (
            <iframe title="Application form" src={p.embedUrl} className="h-full w-full" data-testid="apply-frame" />
          ) : canLive ? (
            <iframe title="Application form" src={p.applyUrl} className="h-full w-full" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox" />
          ) : (
            <FrameBlocked host={host} url={p.applyUrl} board={data.board} onReader={() => setView('reader')} />
          ))}
        </div>

        {/* HunterOps control panel */}
        {panel && (
          <aside className="flex min-h-0 flex-col border-l bg-sidebar" aria-label="HunterOps control panel">
            <div className="border-b px-4 py-3">
              <p className="text-xs text-muted-foreground">{p.company}</p>
              <p className="line-clamp-2 text-sm font-semibold leading-5">{p.title}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {status === 'APPLIED' || status === 'INTERVIEW' || status === 'OFFER' ? (
                  <span className="inline-flex h-8 items-center gap-1.5 rounded-md bg-success/10 px-3 text-xs font-medium text-success"><CheckCircle2 className="h-3.5 w-3.5" /> {status.toLowerCase()}</span>
                ) : (
                  <>
                    <Button size="sm" variant="outline" onClick={() => setStatus('SAVED')} disabled={!!busy || status === 'SAVED'} data-testid="save-to-pipeline">
                      <Bookmark /> {status === 'SAVED' ? 'In pipeline' : 'Save to pipeline'}
                    </Button>
                    {jobId && <Button size="sm" asChild><Link href={`/apply/${jobId}`}><Wand2 /> Apply with AI</Link></Button>}
                    <Button size="sm" variant="outline" onClick={() => setStatus('APPLIED')} disabled={!!busy} data-testid="mark-applied"><CheckCircle2 /> Mark applied</Button>
                  </>
                )}
              </div>
            </div>
            <div className="grid grid-cols-4 border-b" role="tablist" aria-label="Tools">
              {TOOLS.map((t) => (
                <button
                  key={t.id} type="button" role="tab" aria-selected={tool === t.id} onClick={() => setTool(t.id)}
                  className={cn('flex flex-col items-center gap-1 border-b-2 py-2.5 text-[11px] font-medium transition-colors', tool === t.id ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}
                >
                  <t.icon className="h-4 w-4" /> {t.label}
                </button>
              ))}
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 [&>*]:shrink-0">
              {toolErr && <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive" role="alert">{toolErr}</p>}

              {tool === 'analyze' && (
                <>
                  <Button variant="outline" onClick={analyze} disabled={!!busy} data-testid="analyze">
                    <Flame /> {busy === 'analyze' ? 'Analyzing…' : 'Analyze this page'}
                  </Button>
                  <GrillCard g={data.grill} compact />
                </>
              )}

              {tool === 'autofill' && (
                <>
                  <p className="text-sm leading-6 text-muted-foreground">
                    {p.embedUrl ? 'Open the Apply form view, then copy each answer into its field.' : 'Copy each answer into the application form.'} You press Submit yourself.
                  </p>
                  <Button onClick={autofill} disabled={!!busy} data-testid="autofill">
                    <ClipboardList /> {busy === 'autofill' ? 'Filling… (AI writes the open questions)' : sheet ? 'Fill again' : 'Auto-fill answers'}
                  </Button>
                  {sheet && <AnswerSheet sheet={sheet} />}
                </>
              )}

              {tool === 'resume' && (
                <>
                  <p className="text-sm leading-6 text-muted-foreground">A one-page resume tailored to this posting, from your profile only. Checked for banned phrases and against DESIGN.md.</p>
                  <Button onClick={makeResume} disabled={!!busy} data-testid="browser-resume"><Wand2 /> {busy === 'resume' ? 'Generating… (up to a minute)' : 'Generate resume'}</Button>
                  {resume && (
                    <button type="button" className="flex items-center gap-2 rounded-md border bg-background p-3 text-left text-sm hover:bg-accent" onClick={() => run('pdf', () => download('/api/resume/render', { format: 'pdf', resumeId: resume.id }, 'Resume.pdf'))}>
                      <FileText className="h-4 w-4 shrink-0" /> <span className="min-w-0 flex-1 truncate">{resume.name}</span> <span className="meta">{resume.pages}p · PDF</span>
                    </button>
                  )}
                </>
              )}

              {tool === 'email' && (jobId ? <CoverLetterPanel key={jobId} jobId={jobId} initial={data?.coverLetter ?? null} /> : (
                <div className="flex flex-col gap-3">
                  <p className="text-sm text-muted-foreground">Save this job to your pipeline to write a cover letter for it.</p>
                  <Button variant="outline" onClick={() => setStatus('SAVED')} disabled={!!busy}><Bookmark /> Save to pipeline</Button>
                </div>
              ))}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

function FrameBlocked({ host, url, board, onReader }: { host: string; url: string; board?: string | null; onReader: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center" data-testid="frame-blocked">
      <Globe className="h-8 w-8 text-muted-foreground" />
      <div className="max-w-sm">
        <p className="font-semibold">{host} does not allow being shown inside other apps</p>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          {board
            ? `HunterOps looked for this job on the employer’s own careers site and did not find it, so the form is only on ${board}. Open the site to apply; your Auto-fill answers stay here to copy.`
            : 'The Reader view has the full posting. To submit, open the form on the site; your Auto-fill answers stay here to copy.'}
        </p>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" onClick={onReader}><BookOpen /> Reader</Button>
        <Button asChild><a href={url} target="_blank" rel="noopener noreferrer"><ExternalLink /> Open the site</a></Button>
      </div>
    </div>
  );
}

function AnswerSheet({ sheet }: { sheet: Sheet }) {
  const all = sheet.answers.filter((a) => a.value && a.type !== 'file').map((a) => `${a.label}\n${a.value}`).join('\n\n');
  return (
    <div className="flex flex-col gap-3" data-testid="answer-sheet">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{sheet.generic ? 'Standard application fields' : `${sheet.answers.length} fields on this form`}</p>
        <CopyButton text={all} label="Copy all" />
      </div>
      {sheet.answers.map((a) => (
        <div key={a.key} className="rounded-md border bg-background p-3" data-testid="answer">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-medium leading-5">{a.label}{a.required && <span className="text-destructive"> *</span>}</p>
            <span className={cn('shrink-0 rounded px-1.5 text-[10px] font-medium uppercase', a.source === 'ai' ? 'bg-primary/10 text-primary' : a.source === 'profile' ? 'bg-success/10 text-success' : 'bg-warning/15 text-warning')}>
              {a.source === 'ai' ? 'AI' : a.source === 'profile' ? 'Profile' : 'You'}
            </span>
          </div>
          {a.value ? (
            <div className="mt-1.5 flex items-start gap-2">
              <p className="min-w-0 flex-1 whitespace-pre-wrap text-sm leading-6 [overflow-wrap:anywhere]">{a.value}</p>
              {a.type !== 'file' && <CopyButton text={a.value} label="" aria-label={`Copy ${a.label}`} className="h-7 w-7 shrink-0 p-0" />}
            </div>
          ) : (
            <p className="mt-1.5 text-sm text-muted-foreground">{a.note || 'Fill this in yourself.'}</p>
          )}
        </div>
      ))}
    </div>
  );
}
