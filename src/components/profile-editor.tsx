'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { Plus, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api-client';
import type { ProfileInput } from '@/lib/profile';

const EMPTY: ProfileInput = {
  name: '', headline: '', email: '', phone: '', location: '', linkedin: '', portfolio: '', summary: '',
  skills: [], experience: [], education: [], certifications: [], achievements: [],
  yearsExperience: null, acceptRemote: true, acceptHybrid: true, onsiteCities: ['Bengaluru'],
  expectedSalaryLpa: null, currentCtcLpa: null, noticePeriod: '',
};

const lines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean);

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return <div className="flex flex-col gap-1"><Label htmlFor={id}>{label}</Label>{children}</div>;
}

export function ProfileEditor({ initial }: { initial: ProfileInput | null }) {
  const router = useRouter();
  const [p, setP] = useState<ProfileInput>(initial ?? EMPTY);
  const [skillsText, setSkillsText] = useState((initial?.skills ?? []).join(', '));
  const [citiesText, setCitiesText] = useState((initial?.onsiteCities ?? ['Bengaluru']).join(', '));
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
      };
      const { grilled } = await api<{ grilled: number }>('/api/profile', { method: 'PUT', json: { profile: body } });
      setMsg(`Saved. ${grilled} jobs re-grilled.`);
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
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary"><Upload className="h-5 w-5" /></span>
          <div>
            <h2 className="font-bold">Import your resume</h2>
            <p className="text-sm leading-5 text-muted-foreground">PDF, DOCX or TXT. AI reads it into the fields below; nothing is saved until you press Save.</p>
          </div>
        </div>
        <input ref={file} type="file" accept=".pdf,.docx,.txt,.md" className="hidden" onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} data-testid="resume-file" />
        <Button className="self-start" onClick={() => file.current?.click()} disabled={!!busy}>
          <Upload /> {busy === 'import' ? 'Reading…' : 'Choose file'}
        </Button>
      </section>

      <section className="surface grid grid-cols-1 gap-4 p-4 md:grid-cols-2 md:p-5">
        <h2 className="section-title md:col-span-2">Basics</h2>
        <Field label="Name" id="name"><Input id="name" value={p.name} onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label="Headline" id="headline"><Input id="headline" value={p.headline} onChange={(e) => set('headline', e.target.value)} placeholder="Senior Recruiter, Tech and GCC hiring" /></Field>
        <Field label="Email" id="email"><Input id="email" type="email" value={p.email} onChange={(e) => set('email', e.target.value)} /></Field>
        <Field label="Phone" id="phone"><Input id="phone" value={p.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
        <Field label="Location" id="location"><Input id="location" value={p.location} onChange={(e) => set('location', e.target.value)} /></Field>
        <Field label="LinkedIn" id="linkedin"><Input id="linkedin" value={p.linkedin} onChange={(e) => set('linkedin', e.target.value)} /></Field>
        <Field label="Years of experience" id="years">
          <Input id="years" inputMode="decimal" value={p.yearsExperience ?? ''} onChange={(e) => set('yearsExperience', e.target.value ? Number(e.target.value) : null)} />
        </Field>
        <Field label="Portfolio" id="portfolio"><Input id="portfolio" value={p.portfolio} onChange={(e) => set('portfolio', e.target.value)} /></Field>
      </section>

      <section className="surface grid grid-cols-1 gap-4 p-4 md:grid-cols-3 md:p-5">
        <h2 className="section-title md:col-span-3">Pay and availability (Grill salary fit and Browser auto-fill)</h2>
        <Field label="Expected CTC (lakh per year)" id="expected">
          <Input id="expected" inputMode="decimal" value={p.expectedSalaryLpa ?? ''} onChange={(e) => set('expectedSalaryLpa', e.target.value ? Number(e.target.value) : null)} placeholder="24" />
        </Field>
        <Field label="Current or last CTC (lakh per year)" id="current">
          <Input id="current" inputMode="decimal" value={p.currentCtcLpa ?? ''} onChange={(e) => set('currentCtcLpa', e.target.value ? Number(e.target.value) : null)} placeholder="18" />
        </Field>
        <Field label="Notice period" id="notice">
          <Input id="notice" value={p.noticePeriod} onChange={(e) => set('noticePeriod', e.target.value)} placeholder="Immediate (0 days)" />
        </Field>
      </section>

      <section className="surface flex flex-col gap-4 p-4 md:p-5">
        <h2 className="section-title">Where you will work (the Grill&apos;s strict location check)</h2>
        <label className="flex items-center gap-3 text-sm"><input type="checkbox" className="h-5 w-5 accent-[hsl(var(--primary))]" checked={p.acceptRemote} onChange={(e) => set('acceptRemote', e.target.checked)} /> Remote roles open to India</label>
        <label className="flex items-center gap-3 text-sm"><input type="checkbox" className="h-5 w-5 accent-[hsl(var(--primary))]" checked={p.acceptHybrid} onChange={(e) => set('acceptHybrid', e.target.checked)} /> Hybrid roles in my cities</label>
        <Field label="On-site cities (comma separated)" id="cities"><Input id="cities" value={citiesText} onChange={(e) => setCitiesText(e.target.value)} /></Field>
      </section>

      <section className="surface flex flex-col gap-4 p-4 md:p-5">
        <Field label="Skills (comma separated; the Grill's 40%)" id="skills">
          <Textarea id="skills" rows={3} value={skillsText} onChange={(e) => setSkillsText(e.target.value)} placeholder="talent acquisition, tech hiring, boolean search, stakeholder management" />
        </Field>
        <Field label="Summary" id="summary"><Textarea id="summary" rows={4} value={p.summary} onChange={(e) => set('summary', e.target.value)} /></Field>
      </section>

      <section className="surface flex flex-col gap-4 p-4 md:p-5">
        <div className="flex items-center justify-between">
          <h2 className="section-title">Experience</h2>
          <Button size="sm" variant="outline" onClick={() => { set('experience', [{ company: '', title: '', location: '', start: '', end: '', bullets: [] }, ...exp]); setRev((r) => r + 1); }}><Plus /> Role</Button>
        </div>
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
      </section>

      <section className="surface flex flex-col gap-4 p-4 md:p-5">
        <h2 className="section-title">Education</h2>
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
      </section>

      <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-10 -mx-4 flex flex-col gap-2 border-t bg-background/90 px-4 py-3 backdrop-blur-xl md:bottom-0 md:mx-0 md:px-0">
        <Button onClick={save} disabled={!!busy} size="lg">{busy === 'save' ? 'Saving…' : 'Save profile'}</Button>
        {msg && <p className="meta" role="status">{msg}</p>}
        {err && <p className="text-sm text-destructive" role="alert">{err}</p>}
      </div>
    </div>
  );
}
