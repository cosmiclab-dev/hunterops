'use client';

import { IconChip } from '@/components/kit';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { Plus, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NumberInput } from '@/components/ui/number-input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api-client';
import type { ProfileInput } from '@/lib/profile';

const EMPTY: ProfileInput = {
  name: '', headline: '', email: '', phone: '', location: '', linkedin: '', portfolio: '', summary: '',
  skills: [], experience: [], education: [], certifications: [], achievements: [],
  yearsExperience: null, acceptRemote: true, acceptHybrid: true, onsiteCities: ['Bengaluru'],
  expectedSalaryLpa: null, currentCtcLpa: null, noticePeriod: '',
  targetRoles: [], dealbreakers: [], companyTypes: [], languages: [],
};

const COMPANY_TYPES = { gcc: 'GCC / MNC capability centre', product: 'Product company or startup', enterprise: 'Indian enterprise', services: 'IT services / consulting', staffing: 'Staffing or RPO firm' } as const;

const SECTIONS = [['basics', 'Basics'], ['goals', 'What you want'], ['pay', 'Pay and notice'], ['where', 'Where you work'], ['skills', 'Skills and summary'], ['experience', 'Experience'], ['education', 'Education']] as const;

const lines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean);

function Field({ label, id, hint, children }: { label: string; id: string; hint?: string; children: React.ReactNode }) {
  return <div className="flex flex-col gap-1"><Label htmlFor={id}>{label}</Label>{children}{hint && <p className="meta">{hint}</p>}</div>;
}

function Card({ id, title, desc, action, className = '', children }: { id: string; title: string; desc?: string; action?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return (
    <section id={`p-${id}`} className="surface flex scroll-mt-24 flex-col gap-4 p-4 md:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold">{title}</h2>
          {desc && <p className="mt-1 text-sm leading-6 text-muted-foreground">{desc}</p>}
        </div>
        {action}
      </div>
      <div className={className || 'flex flex-col gap-4'}>{children}</div>
    </section>
  );
}

export function ProfileEditor({ initial }: { initial: ProfileInput | null }) {
  const router = useRouter();
  const [p, setP] = useState<ProfileInput>(initial ?? EMPTY);
  const [skillsText, setSkillsText] = useState((initial?.skills ?? []).join(', '));
  const [citiesText, setCitiesText] = useState((initial?.onsiteCities ?? ['Bengaluru']).join(', '));
  const [langsText, setLangsText] = useState((initial?.languages ?? []).join(', '));
  const [busy, setBusy] = useState('');
  // Bumped when lists are replaced wholesale, so uncontrolled textareas remount.
  const [rev, setRev] = useState(0);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const set = <K extends keyof ProfileInput>(k: K, v: ProfileInput[K]) => setP((x) => ({ ...x, [k]: v }));

  async function importFile(f: File) {
    setBusy('import');
    setErr('');
    setMsg(`Reading ${f.name}…`);
    try {
      const form = new FormData();
      form.append('file', f);
      const { draft, model, chars, warning } = await api<{ draft: ProfileInput; model: string | null; chars: number; warning: string | null }>('/api/profile/import', { method: 'POST', body: form });
      setP({ ...draft, acceptRemote: p.acceptRemote, acceptHybrid: p.acceptHybrid, onsiteCities: p.onsiteCities, expectedSalaryLpa: p.expectedSalaryLpa, currentCtcLpa: p.currentCtcLpa, noticePeriod: p.noticePeriod });
      setSkillsText(draft.skills.join(', '));
      setLangsText((draft.languages ?? []).join(', '));
      setRev((r) => r + 1);
      setMsg(warning || `Read ${chars.toLocaleString()} characters with ${model}. Check everything below, then Save.`);
    } catch (e) {
      setErr((e as Error).message);
      setMsg('');
    } finally {
      setBusy('');
      if (file.current) file.current.value = '';
    }
  }

  async function save() {
    setBusy('save');
    setErr('');
    try {
      const body = {
        ...p,
        skills: skillsText.split(',').map((s) => s.trim()).filter(Boolean),
        onsiteCities: citiesText.split(',').map((s) => s.trim()).filter(Boolean),
        languages: langsText.split(',').map((s) => s.trim()).filter(Boolean),
      };
      const out = await api<{ profile: ProfileInput; grilled: number; warning: string | null }>('/api/profile', { method: 'PUT', json: { profile: body } });
      // Show exactly what was stored.
      setP(out.profile);
      setSkillsText(out.profile.skills.join(', '));
      setCitiesText(out.profile.onsiteCities.join(', '));
      setLangsText(out.profile.languages.join(', '));
      setMsg(out.warning ? `Saved. ${out.warning}` : `Saved. ${out.grilled} jobs re-scored.`);
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy('');
    }
  }

  const exp = p.experience;
  const setExp = (i: number, patch: Partial<ProfileInput['experience'][number]>) =>
    set('experience', exp.map((e, n) => (n === i ? { ...e, ...patch } : e)));

  return (
    <div className="flex flex-col gap-5">
      <section className="surface flex flex-col gap-3 p-4 md:p-5">
        <div className="flex items-start gap-3">
          <IconChip icon={Upload} tone="primary" />
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold">Import your resume</h2>
            <p className="text-sm leading-5 text-muted-foreground">PDF, DOCX or TXT. AI fills in the fields below. Nothing saves until you tap Save.</p>
          </div>
        </div>
        <input ref={file} type="file" accept=".pdf,.docx,.txt,.md" className="hidden" onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} data-testid="resume-file" />
        <Button className="self-start" onClick={() => file.current?.click()} disabled={!!busy}>
          <Upload /> {busy === 'import' ? 'Reading…' : 'Choose file'}
        </Button>
      </section>

      <nav aria-label="Profile sections" className="scroll-x sticky top-14 z-10 flex gap-1.5 bg-background/95 py-2 backdrop-blur lg:top-0">
        {SECTIONS.map(([id, label]) => <a key={id} href={`#p-${id}`} className="chip shrink-0">{label}</a>)}
      </nav>

      <Card id="basics" title="Basics" desc="How you appear on resumes, emails and application forms." className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Name" id="name"><Input id="name" value={p.name} onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label="Headline" id="headline"><Input id="headline" value={p.headline} onChange={(e) => set('headline', e.target.value)} placeholder="Senior Recruiter, Tech and GCC hiring" /></Field>
        <Field label="Email" id="email"><Input id="email" type="email" value={p.email} onChange={(e) => set('email', e.target.value)} /></Field>
        <Field label="Phone" id="phone"><Input id="phone" value={p.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
        <Field label="Location" id="location"><Input id="location" value={p.location} onChange={(e) => set('location', e.target.value)} /></Field>
        <Field label="LinkedIn" id="linkedin"><Input id="linkedin" value={p.linkedin} onChange={(e) => set('linkedin', e.target.value)} /></Field>
        <Field label="Years of experience" id="years">
          <NumberInput id="years" value={p.yearsExperience} onValue={(n) => set('yearsExperience', n)} />
        </Field>
        <Field label="Portfolio" id="portfolio"><Input id="portfolio" value={p.portfolio} onChange={(e) => set('portfolio', e.target.value)} /></Field>
        <Field label="Languages" id="langs" hint="Comma separated, e.g. English, Hindi, Kannada">
          <Input id="langs" value={langsText} onChange={(e) => setLangsText(e.target.value)} />
        </Field>
      </Card>

      <Card id="goals" title="What you want" desc="The full evaluation scores each job against these. Leave blank and it uses your headline.">
        <Field label="Target roles (one per line)" id="targets" hint="e.g. Senior TA Partner, TA Lead, Talent Acquisition Manager">
          <Textarea id="targets" rows={3} defaultValue={p.targetRoles.join('\n')} key={`t${rev}`} onBlur={(e) => set('targetRoles', lines(e.target.value))} />
        </Field>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium">Employers you prefer</legend>
          {Object.entries(COMPANY_TYPES).map(([k, label]) => (
            <label key={k} className="flex items-center gap-3 text-sm">
              <input type="checkbox" className="h-5 w-5 accent-[hsl(var(--primary))]" checked={p.companyTypes.includes(k)}
                onChange={(e) => set('companyTypes', e.target.checked ? [...p.companyTypes, k] : p.companyTypes.filter((x) => x !== k))} />
              {label}
            </label>
          ))}
        </fieldset>
        <Field label="Dealbreakers (one per line)" id="deal" hint="Flagged as red flags in every evaluation, e.g. 5 days in office, bond or training repayment, night shifts">
          <Textarea id="deal" rows={3} defaultValue={p.dealbreakers.join('\n')} key={`d${rev}`} onBlur={(e) => set('dealbreakers', lines(e.target.value))} />
        </Field>
      </Card>

      <Card id="pay" title="Pay and notice" desc="Used for the Grill's pay fit, negotiation scripts and form auto-fill. Decimals like 22.5 work." className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Field label="Expected CTC (lakh per year)" id="expected">
          <NumberInput id="expected" value={p.expectedSalaryLpa} onValue={(n) => set('expectedSalaryLpa', n)} placeholder="24" />
        </Field>
        <Field label="Current or last CTC (lakh per year)" id="current">
          <NumberInput id="current" value={p.currentCtcLpa} onValue={(n) => set('currentCtcLpa', n)} placeholder="18" />
        </Field>
        <Field label="Notice period" id="notice">
          <Input id="notice" value={p.noticePeriod} onChange={(e) => set('noticePeriod', e.target.value)} placeholder="Immediate (0 days)" />
        </Field>
      </Card>

      <Card id="where" title="Where you work" desc="The Grill drops jobs outside these rules to zero on location.">
        <label className="flex items-center gap-3 text-sm"><input type="checkbox" className="h-5 w-5 accent-[hsl(var(--primary))]" checked={p.acceptRemote} onChange={(e) => set('acceptRemote', e.target.checked)} /> Remote roles open to India</label>
        <label className="flex items-center gap-3 text-sm"><input type="checkbox" className="h-5 w-5 accent-[hsl(var(--primary))]" checked={p.acceptHybrid} onChange={(e) => set('acceptHybrid', e.target.checked)} /> Hybrid roles in my cities</label>
        <Field label="On-site cities (comma separated)" id="cities"><Input id="cities" value={citiesText} onChange={(e) => setCitiesText(e.target.value)} /></Field>
      </Card>

      <Card id="skills" title="Skills and summary" desc="Skills are 40% of the Grill score: list the words job posts use.">
        <Field label="Skills (comma separated)" id="skills">
          <Textarea id="skills" rows={3} value={skillsText} onChange={(e) => setSkillsText(e.target.value)} placeholder="talent acquisition, tech hiring, boolean search, stakeholder management" />
        </Field>
        <Field label="Summary" id="summary"><Textarea id="summary" rows={4} value={p.summary} onChange={(e) => set('summary', e.target.value)} /></Field>
      </Card>

      <Card id="experience" title="Experience" desc="Newest first. One bullet per line; numbers you can defend in an interview."
        action={<Button size="sm" variant="outline" onClick={() => { set('experience', [{ company: '', title: '', location: '', start: '', end: '', bullets: [] }, ...exp]); setRev((r) => r + 1); }}><Plus /> Role</Button>}>
        {exp.map((e, i) => (
          <div key={`${rev}-${i}`} className="grid grid-cols-2 gap-3 rounded-xl border bg-muted/40 p-3">
            <Input className="col-span-2" aria-label="Title" placeholder="Title" value={e.title} onChange={(ev) => setExp(i, { title: ev.target.value })} />
            <Input className="col-span-2" aria-label="Company" placeholder="Company" value={e.company} onChange={(ev) => setExp(i, { company: ev.target.value })} />
            <Input aria-label="Start" placeholder="Start (Jan 2021)" value={e.start} onChange={(ev) => setExp(i, { start: ev.target.value })} />
            <Input aria-label="End" placeholder="End (blank = Present)" value={e.end} onChange={(ev) => setExp(i, { end: ev.target.value })} />
            <Input className="col-span-2" aria-label="Location" placeholder="Location" value={e.location} onChange={(ev) => setExp(i, { location: ev.target.value })} />
            <Textarea className="col-span-2" aria-label="Bullets" rows={5} placeholder="One bullet per line" defaultValue={e.bullets.join('\n')} onBlur={(ev) => setExp(i, { bullets: lines(ev.target.value) })} />
            <Button size="sm" variant="ghost" className="col-span-2 justify-self-start" onClick={() => { set('experience', exp.filter((_, n) => n !== i)); setRev((r) => r + 1); }}><Trash2 /> Remove role</Button>
          </div>
        ))}
      </Card>

      <Card id="education" title="Education and certifications">
        {p.education.map((e, i) => (
          <div key={i} className="grid grid-cols-2 gap-3">
            <Input className="col-span-2" aria-label="Degree" placeholder="Degree" value={e.degree} onChange={(ev) => set('education', p.education.map((x, n) => (n === i ? { ...x, degree: ev.target.value } : x)))} />
            <Input className="col-span-2" aria-label="School" placeholder="School" value={e.school} onChange={(ev) => set('education', p.education.map((x, n) => (n === i ? { ...x, school: ev.target.value } : x)))} />
            <Input aria-label="Start year" placeholder="Start" value={e.start} onChange={(ev) => set('education', p.education.map((x, n) => (n === i ? { ...x, start: ev.target.value } : x)))} />
            <Input aria-label="End year" placeholder="End" value={e.end} onChange={(ev) => set('education', p.education.map((x, n) => (n === i ? { ...x, end: ev.target.value } : x)))} />
          </div>
        ))}
        <Button size="sm" variant="outline" className="self-start" onClick={() => set('education', [...p.education, { school: '', degree: '', start: '', end: '', details: '' }])}><Plus /> Education</Button>
        <Field label="Certifications (one per line)" id="certs">
          <Textarea id="certs" rows={3} defaultValue={p.certifications.join('\n')} key={`c${rev}`} onBlur={(e) => set('certifications', lines(e.target.value))} />
        </Field>
        <Field label="Achievements (one per line)" id="ach">
          <Textarea id="ach" rows={3} defaultValue={p.achievements.join('\n')} key={`a${rev}`} onBlur={(e) => set('achievements', lines(e.target.value))} />
        </Field>
      </Card>

      <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-10 -mx-4 flex flex-col gap-2 border-t bg-background/90 px-4 py-3 backdrop-blur-xl md:bottom-0 md:mx-0 md:px-0">
        <Button onClick={save} disabled={!!busy} size="lg">{busy === 'save' ? 'Saving…' : 'Save profile'}</Button>
        {msg && <p className="meta" role="status">{msg}</p>}
        {err && <p className="text-sm text-destructive" role="alert">{err}</p>}
      </div>
    </div>
  );
}
