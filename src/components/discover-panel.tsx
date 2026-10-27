'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Check, ExternalLink, Globe, Loader2, Plus, Radar, Search, Settings2, UsersRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { GrillScoreBadge } from '@/components/grill-score-badge';
import { OpenLinkForm } from '@/components/open-link-form';
import { ScanButton } from '@/components/scan-button';
import { api } from '@/lib/api-client';
import { cn, timeAgo } from '@/lib/utils';
import { LOCATION_PRESETS, ROLE_PRESETS, WINDOWS, type LocationKey, type WindowKey } from '@/lib/xray';

const PREFS_KEY = 'hunterops-xray';
const ATS_STYLE: Record<string, string> = {
  greenhouse: 'bg-success/10 text-success',
  ashby: 'bg-primary/10 text-primary',
  lever: 'bg-info/10 text-info',
  smartrecruiters: 'bg-warning/15 text-warning',
  workday: 'bg-destructive/10 text-destructive',
};

type WebItem = { title: string; company: string; url: string; snippet: string; age: string | null; ats: string; inApp: boolean; jobId: string | null };
type BoardItem = { id: string; title: string; company: string; location: string | null; url: string; source: string; postedAt: string | null; firstSeenAt: string; grillScore: number | null; status: string };
type Person = { name: string; url: string; snippet: string };
type Results = { web: WebItem[]; board: BoardItem[]; people: Person[]; webEnabled: boolean; provider: string | null; errors: string[] };
type Tab = 'web' | 'board' | 'people';

export function DiscoverPanel() {
  const [roles, setRoles] = useState<string[]>(['Senior Recruiter', 'Talent Acquisition Partner']);
  const [locations, setLocations] = useState<LocationKey[]>(['bengaluru', 'remote']);
  const [window, setWindow] = useState<WindowKey>('d');
  const [extra, setExtra] = useState('');
  const [custom, setCustom] = useState('');
  const [ready, setReady] = useState(false);
  const [res, setRes] = useState<Results | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState<Tab>('web');

  useEffect(() => {
    try {
      const p = JSON.parse(localStorage.getItem(PREFS_KEY) || 'null');
      if (p) {
        if (Array.isArray(p.roles)) setRoles(p.roles);
        if (Array.isArray(p.locations)) setLocations(p.locations);
        if (p.window in WINDOWS) setWindow(p.window);
        if (typeof p.extra === 'string') setExtra(p.extra);
      }
    } catch { /* no saved prefs */ }
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(PREFS_KEY, JSON.stringify({ roles, locations, window, extra })); } catch { /* private mode */ }
  }, [ready, roles, locations, window, extra]);

  const search = useCallback(async (people = false) => {
    setBusy(true);
    setErr('');
    try {
      const r = await api<Results>('/api/discover/search', { method: 'POST', json: { roles, locations, window, extra, people } });
      setRes(r);
      if (people) setTab('people');
      else if (!r.webEnabled || (!r.web.length && r.board.length)) setTab('board');
      else setTab('web');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [roles, locations, window, extra]);

  // Run once with the saved filters.
  useEffect(() => { if (ready) search(); }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const tabs: { id: Tab; label: string; icon: typeof Globe; n: number | null }[] = [
    { id: 'web', label: 'Web X-Ray', icon: Globe, n: res?.webEnabled ? res.web.length : null },
    { id: 'board', label: 'In HunterOps', icon: Radar, n: res ? res.board.length : null },
    { id: 'people', label: 'People hiring', icon: UsersRound, n: res?.people.length || null },
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
      {/* Filters */}
      <aside className="flex flex-col gap-4 lg:sticky lg:top-8 lg:self-start">
        <div className="surface flex flex-col gap-5 p-4">
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-muted-foreground">Roles</span>
            <div className="flex flex-wrap gap-1.5">
              {[...ROLE_PRESETS, ...roles.filter((r) => !(ROLE_PRESETS as readonly string[]).includes(r))].map((r) => (
                <button key={r} type="button" className="chip" data-on={roles.includes(r)} onClick={() => setRoles(toggle(roles, r))}>{r}</button>
              ))}
            </div>
            <form className="flex gap-1.5" onSubmit={(e) => { e.preventDefault(); if (custom.trim()) { setRoles([...roles, custom.trim()]); setCustom(''); } }}>
              <Input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Add a title" className="h-8 text-xs" aria-label="Add a role title" />
              <Button type="submit" size="sm" variant="outline" aria-label="Add title"><Plus /></Button>
            </form>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-muted-foreground">Location</span>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(LOCATION_PRESETS) as LocationKey[]).map((l) => (
                <button key={l} type="button" className="chip" data-on={locations.includes(l)} onClick={() => setLocations(toggle(locations, l))}>{LOCATION_PRESETS[l].label}</button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-muted-foreground">Posted in the last</span>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(WINDOWS) as WindowKey[]).map((w) => (
                <button key={w} type="button" className="chip" data-on={window === w} onClick={() => setWindow(w)}>{WINDOWS[w].label}</button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="xr-extra" className="text-xs font-medium text-muted-foreground">Extra keywords</Label>
            <Input id="xr-extra" value={extra} onChange={(e) => setExtra(e.target.value)} placeholder='"GCC" -intern' className="h-9" />
          </div>
          <Button onClick={() => search()} disabled={busy} data-testid="discover-search">
            {busy ? <Loader2 className="animate-spin" /> : <Search />} {busy ? 'Searching…' : 'Search'}
          </Button>
        </div>
        <div className="surface flex flex-col gap-2 p-4">
          <p className="text-sm font-medium">Company boards</p>
          <p className="text-xs leading-5 text-muted-foreground">Pull every new opening from the {`50+`} boards HunterOps tracks, plus Adzuna, Remotive and Himalayas.</p>
          <div className="self-start"><ScanButton label="Scan boards now" /></div>
        </div>
      </aside>

      {/* Results */}
      <section className="flex min-w-0 flex-col gap-4">
        <div className="flex items-center gap-1 border-b" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => (t.id === 'people' && res && !res.people.length && res.webEnabled ? search(true) : setTab(t.id))}
              className={cn('-mb-px inline-flex h-10 items-center gap-2 border-b-2 px-3 text-sm font-medium transition-colors', tab === t.id ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}
            >
              <t.icon className="h-4 w-4" /> {t.label}
              {t.n !== null && <span className="rounded bg-muted px-1.5 text-xs tabular-nums">{t.n}</span>}
            </button>
          ))}
        </div>
        {err && <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive" role="alert">{err}</p>}
        {res?.errors.length ? <p className="text-xs text-muted-foreground">Some searches failed: {res.errors.join(' ')}</p> : null}
        {!res && busy && <SkeletonRows />}

        {res && tab === 'web' && (res.webEnabled ? (
          res.web.length ? (
            <div className="surface divide-y" data-testid="web-results">
              {res.web.map((w) => <WebRow key={w.url} item={w} onAdded={(id) => setRes((r) => (r ? { ...r, web: r.web.map((x) => (x.url === w.url ? { ...x, jobId: id } : x)) } : r))} />)}
            </div>
          ) : <Empty>No postings on the five ATS sites match in this window. Try 48 hours or a week, or more role titles.</Empty>
        ) : <WebSetup />)}

        {res && tab === 'board' && (res.board.length ? (
          <div className="surface divide-y" data-testid="board-results">
            {res.board.map((j) => (
              <div key={j.id} className="flex items-center gap-3 px-4 py-3">
                <GrillScoreBadge score={j.grillScore} size="sm" />
                <div className="min-w-0 flex-1">
                  <Link href={`/browser/${j.id}`} className="line-clamp-1 text-sm font-medium hover:underline">{j.title}</Link>
                  <p className="truncate text-xs text-muted-foreground">{j.company}{j.location ? ` · ${j.location}` : ''} · {j.source}</p>
                </div>
                <span className="meta hidden sm:inline">{timeAgo(j.postedAt || j.firstSeenAt)}</span>
                <Button size="sm" variant="outline" asChild><Link href={`/browser/${j.id}`}>Open</Link></Button>
              </div>
            ))}
          </div>
        ) : <Empty>No matching jobs in HunterOps for this window yet. Press Scan boards now.</Empty>)}

        {res && tab === 'people' && (!res.webEnabled ? <WebSetup /> : res.people.length ? (
          <div className="surface divide-y" data-testid="people-results">
            {res.people.map((p) => (
              <div key={p.url} className="flex items-start gap-3 px-4 py-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-muted"><UsersRound className="h-4 w-4 text-muted-foreground" /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{p.name}</p>
                  <p className="line-clamp-2 text-xs leading-5 text-muted-foreground">{p.snippet}</p>
                </div>
                <Button size="sm" variant="outline" asChild><a href={p.url} target="_blank" rel="noopener noreferrer"><ExternalLink /> Profile</a></Button>
              </div>
            ))}
          </div>
        ) : <Empty>{busy ? 'Searching…' : 'No TA leaders found for these locations. Try India instead of Bengaluru.'}</Empty>)}

        <div className="surface flex flex-col gap-3 p-4">
          <p className="text-sm font-medium">Have a link already?</p>
          <OpenLinkForm placeholder="Paste a job link from any site" />
          <ManualAdd />
        </div>
      </section>
    </div>
  );
}

function WebRow({ item, onAdded }: { item: WebItem; onAdded: (id: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function add() {
    setBusy(true);
    setErr('');
    try {
      const { job } = await api<{ job: { id: string } }>('/api/jobs/import', { method: 'POST', json: { url: item.url } });
      onAdded(job.id);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start" data-testid="web-result">
      <span className={cn('mt-0.5 inline-flex h-6 shrink-0 items-center self-start rounded px-2 text-[11px] font-semibold capitalize', ATS_STYLE[item.ats] || 'bg-muted text-muted-foreground')}>{item.ats}</span>
      <div className="min-w-0 flex-1">
        <Link href={item.jobId ? `/browser/${item.jobId}` : `/browser?url=${encodeURIComponent(item.url)}`} className="text-sm font-medium hover:underline">{item.title}</Link>
        <p className="text-xs text-muted-foreground">{item.company}{item.age ? ` · ${item.age}` : ''}</p>
        <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{item.snippet}</p>
        {err && <p className="mt-1 text-xs text-destructive">{err}</p>}
      </div>
      <div className="flex shrink-0 gap-2">
        <Button size="sm" variant="outline" asChild>
          <Link href={item.jobId ? `/browser/${item.jobId}` : `/browser?url=${encodeURIComponent(item.url)}`}>Open</Link>
        </Button>
        {item.jobId ? (
          <Button size="sm" variant="secondary" disabled><Check /> Added</Button>
        ) : (
          <Button size="sm" onClick={add} disabled={busy} data-testid="add-result">{busy ? <Loader2 className="animate-spin" /> : <Plus />} Add</Button>
        )}
      </div>
    </div>
  );
}

function WebSetup() {
  return (
    <div className="surface flex flex-col gap-3 p-5" data-testid="web-setup">
      <p className="text-sm font-semibold">Turn on in-app web search</p>
      <p className="text-sm leading-6 text-muted-foreground">
        X-Ray searches of Greenhouse, Lever, Ashby, SmartRecruiters and Workday run through a search API and show here, inside HunterOps. Create a free key at serper.dev (2,500 searches free, no card), then paste it in Settings under Web search. Until then, the In HunterOps tab shows everything the board scanner found.
      </p>
      <Button asChild size="sm" className="self-start"><Link href="/settings#search"><Settings2 /> Add a search key</Link></Button>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">{children}</p>;
}

function SkeletonRows() {
  return (
    <div className="surface divide-y" aria-hidden>
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-4">
          <div className="h-8 w-8 animate-pulse rounded-md bg-muted" />
          <div className="flex flex-1 flex-col gap-2"><div className="h-3 w-1/2 animate-pulse rounded bg-muted" /><div className="h-3 w-1/3 animate-pulse rounded bg-muted" /></div>
        </div>
      ))}
    </div>
  );
}

// For LinkedIn or Naukri postings, which cannot be read by the server: paste the details.
function ManualAdd() {
  const router = useRouter();
  const [form, setForm] = useState({ url: '', title: '', company: '', location: '', description: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    try {
      const { job } = await api<{ job: { id: string } }>('/api/jobs', { method: 'POST', json: form });
      router.push(`/jobs/${job.id}`);
    } catch (err) {
      setMsg((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <details className="group">
      <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">LinkedIn or Naukri posting? Paste its details instead</summary>
      <form onSubmit={add} className="mt-3 grid gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-1.5 md:col-span-2">
          <Label htmlFor="qa-url">Posting link</Label>
          <Input id="qa-url" type="url" required value={form.url} onChange={set('url')} placeholder="https://www.linkedin.com/jobs/view/…" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="qa-title">Title</Label>
          <Input id="qa-title" required value={form.title} onChange={set('title')} placeholder="Senior Recruiter" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="qa-company">Company</Label>
          <Input id="qa-company" required value={form.company} onChange={set('company')} />
        </div>
        <div className="flex flex-col gap-1.5 md:col-span-2">
          <Label htmlFor="qa-loc">Location</Label>
          <Input id="qa-loc" value={form.location} onChange={set('location')} placeholder="Bengaluru (Hybrid)" />
        </div>
        <div className="flex flex-col gap-1.5 md:col-span-2">
          <Label htmlFor="qa-jd">Job description</Label>
          <Textarea id="qa-jd" rows={4} value={form.description} onChange={set('description')} />
        </div>
        <div className="flex items-center gap-3 md:col-span-2">
          <Button type="submit" disabled={busy}><Plus /> {busy ? 'Adding' : 'Add and grill'}</Button>
          {msg && <span className="text-sm text-destructive" role="alert">{msg}</span>}
        </div>
      </form>
    </details>
  );
}
