'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ResumePanel } from '@/components/resume-panel';
import { download } from '@/lib/api-client';

type Saved = { id: string; name: string; jobId: string | null; createdAt: string; slopScore: number | null };

// The three parts of the Resume page: the master resume, tailoring to a
// chosen job, and the list of saved resumes.
export function ResumeStudio({ part, name, headline, jobs, saved, initialJob = '' }: {
  part: 'master' | 'tailor' | 'saved'; name?: string; headline?: string; jobs: { id: string; label: string }[]; saved: Saved[]; initialJob?: string;
}) {
  const [density, setDensity] = useState<'standard' | 'compact'>('standard');
  const [job, setJob] = useState(initialJob);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');

  const get = async (format: 'pdf' | 'docx', resumeId?: string) => {
    setBusy(`${format}${resumeId ?? ''}`);
    setErr('');
    try {
      await download('/api/resume/render', { format, resumeId, ...(resumeId ? {} : { density }) }, `Resume.${format}`);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy('');
    }
  };

  if (part === 'master') {
    return (
      <div className="surface flex flex-col gap-4 p-4 md:p-5" data-testid="master-resume">
        <div>
          <p className="font-semibold">{name}</p>
          {headline && <p className="meta">{headline}</p>}
        </div>
        <div className="flex gap-2">
          {(['standard', 'compact'] as const).map((d) => (
            <button key={d} type="button" onClick={() => setDensity(d)} className="chip capitalize" data-on={d === density}>{d}</button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => get('pdf')} disabled={!!busy}><Download /> {busy === 'pdf' ? 'Making PDF…' : 'Download PDF'}</Button>
          <Button variant="outline" onClick={() => get('docx')} disabled={!!busy}><Download /> {busy === 'docx' ? 'Making Word file…' : 'Download Word'}</Button>
        </div>
        {err && <p className="text-sm text-destructive" role="alert">{err}</p>}
      </div>
    );
  }

  if (part === 'tailor') {
    return (
      <div className="surface flex flex-col gap-4 p-4 md:p-5">
        {jobs.length ? (
          <>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Job
              <select value={job} onChange={(e) => setJob(e.target.value)} className="h-11 w-full min-w-0 rounded-xl border bg-background px-3 text-[15px] font-normal" data-testid="resume-job">
                <option value="">Pick a job…</option>
                {jobs.map((j) => <option key={j.id} value={j.id}>{j.label}</option>)}
              </select>
            </label>
            {job
              ? <ResumePanel key={job} jobId={job} master={false} saved={saved.filter((s) => s.jobId === job)} />
              : <p className="meta">The AI rewrites your master resume for the job you pick, using only facts from your profile.</p>}
          </>
        ) : <p className="meta">No jobs on your board yet. Run a scan on Home, then come back.</p>}
      </div>
    );
  }

  return saved.length ? (
    <div className="surface divide-y overflow-hidden p-0">
      {saved.map((r) => (
        <div key={r.id} className="flex items-center gap-3 px-4 py-3" data-testid="saved-resume">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-medium">{r.name}</span>
            <span className="meta">{new Date(r.createdAt).toLocaleDateString('en-IN')}{r.slopScore != null ? ` · slop ${r.slopScore}` : ''}</span>
          </span>
          <Button size="sm" variant="outline" onClick={() => get('pdf', r.id)} disabled={!!busy}>PDF</Button>
          <Button size="sm" variant="outline" onClick={() => get('docx', r.id)} disabled={!!busy}>Word</Button>
        </div>
      ))}
      {err && <p className="px-4 py-3 text-sm text-destructive" role="alert">{err}</p>}
    </div>
  ) : <p className="meta">Tailored resumes appear here. Apply with AI makes one for every job too.</p>;
}
