'use client';

import { useState } from 'react';
import { BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState, Pill } from '@/components/kit';
import { api } from '@/lib/api-client';

export type StoryRow = { id: string; theme: string; title: string; situation: string; task: string; action: string; result: string; reflection: string; bestFor: string; source: string; verified: boolean };

const FIELDS = [['situation', 'Situation'], ['task', 'Task'], ['action', 'Action'], ['result', 'Result'], ['reflection', 'Reflection'], ['bestFor', 'Best for questions about']] as const;
const EMPTY = { theme: '', title: '', situation: '', task: '', action: '', result: '', reflection: '', bestFor: '' };

// STAR + Reflection stories for interviews. AI-drafted ones stay "unchecked"
// until the person confirms every figure in them.
export function StoryBank({ initial }: { initial: StoryRow[] }) {
  const [stories, setStories] = useState(initial);
  const [draft, setDraft] = useState(EMPTY);
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState('');

  async function act(fn: () => Promise<void>) {
    setErr('');
    try {
      await fn();
    } catch (e) {
      setErr((e as Error).message);
    }
  }
  const save = () => act(async () => {
    const out = await api<{ story: StoryRow }>('/api/stories', { method: 'POST', json: draft });
    setStories([out.story, ...stories.filter((s) => s.id !== out.story.id)]);
    setDraft(EMPTY);
    setAdding(false);
  });
  const verify = (s: StoryRow) => act(async () => {
    const out = await api<{ story: StoryRow }>(`/api/stories/${s.id}`, { method: 'PATCH', json: { verified: !s.verified } });
    setStories(stories.map((x) => (x.id === s.id ? out.story : x)));
  });
  const remove = (s: StoryRow) => act(async () => {
    await api(`/api/stories/${s.id}`, { method: 'DELETE' });
    setStories(stories.filter((x) => x.id !== s.id));
  });

  return (
    <div className="flex flex-col gap-3" data-testid="story-bank">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm leading-6 text-muted-foreground">Stories from your evaluations, plus your own. Check every number before you use one in an interview.</p>
        <Button variant="outline" onClick={() => setAdding(!adding)}>{adding ? 'Cancel' : 'Add a story'}</Button>
      </div>
      {adding && (
        <section className="surface flex flex-col gap-3 p-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
            <Input aria-label="Story title" placeholder="Title, e.g. Hiring 120 engineers in 12 months" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            <Input aria-label="Theme" placeholder="Theme, e.g. Scale" value={draft.theme} onChange={(e) => setDraft({ ...draft, theme: e.target.value })} />
          </div>
          {FIELDS.map(([k, label]) => (
            <Textarea key={k} aria-label={label} placeholder={label} rows={2} value={draft[k]} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} />
          ))}
          <Button onClick={save} disabled={draft.title.trim().length < 3 || draft.action.trim().length < 3} className="w-fit">Save story</Button>
        </section>
      )}
      {err && <p className="text-sm text-destructive" role="alert">{err}</p>}
      {!stories.length && !adding && <EmptyState icon={BookOpen} title="No stories yet">Run a full evaluation on a job and its interview stories land here.</EmptyState>}
      {stories.map((s) => (
        <details key={s.id} className="surface p-4">
          <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm font-semibold">
            {s.title}
            {s.theme && <Pill>{s.theme}</Pill>}
            <Pill tone={s.verified ? 'success' : 'warning'}>{s.verified ? 'checked by you' : 'unchecked'}</Pill>
          </summary>
          <div className="mt-3 flex flex-col gap-1.5 text-sm leading-6">
            {FIELDS.map(([k, label]) => s[k] && <p key={k}><span className="text-muted-foreground">{label}:</span> {s[k]}</p>)}
            {s.source && <p className="meta">{s.source}</p>}
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => verify(s)}>{s.verified ? 'Mark unchecked' : 'I checked the facts'}</Button>
              <Button size="sm" variant="ghost" onClick={() => remove(s)}>Delete</Button>
            </div>
          </div>
        </details>
      ))}
    </div>
  );
}
