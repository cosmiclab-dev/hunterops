'use client';

import { useState } from 'react';
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 border-t pt-6">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Status({ msg, err }: { msg: string; err: string }) {
  return <>{msg && <p className="meta" role="status">{msg}</p>}{err && <p className="text-sm text-destructive" role="alert">{err}</p>}</>;
}

export function SettingsForm({ initial, providers, companies: initialCompanies, appSecret }: {
  initial: Pub; providers: Record<string, ProviderDef>; companies: Company[]; appSecret: boolean;
}) {
  const [s, setS] = useState(initial);
  const [provider, setProvider] = useState(initial.llm_provider.value || 'opencode');
  const [model, setModel] = useState(initial.llm_model.value || '');
  const [baseUrl, setBaseUrl] = useState(initial.llm_base_url.value || '');
  const [key, setKey] = useState('');
  const [ai, setAi] = useState({ msg: '', err: '', busy: false });

  const [gmail, setGmail] = useState({ user: initial.smtp_user.value || '', pass: '', name: initial.sender_name.value || '', cap: initial.daily_email_cap.value || '20' });
  const [mail, setMail] = useState({ msg: '', err: '' });

  const [feed, setFeed] = useState({
    keywords: initial.feed_keywords.value || '',
    exclude: initial.feed_exclude.value || '',
    locations: (initial.feed_locations.value || '').split(',').filter(Boolean),
    adzunaId: initial.adzuna_app_id.value || '',
    adzunaKey: '',
  });
  const [feedMsg, setFeedMsg] = useState({ msg: '', err: '' });

  const [companies, setCompanies] = useState(initialCompanies);
  const [careersUrl, setCareersUrl] = useState('');
  const [srcMsg, setSrcMsg] = useState({ msg: '', err: '' });

  const def = providers[provider];
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
    <div className="flex flex-col gap-8">
      {!appSecret && (
        <p className="rounded-lg border border-destructive p-4 text-sm leading-5">
          APP_SECRET is not set (or shorter than 32 characters), so API keys cannot be saved here. Add it in Vercel environment variables, or set the provider key as an environment variable instead.
        </p>
      )}

      <Section title="AI model">
        <p className="text-sm leading-5">Default: OpenCode Go with DeepSeek. Any provider below works the same way: pick it, paste a key, pick a model. The custom option takes any OpenAI-compatible API.</p>
        <div className="flex flex-col gap-1">
          <Label htmlFor="provider">Provider</Label>
          <select id="provider" value={provider} onChange={(e) => { setProvider(e.target.value); setModel(''); setKey(''); }} className="h-10 rounded-md border bg-background px-3">
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

      <Section title="Gmail (recruiter emails)">
        <p className="text-sm leading-5">Use a Google app password (Google Account → Security → App passwords). Emails only go out when you press Approve and send on a draft.</p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-1"><Label htmlFor="guser">Gmail address</Label><Input id="guser" type="email" value={gmail.user} onChange={(e) => setGmail({ ...gmail, user: e.target.value })} /></div>
          <div className="flex flex-col gap-1"><Label htmlFor="gpass">App password</Label><Input id="gpass" type="password" autoComplete="off" value={gmail.pass} onChange={(e) => setGmail({ ...gmail, pass: e.target.value })} placeholder={s.smtp_app_password.hint ? `Saved: ${s.smtp_app_password.hint}` : '16 characters'} /></div>
          <div className="flex flex-col gap-1"><Label htmlFor="gname">Your name on emails</Label><Input id="gname" value={gmail.name} onChange={(e) => setGmail({ ...gmail, name: e.target.value })} /></div>
          <div className="flex flex-col gap-1"><Label htmlFor="gcap">Max emails per day</Label><Input id="gcap" inputMode="numeric" value={gmail.cap} onChange={(e) => setGmail({ ...gmail, cap: e.target.value })} /></div>
        </div>
        <Button className="self-start" onClick={saveMail}>Save</Button>
        <Status {...mail} />
      </Section>

      <Section title="Job feed">
        <div className="flex flex-col gap-1"><Label htmlFor="kw">Role keywords (comma separated)</Label><Textarea id="kw" rows={3} value={feed.keywords} onChange={(e) => setFeed({ ...feed, keywords: e.target.value })} /></div>
        <div className="flex flex-col gap-1"><Label htmlFor="ex">Exclude titles with</Label><Input id="ex" value={feed.exclude} onChange={(e) => setFeed({ ...feed, exclude: e.target.value })} /></div>
        <fieldset className="flex flex-col gap-2">
          <legend className="label-caps mb-2">Locations</legend>
          {Object.entries(LOCATION_OPTIONS).map(([k, label]) => (
            <label key={k} className="flex items-center gap-3 text-sm">
              <input type="checkbox" className="h-5 w-5" checked={feed.locations.includes(k)}
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

      <Section title={`Company boards (${companies.filter((c) => c.active).length} active)`}>
        <form onSubmit={addCompany} className="flex gap-2">
          <Input value={careersUrl} onChange={(e) => setCareersUrl(e.target.value)} placeholder="Careers URL: boards.greenhouse.io/acme, jobs.lever.co/acme…" aria-label="Careers URL" required />
          <Button type="submit">Add</Button>
        </form>
        <Status {...srcMsg} />
        <ul className="flex flex-col">
          {companies.map((c) => (
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
    </div>
  );
}
