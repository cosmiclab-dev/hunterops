'use client';

import { useState } from 'react';
import { ThemeSwitch } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api-client';
import type { ProviderDef } from '@/lib/llm/providers';

type Pub = Record<string, { label: string; secret: boolean; source: string | null; value: string | null; hint: string | null }>;
type Company = { id: string; name: string; atsType: string; atsSlug: string; active: boolean; lastStatus: string | null; lastError: string | null; lastFound: number | null };

const LOCATION_OPTIONS = {
  bengaluru: 'Bengaluru',
  remote_india: 'Remote (India / APAC)',
  remote_global: 'Remote (anywhere)',
  india: 'Elsewhere in India',
  remote_other: 'Remote (other regions)',
};

function Section({ title, desc, children, id }: { title: string; desc?: React.ReactNode; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} className="surface flex scroll-mt-24 flex-col gap-4 p-4 md:p-5">
      <div>
        <h3 className="text-[15px] font-semibold">{title}</h3>
        {desc && <p className="mt-1 text-sm leading-6 text-muted-foreground">{desc}</p>}
      </div>
      {children}
    </section>
  );
}

// Settings are grouped the way people think about them; each group is a
// heading the index jumps to.
export const SETTINGS_GROUPS = [
  { id: 'selftest', label: 'Check' },
  { id: 'ai', label: 'AI' },
  { id: 'email', label: 'Email' },
  { id: 'search', label: 'Job search' },
  { id: 'writing', label: 'Writing' },
  { id: 'boards', label: 'Company boards' },
  { id: 'appearance', label: 'Appearance' },
] as const;

function Group({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <div id={`g-${id}`} className="flex scroll-mt-24 flex-col gap-3">
      <h2 className="px-4 text-[13px] uppercase tracking-[0.02em] text-muted-foreground">{title}</h2>
      {children}
    </div>
  );
}

function Status({ msg, err }: { msg: string; err: string }) {
  return <>{msg && <p className="meta" role="status">{msg}</p>}{err && <p className="text-sm text-destructive" role="alert">{err}</p>}</>;
}

export function SettingsForm({ initial, providers, companies: initialCompanies, appSecret, selfTest }: {
  initial: Pub; providers: Record<string, ProviderDef>; companies: Company[]; appSecret: boolean; selfTest?: React.ReactNode;
}) {
  const [s, setS] = useState(initial);
  const [provider, setProvider] = useState(initial.llm_provider.value || 'opencode');
  const [model, setModel] = useState(initial.llm_model.value || '');
  const [baseUrl, setBaseUrl] = useState(initial.llm_base_url.value || '');
  const [key, setKey] = useState('');
  const [ai, setAi] = useState({ msg: '', err: '', busy: false });

  const [gmail, setGmail] = useState({ user: initial.smtp_user.value || '', pass: '', name: initial.sender_name.value || '', cap: initial.daily_email_cap.value || '20' });
  const [mail, setMail] = useState({ msg: '', err: '' });
  const [auto, setAuto] = useState({ count: initial.auto_apply_count?.value || '3', min: initial.auto_apply_min_score?.value || '75' });
  const [autoMsg, setAutoMsg] = useState({ msg: '', err: '' });

  const [feed, setFeed] = useState({
    keywords: initial.feed_keywords.value || '',
    exclude: initial.feed_exclude.value || '',
    locations: (initial.feed_locations.value || '').split(',').filter(Boolean),
    adzunaId: initial.adzuna_app_id.value || '',
    adzunaKey: '',
  });
  const [feedMsg, setFeedMsg] = useState({ msg: '', err: '' });

  const [search, setSearch] = useState({ provider: initial.search_provider.value && initial.search_provider.value !== 'none' ? initial.search_provider.value : 'free', key: '' });
  const [searchMsg, setSearchMsg] = useState({ msg: '', err: '' });
  const [reader, setReader] = useState({ url: initial.crawl4ai_url?.value || '', token: '' });
  const [readerMsg, setReaderMsg] = useState({ msg: '', err: '' });
  const [banned, setBanned] = useState(initial.banned_words_extra.value || '');
  const [writing, setWriting] = useState({ tone: initial.writing_tone?.value || 'warm', length: initial.email_length?.value || 'standard', signature: initial.email_signature?.value || '' });
  const [writingMsg, setWritingMsg] = useState({ msg: '', err: '' });
  const [boardFilter, setBoardFilter] = useState<'all' | 'error' | 'paused'>('all');
  const boardMatch = (c: Company, f: 'all' | 'error' | 'paused') => (f === 'all' ? true : f === 'paused' ? !c.active : c.active && c.lastStatus === 'error');
  const [bannedMsg, setBannedMsg] = useState({ msg: '', err: '' });

  const [companies, setCompanies] = useState(initialCompanies);
  const [careersUrl, setCareersUrl] = useState('');
  const [srcMsg, setSrcMsg] = useState({ msg: '', err: '' });

  // An unknown saved provider (a typo in LLM_PROVIDER) must not blank the page.
  const def = providers[provider] ?? providers.opencode;
  const keyInfo = s[`llm_key_${provider}`];
  const effectiveModel = model || def.defaultModel;

  async function save(values: Record<string, string | null>) {
    const { settings } = await api<{ settings: Pub }>('/api/settings', { method: 'PUT', json: { values } });
    setS(settings);
    return settings;
  }

  async function saveAi() {
    setAi({ msg: '', err: '', busy: true });
    try {
      const values: Record<string, string | null> = { llm_provider: provider, llm_model: model || def.defaultModel || null };
      if (provider === 'custom') values.llm_base_url = baseUrl || null;
      if (key) values[`llm_key_${provider}`] = key;
      await save(values);
      setKey('');
      setAi({ msg: `Saved. HunterOps now writes with ${def.label} · ${model || def.defaultModel}.`, err: '', busy: false });
    } catch (e) {
      setAi({ msg: '', err: (e as Error).message, busy: false });
    }
  }

  async function testAi() {
    setAi({ msg: 'Testing…', err: '', busy: true });
    try {
      const r = await api<{ provider: string; model: string; reply: string; ms: number }>('/api/settings/test', {
        method: 'POST', json: { provider, model: effectiveModel, key: key || undefined, baseUrl: provider === 'custom' ? baseUrl : undefined },
      });
      setAi({ msg: `Connected to ${r.provider} · ${r.model} in ${r.ms} ms. Reply: "${r.reply}"`, err: '', busy: false });
    } catch (e) {
      setAi({ msg: '', err: (e as Error).message, busy: false });
    }
  }

  async function clearKey() {
    try {
      await save({ [`llm_key_${provider}`]: null });
      setAi({ msg: 'Key removed.', err: '', busy: false });
    } catch (e) {
      setAi({ msg: '', err: (e as Error).message, busy: false });
    }
  }

  async function saveMail() {
    setMail({ msg: '', err: '' });
    try {
      const values: Record<string, string | null> = { smtp_user: gmail.user || null, sender_name: gmail.name || null, daily_email_cap: gmail.cap || null };
      if (gmail.pass) values.smtp_app_password = gmail.pass;
      await save(values);
      setGmail((g) => ({ ...g, pass: '' }));
      setMail({ msg: 'Saved.', err: '' });
    } catch (e) {
      setMail({ msg: '', err: (e as Error).message });
    }
  }

  async function saveReader() {
    setReaderMsg({ msg: '', err: '' });
    try {
      const values: Record<string, string | null> = { crawl4ai_url: reader.url.trim() || null };
      if (reader.token) values.crawl4ai_token = reader.token;
      await save(values);
      setReader({ ...reader, token: '' });
      setReaderMsg({ msg: reader.url.trim() ? 'Saved. Pages that need a browser now open through your page reader.' : 'Saved. The page reader is off.', err: '' });
    } catch (e) {
      setReaderMsg({ msg: '', err: (e as Error).message });
    }
  }

  async function testReader() {
    setReaderMsg({ msg: 'Testing… (up to 30 seconds)', err: '' });
    try {
      const out = await api<{ detail: string }>('/api/settings/test-reader', { method: 'POST', json: { url: reader.url, token: reader.token || undefined } });
      setReaderMsg({ msg: `Working. ${out.detail}`, err: '' });
    } catch (e) {
      setReaderMsg({ msg: '', err: (e as Error).message });
    }
  }

  async function saveSearch() {
    setSearchMsg({ msg: '', err: '' });
    try {
      const values: Record<string, string | null> = { search_provider: search.provider };
      if (search.key) values.search_api_key = search.key;
      await save(values);
      setSearch({ ...search, key: '' });
      setSearchMsg({ msg: 'Saved. Discover now shows web results inside HunterOps.', err: '' });
    } catch (e) {
      setSearchMsg({ msg: '', err: (e as Error).message });
    }
  }

  async function saveBanned() {
    setBannedMsg({ msg: '', err: '' });
    try {
      await save({ banned_words_extra: banned.trim() || null });
      setBannedMsg({ msg: 'Saved. Drafts with these words are rewritten or rejected.', err: '' });
    } catch (e) {
      setBannedMsg({ msg: '', err: (e as Error).message });
    }
  }

  async function saveWriting() {
    setWritingMsg({ msg: '', err: '' });
    try {
      await save({ writing_tone: writing.tone, email_length: writing.length, email_signature: writing.signature.trim() || null });
      setWritingMsg({ msg: 'Saved. New drafts use this style.', err: '' });
    } catch (e) {
      setWritingMsg({ msg: '', err: (e as Error).message });
    }
  }

  async function saveAuto() {
    setAutoMsg({ msg: '', err: '' });
    try {
      await save({ auto_apply_count: auto.count.trim() || null, auto_apply_min_score: auto.min.trim() || null });
      setAutoMsg({ msg: 'Saved.', err: '' });
    } catch (e) {
      setAutoMsg({ msg: '', err: (e as Error).message });
    }
  }

  async function saveFeed() {
    setFeedMsg({ msg: '', err: '' });
    try {
      const values: Record<string, string | null> = {
        feed_keywords: feed.keywords || null,
        feed_exclude: feed.exclude || null,
        feed_locations: feed.locations.join(',') || null,
        adzuna_app_id: feed.adzunaId || null,
      };
      if (feed.adzunaKey) values.adzuna_app_key = feed.adzunaKey;
      await save(values);
      setFeedMsg({ msg: 'Saved. The next scan uses these.', err: '' });
    } catch (e) {
      setFeedMsg({ msg: '', err: (e as Error).message });
    }
  }

  async function addCompany(e: React.FormEvent) {
    e.preventDefault();
    setSrcMsg({ msg: '', err: '' });
    try {
      const { company } = await api<{ company: Company }>('/api/companies', { method: 'POST', json: { url: careersUrl } });
      setCompanies((list) => [company, ...list.filter((c) => c.id !== company.id)]);
      setCareersUrl('');
      setSrcMsg({ msg: `Added ${company.name} (${company.atsType}).`, err: '' });
    } catch (e2) {
      setSrcMsg({ msg: '', err: (e2 as Error).message });
    }
  }

  async function toggle(c: Company) {
    try {
      const { company } = await api<{ company: Company }>(`/api/companies/${c.id}`, { method: 'PATCH', json: { active: !c.active } });
      setCompanies((list) => list.map((x) => (x.id === c.id ? company : x)));
    } catch (e) {
      setSrcMsg({ msg: '', err: (e as Error).message });
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[180px_minmax(0,1fr)]">
      <nav aria-label="Settings sections" className="scroll-x sticky top-14 z-10 -mt-2 flex gap-1.5 bg-background/95 py-2 backdrop-blur lg:top-6 lg:mx-0 lg:flex-col lg:self-start lg:px-0 lg:py-0">
        {SETTINGS_GROUPS.map((g) => (
          <a key={g.id} href={`#g-${g.id}`} className="chip shrink-0 lg:h-9 lg:justify-start lg:rounded-md lg:border-0 lg:bg-transparent lg:px-3 lg:text-sm lg:hover:bg-accent">{g.label}</a>
        ))}
      </nav>
      <div className="flex min-w-0 flex-col gap-8">
      {!appSecret && (
        <p className="rounded-xl border border-destructive bg-destructive/5 p-4 text-sm leading-5">
          APP_SECRET is not set (or shorter than 32 characters), so API keys cannot be saved here. Add it in Vercel environment variables, or set the provider key as an environment variable instead.
        </p>
      )}
        <Group id="selftest" title="Check">{selfTest}</Group>
        <Group id="ai" title="AI">
      <Section title="AI model" desc="Writes your emails, evaluations and prep. Default: OpenCode Go with DeepSeek. Any provider works the same way: pick it, paste a key, pick a model.">
        <div className="flex flex-col gap-1">
          <Label htmlFor="provider">Provider</Label>
          <select id="provider" value={provider} onChange={(e) => { setProvider(e.target.value); setModel(''); setKey(''); }} className="h-11 rounded-xl border border-input bg-card px-3.5">
            {Object.entries(providers).map(([id, p]) => <option key={id} value={id}>{p.label}</option>)}
          </select>
        </div>
        {provider === 'custom' && (
          <div className="flex flex-col gap-1">
            <Label htmlFor="base">Base URL</Label>
            <Input id="base" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.together.xyz/v1" />
            <p className="meta">{def.docs}</p>
          </div>
        )}
        <div className="flex flex-col gap-1">
          <Label htmlFor="model">Model</Label>
          <Input id="model" list="models" value={model} onChange={(e) => setModel(e.target.value)} placeholder={def.defaultModel || 'Type the model id'} />
          <datalist id="models">{def.models.map((m) => <option key={m} value={m} />)}</datalist>
          {def.models.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {def.models.map((m) => <button key={m} type="button" className="chip h-7 font-mono text-[11px]" data-on={(model || def.defaultModel) === m} onClick={() => setModel(m)}>{m}</button>)}
            </div>
          )}
          {provider !== 'custom' && <p className="meta">Model list: {def.docs}</p>}
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="key">API key</Label>
          <Input id="key" type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)}
            placeholder={keyInfo?.hint ? `Saved: ${keyInfo.hint}${keyInfo.source === 'env' ? ' (from env)' : ''}` : 'Paste key'} />
          <p className="meta">Encrypted with APP_SECRET before it is stored. Never shown again.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={saveAi} disabled={ai.busy}>Save</Button>
          <Button variant="outline" onClick={testAi} disabled={ai.busy}>Test connection</Button>
          {keyInfo?.source === 'app' && <Button variant="ghost" onClick={clearKey}>Remove saved key</Button>}
        </div>
        <Status msg={ai.msg} err={ai.err} />
      </Section>
        </Group>
        <Group id="email" title="Email">
      <Section title="Gmail" desc="Use a Google app password (Google Account → Security → App passwords). An email only goes out when you press Approve and send on that draft.">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-1"><Label htmlFor="guser">Gmail address</Label><Input id="guser" type="email" value={gmail.user} onChange={(e) => setGmail({ ...gmail, user: e.target.value })} /></div>
          <div className="flex flex-col gap-1"><Label htmlFor="gpass">App password</Label><Input id="gpass" type="password" autoComplete="off" value={gmail.pass} onChange={(e) => setGmail({ ...gmail, pass: e.target.value })} placeholder={s.smtp_app_password.hint ? `Saved: ${s.smtp_app_password.hint}` : '16 characters'} /></div>
          <div className="flex flex-col gap-1"><Label htmlFor="gname">Your name on emails</Label><Input id="gname" value={gmail.name} onChange={(e) => setGmail({ ...gmail, name: e.target.value })} /></div>
          <div className="flex flex-col gap-1"><Label htmlFor="gcap">Max emails per day</Label><Input id="gcap" inputMode="numeric" value={gmail.cap} onChange={(e) => setGmail({ ...gmail, cap: e.target.value })} /></div>
        </div>
        <Button className="self-start" onClick={saveMail}>Save</Button>
        <Status {...mail} />
      </Section>
        </Group>
        <Group id="search" title="Job search">
      <Section title="Applications" id="applications" desc="Each morning after the scan, the AI prepares applications for your best new matches: answers, a tailored resume and a cover letter. They wait on the Pipeline as Approval pending. Nothing is ever submitted for you.">
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1"><Label htmlFor="acount">Each morning (0 = off)</Label><Input id="acount" inputMode="numeric" value={auto.count} onChange={(e) => setAuto({ ...auto, count: e.target.value })} /></div>
          <div className="flex flex-col gap-1"><Label htmlFor="amin">Lowest Grill Score</Label><Input id="amin" inputMode="numeric" value={auto.min} onChange={(e) => setAuto({ ...auto, min: e.target.value })} /></div>
        </div>
        <Button className="self-start" onClick={saveAuto}>Save</Button>
        <Status {...autoMsg} />
      </Section>
      <Section title="Job feed" desc="What the scan looks for. Changes apply from the next scan.">
        <div className="flex flex-col gap-1"><Label htmlFor="kw">Role keywords (comma separated)</Label><Textarea id="kw" rows={3} value={feed.keywords} onChange={(e) => setFeed({ ...feed, keywords: e.target.value })} /></div>
        <div className="flex flex-col gap-1"><Label htmlFor="ex">Exclude titles with</Label><Input id="ex" value={feed.exclude} onChange={(e) => setFeed({ ...feed, exclude: e.target.value })} /></div>
        <fieldset className="flex flex-col gap-2">
          <legend className="label-caps mb-2 text-muted-foreground">Locations</legend>
          {Object.entries(LOCATION_OPTIONS).map(([k, label]) => (
            <label key={k} className="flex items-center gap-3 text-sm">
              <input type="checkbox" className="h-5 w-5 accent-[hsl(var(--primary))]" checked={feed.locations.includes(k)}
                onChange={(e) => setFeed({ ...feed, locations: e.target.checked ? [...feed.locations, k] : feed.locations.filter((x) => x !== k) })} />
              {label}
            </label>
          ))}
        </fieldset>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-1"><Label htmlFor="az1">Adzuna app ID (optional)</Label><Input id="az1" value={feed.adzunaId} onChange={(e) => setFeed({ ...feed, adzunaId: e.target.value })} /></div>
          <div className="flex flex-col gap-1"><Label htmlFor="az2">Adzuna app key</Label><Input id="az2" type="password" value={feed.adzunaKey} onChange={(e) => setFeed({ ...feed, adzunaKey: e.target.value })} placeholder={s.adzuna_app_key.hint ? `Saved: ${s.adzuna_app_key.hint}` : ''} /></div>
        </div>
        <Button className="self-start" onClick={saveFeed}>Save</Button>
        <Status {...feedMsg} />
      </Section>
      <Section title="Web search" id="search" desc="Used by Discover, company research and contact finding. Bing and DuckDuckGo often refuse requests from cloud servers like Vercel, so a free Serper key (serper.dev, 2,500 searches) is the reliable choice.">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor="sprov">Search source</Label>
            <select id="sprov" value={search.provider} onChange={(e) => setSearch({ ...search, provider: e.target.value })} className="h-11 rounded-xl border border-input bg-card px-3.5">
              <option value="serper">Serper (Google results, free key)</option>
              <option value="free">Bing + DuckDuckGo (no key, often refused)</option>
              <option value="brave">Brave Search API (key)</option>
            </select>
          </div>
          {search.provider !== 'free' && (
            <div className="flex flex-col gap-1">
              <Label htmlFor="skey">API key</Label>
              <Input id="skey" type="password" autoComplete="off" value={search.key} onChange={(e) => setSearch({ ...search, key: e.target.value })} placeholder={s.search_api_key.hint ? `Saved: ${s.search_api_key.hint}` : 'Paste key'} />
            </div>
          )}
        </div>
        <Button className="self-start" onClick={saveSearch}>Save</Button>
        <Status {...searchMsg} />
      </Section>
      <Section title="Page reader" id="reader" desc="Some job sites build the posting with JavaScript, so a plain read finds almost nothing. Those pages already open through a built-in reader, with nothing to set up. Optional: add your own Crawl4AI server here to use it instead. Sites that block automated readers stay blocked.">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor="c4url">Server address</Label>
            <Input id="c4url" inputMode="url" autoComplete="off" value={reader.url} onChange={(e) => setReader({ ...reader, url: e.target.value })} placeholder="https://crawl.yourdomain.com" />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="c4tok">Password or token</Label>
            <Input id="c4tok" type="password" autoComplete="off" value={reader.token} onChange={(e) => setReader({ ...reader, token: e.target.value })} placeholder={s.crawl4ai_token.hint ? `Saved: ${s.crawl4ai_token.hint}` : 'user:password or token'} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={saveReader}>Save</Button>
          <Button variant="outline" onClick={testReader} disabled={!reader.url.trim()}>Test</Button>
        </div>
        <Status {...readerMsg} />
      </Section>
        </Group>
        <Group id="writing" title="Writing">
      <Section title="Email style" desc="Applies to every new email and cover letter draft.">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor="tone">Tone</Label>
            <select id="tone" value={writing.tone} onChange={(e) => setWriting({ ...writing, tone: e.target.value })} className="h-11 rounded-xl border border-input bg-card px-3.5">
              <option value="warm">Warm: like a colleague</option>
              <option value="formal">Formal: large companies, senior leaders</option>
              <option value="direct">Direct: the point first, no pleasantries</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="elen">Length</Label>
            <select id="elen" value={writing.length} onChange={(e) => setWriting({ ...writing, length: e.target.value })} className="h-11 rounded-xl border border-input bg-card px-3.5">
              <option value="standard">Standard (up to 120 words)</option>
              <option value="short">Short (up to 80 words)</option>
            </select>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="sig">Signature</Label>
          <Textarea id="sig" rows={3} value={writing.signature} onChange={(e) => setWriting({ ...writing, signature: e.target.value })} placeholder={'Divya Sharma\nSenior Recruiter · +91 98xxxxxxx · linkedin.com/in/…'} />
        </div>
        <Button className="self-start" onClick={saveWriting}>Save</Button>
        <Status {...writingMsg} />
      </Section>
      <Section title="Banned words" desc="On top of the built-in list (delve, testament to, landscape, tapestry…). Comma or one per line. A draft that still uses them after one rewrite is rejected.">
        <Textarea id="banned" rows={3} value={banned} onChange={(e) => setBanned(e.target.value)} placeholder="synergy, leverage, passionate" aria-label="Extra banned words" />
        <Button className="self-start" onClick={saveBanned}>Save</Button>
        <Status {...bannedMsg} />
      </Section>
        </Group>
        <Group id="boards" title="Company boards">
      <Section title={`Company boards (${companies.filter((c) => c.active).length} active)`} desc="Career sites the scan reads directly. Paste any Greenhouse, Lever, Ashby, SmartRecruiters, Workday, Recruitee or Workable link to add one. Boards that no longer exist pause themselves.">
        <form onSubmit={addCompany} className="flex gap-2">
          <Input value={careersUrl} onChange={(e) => setCareersUrl(e.target.value)} placeholder="Careers URL: boards.greenhouse.io/acme, jobs.lever.co/acme…" aria-label="Careers URL" required />
          <Button type="submit">Add</Button>
        </form>
        <Status {...srcMsg} />
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter boards">
          {(['all', 'error', 'paused'] as const).map((f) => (
            <button key={f} type="button" className="chip" data-on={boardFilter === f} onClick={() => setBoardFilter(f)}>
              {f === 'all' ? 'All' : f === 'error' ? 'Errors' : 'Paused'} <span className="opacity-70">{companies.filter((c) => boardMatch(c, f)).length}</span>
            </button>
          ))}
        </div>
        <ul className="flex max-h-[28rem] flex-col overflow-y-auto">
          {companies.filter((c) => boardMatch(c, boardFilter)).map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 border-t py-2">
              <div className="min-w-0">
                <p className={`truncate text-sm ${c.active ? '' : 'line-through opacity-50'}`}>{c.name}</p>
                <p className="meta truncate">{c.atsType} · {c.lastStatus === 'error' ? `error: ${c.lastError}` : c.lastStatus ? `${c.lastFound ?? 0} matching last scan` : 'not scanned yet'}</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => toggle(c)}>{c.active ? 'Pause' : 'Resume'}</Button>
            </li>
          ))}
        </ul>
      </Section>
        </Group>
        <Group id="appearance" title="Appearance">
      <Section title="Theme" desc="Auto follows your iPhone’s light or dark mode.">
        <ThemeSwitch />
      </Section>
        </Group>
      </div>
    </div>
  );
}
