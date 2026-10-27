'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ExternalLink, Megaphone, Plus, Search, UsersRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { CopyButton } from '@/components/copy-button';
import { IconChip, Section } from '@/components/kit';
import { api } from '@/lib/api-client';
import { ATS_TARGETS, LOCATION_PRESETS, ROLE_PRESETS, WINDOWS, atsSearches, peopleSearches, type LocationKey, type WindowKey } from '@/lib/xray';

const PREFS_KEY = 'hunterops-xray';
const ATS_COLOURS: Record<string, string> = {
  greenhouse: 'bg-success/10 text-success',
  ashby: 'bg-primary/10 text-primary',
  lever: 'bg-info/10 text-info',
  smartrecruiters: 'bg-warning/15 text-warning',
  workday: 'bg-destructive/10 text-destructive',
};

export function DiscoverPanel() {
  const [roles, setRoles] = useState<string[]>(['Senior Recruiter', 'Talent Acquisition Partner']);
  const [locations, setLocations] = useState<LocationKey[]>(['bengaluru', 'remote']);
  const [window, setWindow] = useState<WindowKey>('d');
  const [extra, setExtra] = useState('');
  const [custom, setCustom] = useState('');

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
  }, []);
  useEffect(() => {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify({ roles, locations, window, extra })); } catch { /* private mode */ }
  }, [roles, locations, window, extra]);

  const input = { roles, locations, window, extra };
  const ats = useMemo(() => atsSearches(input), [roles, locations, window, extra]); // eslint-disable-line react-hooks/exhaustive-deps
  const people = useMemo(() => peopleSearches(input), [roles, locations, window, extra]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  return (
    <div className="flex flex-col gap-8">
      <div className="surface flex flex-col gap-5 p-4 md:p-5">
        <div className="flex flex-col gap-2">
          <span className="section-title">Roles</span>
          <div className="flex flex-wrap gap-2">
            {[...ROLE_PRESETS, ...roles.filter((r) => !(ROLE_PRESETS as readonly string[]).includes(r))].map((r) => (
              <button key={r} type="button" className="chip" data-on={roles.includes(r)} onClick={() => setRoles(toggle(roles, r))}>{r}</button>
            ))}
            <form
              className="flex items-center gap-1"
              onSubmit={(e) => { e.preventDefault(); if (custom.trim()) { setRoles([...roles, custom.trim()]); setCustom(''); } }}
            >
              <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="+ add a title" className="h-8 w-32 rounded-full border bg-card px-3 text-xs" aria-label="Add a role title" />
            </form>
          </div>
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <span className="section-title">Location</span>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(LOCATION_PRESETS) as LocationKey[]).map((l) => (
                <button key={l} type="button" className="chip" data-on={locations.includes(l)} onClick={() => setLocations(toggle(locations, l))}>{LOCATION_PRESETS[l].label}</button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <span className="section-title">Posted in the last</span>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(WINDOWS) as WindowKey[]).map((w) => (
                <button key={w} type="button" className="chip" data-on={window === w} onClick={() => setWindow(w)}>{WINDOWS[w].label}</button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="xr-extra">Extra keywords (optional)</Label>
          <Input id="xr-extra" value={extra} onChange={(e) => setExtra(e.target.value)} placeholder='e.g. ("GCC" OR "product") -intern' />
        </div>
      </div>

      <Section title="ATS X-Ray searches">
        <div className="grid gap-3 md:grid-cols-2">
          {ats.map((a) => (
            <div key={a.id} className="surface flex flex-col gap-3 p-4">
              <div className="flex items-center gap-3">
                <span className={`grid h-10 w-10 place-items-center rounded-xl text-sm font-extrabold ${ATS_COLOURS[a.id]}`}>{a.name.slice(0, 2)}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold leading-5">{a.name}</p>
                  <p className="text-xs text-muted-foreground">{a.note}</p>
                </div>
              </div>
              <code className="line-clamp-3 break-all rounded-lg bg-muted px-3 py-2 font-mono text-[11px] leading-4 text-muted-foreground">{a.query}</code>
              <div className="flex gap-2">
                <Button asChild size="sm" className="flex-1">
                  <a href={a.url} target="_blank" rel="noopener noreferrer"><Search /> Search {WINDOWS[window].label}</a>
                </Button>
                <CopyButton text={a.query} label="Query" />
              </div>
            </div>
          ))}
          <div className="surface flex flex-col justify-center gap-2 border-dashed p-4 text-sm leading-6 text-muted-foreground">
            <p className="font-semibold text-foreground">Tip</p>
            Open all five each morning. Postings found here usually have under 10 applicants. Paste any good one into Quick add below and it gets a Grill Score.
            <Button
              size="sm"
              variant="soft"
              className="mt-1 self-start"
              onClick={() => ats.forEach((a, i) => setTimeout(() => globalThis.open(a.url, '_blank', 'noopener'), i * 150))}
            >
              <ExternalLink /> Open all {ATS_TARGETS.length}
            </Button>
          </div>
        </div>
      </Section>

      <Section title="Find the people hiring">
        <div className="surface divide-y overflow-hidden">
          {people.map((p) => (
            <div key={p.id} className="flex items-center gap-3 p-3">
              <IconChip icon={p.id.startsWith("li") ? Megaphone : UsersRound} tone={p.id.startsWith('li') ? 'info' : 'primary'} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold leading-5">{p.name}</p>
                <p className="truncate text-xs text-muted-foreground">{p.note}</p>
              </div>
              <CopyButton text={p.query} label="" aria-label={`Copy ${p.name} query`} />
              <Button asChild size="sm"><a href={p.url} target="_blank" rel="noopener noreferrer">Open</a></Button>
            </div>
          ))}
        </div>
      </Section>

      <QuickAdd />
    </div>
  );
}

function QuickAdd() {
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
    <Section title="Quick add to pipeline">
      <form onSubmit={add} className="surface grid gap-3 p-4 md:grid-cols-2 md:p-5">
        <div className="flex flex-col gap-1.5 md:col-span-2">
          <Label htmlFor="qa-url">Posting link</Label>
          <Input id="qa-url" type="url" required value={form.url} onChange={set('url')} placeholder="https://jobs.ashbyhq.com/…" />
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
          <Label htmlFor="qa-jd">Job description (paste it for an accurate Grill Score)</Label>
          <Textarea id="qa-jd" rows={4} value={form.description} onChange={set('description')} />
        </div>
        <div className="flex items-center gap-3 md:col-span-2">
          <Button type="submit" disabled={busy}><Plus /> {busy ? 'Adding' : 'Add and grill'}</Button>
          {msg && <span className="text-sm text-destructive" role="alert">{msg}</span>}
        </div>
      </form>
    </Section>
  );
}
