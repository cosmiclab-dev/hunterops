// Long jobs keep their progress in the database, step by step, so every
// screen can show it (the bar above the tabs, the bell) after the person
// leaves the page or closes the app. Finishing or failing leaves a
// notification and, where the phone allowed it, a push notification.
import type { Prisma, Task } from '@prisma/client';
import { REQUEST_BUDGET_MS } from './budget';
import { prisma } from './db';
import { notify } from './notify';
import { clip } from './utils';

export type StepState = 'pending' | 'running' | 'done' | 'failed' | 'skipped';
export type Step = { key: string; label: string; state: StepState; detail?: string };
export type TaskKind = 'apply' | 'scan' | 'evaluate' | 'resume' | 'import' | 'auto';

// Longer than any run may last (the request budget), so only a dead one counts.
export const STALE_TASK_MS = Math.max(6 * 60_000, REQUEST_BUDGET_MS + 60_000);

export const isStaleTask = (t: { status: string; updatedAt: Date }) => t.status === 'RUNNING' && Date.now() - t.updatedAt.getTime() > STALE_TASK_MS;

export type Tracker = {
  id: string;
  step: (key: string, state: StepState, detail?: string) => Promise<void>;
  done: (o: { result?: unknown; title?: string; note?: { kind: string; title: string; body?: string; href?: string } | null }) => Promise<void>;
  fail: (err: unknown, o?: { title?: string; href?: string }) => Promise<void>;
};

export async function startTask(o: { kind: TaskKind; title: string; jobId?: string | null; href?: string | null; steps: { key: string; label: string }[] }): Promise<Tracker> {
  const steps: Step[] = o.steps.map((s) => ({ ...s, state: 'pending' }));
  const task = await prisma.task.create({
    data: { kind: o.kind, title: clip(o.title, 200) || o.kind, jobId: o.jobId || null, href: o.href || null, steps: steps as unknown as Prisma.InputJsonValue },
  });
  return tracker(task.id, steps, o.href || null);
}

// Steps of one task run in parallel; writes go one at a time so none is lost.
function tracker(id: string, steps: Step[], href: string | null): Tracker {
  let chain: Promise<unknown> = Promise.resolve();
  const write = (data: Prisma.TaskUpdateInput) => {
    chain = chain.then(() => prisma.task.update({ where: { id }, data }).catch((e) => console.error('[task]', id, (e as Error).message)));
    return chain.then(() => undefined);
  };
  const snapshot = () => steps.map((s) => ({ ...s })) as unknown as Prisma.InputJsonValue;
  return {
    id,
    step(key, state, detail) {
      const s = steps.find((x) => x.key === key);
      if (!s) return Promise.resolve();
      s.state = state;
      if (detail !== undefined) s.detail = clip(detail, 300) || undefined;
      return write({ steps: snapshot() });
    },
    async done({ result, note, title }) {
      for (const s of steps) if (s.state === 'pending' || s.state === 'running') s.state = 'skipped';
      await write({ status: 'DONE', steps: snapshot(), finishedAt: new Date(), ...(title ? { title: clip(title, 200) || title } : {}), ...(result !== undefined ? { result: result as Prisma.InputJsonValue } : {}) });
      if (note) await notify({ ...note, href: note.href ?? href, taskId: id });
    },
    async fail(err, o = {}) {
      const message = clip((err as Error)?.message || 'Something went wrong.', 500) || 'Something went wrong.';
      for (const s of steps) if (s.state === 'running') s.state = 'failed';
      for (const s of steps) if (s.state === 'pending') s.state = 'skipped';
      await write({ status: 'FAILED', steps: snapshot(), error: message, finishedAt: new Date() });
      await notify({ kind: 'failed', title: o.title || 'Something failed', body: message, href: o.href ?? href, taskId: id });
    },
  };
}

// What the bar and the bell read: running tasks, the last few finished ones
// and the unread count.
export async function activity() {
  const since = new Date(Date.now() - 2 * 864e5);
  const [tasks, unread] = await Promise.all([
    prisma.task.findMany({ where: { OR: [{ status: 'RUNNING' }, { finishedAt: { gte: since } }] }, orderBy: { createdAt: 'desc' }, take: 20 }),
    prisma.notification.count({ where: { readAt: null } }),
  ]);
  return {
    tasks: tasks.map(publicTask),
    unread,
  };
}

export function publicTask(t: Task) {
  const status = isStaleTask(t) ? 'FAILED' : t.status;
  return {
    id: t.id, kind: t.kind, title: t.title, jobId: t.jobId, href: t.href, status,
    steps: (t.steps as unknown as Step[]) || [],
    error: status === 'FAILED' && t.status === 'RUNNING' ? 'It stopped before it finished. Try again.' : t.error,
    createdAt: t.createdAt, finishedAt: t.finishedAt,
  };
}
