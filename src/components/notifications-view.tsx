'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, BellRing, CheckCircle2, Circle, CircleDashed, Inbox, Loader2, MinusCircle, XCircle } from 'lucide-react';
import { useActivity, taskProgress, type StepRow, type TaskRow } from '@/components/activity';
import { EmptyState, IconChip, Pill, Section } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api-client';
import { toast } from '@/lib/toast';
import { cn, timeAgo } from '@/lib/utils';

type Note = { id: string; kind: string; title: string; body: string; href: string | null; readAt: string | null; createdAt: string };

const STEP_ICON: Record<StepRow['state'], React.ReactNode> = {
  pending: <Circle className="h-4 w-4 text-muted-foreground/60" />,
  running: <Loader2 className="h-4 w-4 animate-spin text-primary" />,
  done: <CheckCircle2 className="h-4 w-4 text-success" />,
  failed: <XCircle className="h-4 w-4 text-destructive" />,
  skipped: <MinusCircle className="h-4 w-4 text-muted-foreground/60" />,
};

export function TaskSteps({ task }: { task: TaskRow }) {
  return (
    <ol className="flex flex-col gap-2" data-testid="task-steps">
      {task.steps.map((s) => (
        <li key={s.key} className="flex items-start gap-2.5 text-sm" data-state={s.state}>
          <span className="mt-0.5 shrink-0">{STEP_ICON[s.state]}</span>
          <span className="min-w-0">
            <span className={cn(s.state === 'pending' || s.state === 'skipped' ? 'text-muted-foreground' : 'text-foreground')}>{s.label}</span>
            {s.detail && <span className={cn('block text-xs leading-5', s.state === 'failed' ? 'text-destructive' : 'text-muted-foreground')}>{s.detail}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}

function TaskCard({ task }: { task: TaskRow }) {
  const p = taskProgress(task);
  const body = (
    <div className="surface flex flex-col gap-3 p-4" data-testid="task-card" data-status={task.status}>
      <div className="flex items-start gap-3">
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{task.title}</span>
          <span className="meta">{task.status === 'RUNNING' ? `Started ${timeAgo(task.createdAt)}` : `Finished ${timeAgo(task.finishedAt || task.createdAt)}`}</span>
        </span>
        {task.status === 'RUNNING' ? <Pill tone="info">{p.finished}/{p.total}</Pill> : task.status === 'DONE' ? <Pill tone="success">Done</Pill> : <Pill tone="danger">Failed</Pill>}
      </div>
      {task.status === 'RUNNING' && (
        <span className="h-1 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-primary transition-[width] duration-700" style={{ width: `${p.pct}%` }} /></span>
      )}
      <TaskSteps task={task} />
      {task.status === 'FAILED' && task.error && <p className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{task.error}</p>}
    </div>
  );
  return task.href ? <Link href={task.href} className="block active:scale-[0.995]">{body}</Link> : body;
}

// Turns on notifications for this phone or browser (Web Push). On an iPhone
// they work once HunterOps is on the Home Screen (Share, Add to Home Screen).
export function PushCard() {
  const [state, setState] = useState<'checking' | 'unsupported' | 'ios-home' | 'off' | 'on' | 'denied'>('checking');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
      const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return setState(ios && !standalone ? 'ios-home' : 'unsupported');
      if (Notification.permission === 'denied') return setState('denied');
      const reg = await navigator.serviceWorker.getRegistration('/');
      const sub = await reg?.pushManager.getSubscription();
      setState(sub ? 'on' : 'off');
    })().catch(() => setState('unsupported'));
  }, []);

  async function turnOn() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      await navigator.serviceWorker.ready;
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'denied' : 'off');
        return;
      }
      const { publicKey } = await api<{ publicKey: string }>('/api/push');
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
      await api('/api/push', { method: 'POST', json: sub.toJSON() });
      setState('on');
      toast('Notifications are on for this device.');
    } catch (e) {
      toast(`Could not turn on notifications: ${(e as Error).message}`, { tone: 'danger' });
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration('/');
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await api('/api/push', { method: 'DELETE', json: { endpoint: sub.endpoint } });
        await sub.unsubscribe();
      }
      setState('off');
      toast('Notifications are off for this device.');
    } finally {
      setBusy(false);
    }
  }

  const text = {
    checking: 'Checking this device…',
    unsupported: 'This browser cannot show notifications. The bell in the app still shows everything.',
    'ios-home': 'On iPhone, notifications work once HunterOps is on your Home Screen: tap Share, then Add to Home Screen, open it from there and come back here.',
    off: 'Get a notification when an application is ready, when something fails and when a scan finds new matches, even when the app is closed.',
    on: 'On for this device. You will get a notification when an application is ready, when something fails and when a scan finds new matches.',
    denied: 'Notifications are blocked for HunterOps. Allow them in your phone’s Settings, then come back here.',
  }[state];

  return (
    <div className="surface flex flex-col gap-3 p-4" data-testid="push-card" data-state={state}>
      <div className="flex items-start gap-3">
        <IconChip icon={BellRing} tone="primary" />
        <div className="min-w-0">
          <p className="font-semibold">Notifications on this device</p>
          <p className="text-sm leading-6 text-muted-foreground">{text}</p>
        </div>
      </div>
      {state === 'off' && <Button onClick={turnOn} disabled={busy}>{busy ? <><Loader2 className="animate-spin" /> Turning on…</> : 'Turn on notifications'}</Button>}
      {state === 'on' && <Button variant="outline" onClick={turnOff} disabled={busy}>Turn off</Button>}
    </div>
  );
}

function urlBase64ToUint8Array(base64: string) {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

const NOTE_ICON: Record<string, React.ReactNode> = {
  ready: <CheckCircle2 className="h-5 w-5 text-success" />,
  matches: <Inbox className="h-5 w-5 text-primary" />,
  failed: <AlertTriangle className="h-5 w-5 text-destructive" />,
  info: <BellRing className="h-5 w-5 text-primary" />,
};

export function NotificationsView() {
  const { tasks, refresh } = useActivity();
  const [notes, setNotes] = useState<Note[] | null>(null);

  const load = useCallback(async () => {
    const { notifications } = await api<{ notifications: Note[] }>('/api/notifications');
    setNotes(notifications);
    // Seen now: the bell clears.
    if (notifications.some((n) => !n.readAt)) {
      await api('/api/notifications', { method: 'POST', json: {} });
      refresh();
    }
  }, [refresh]);
  useEffect(() => { load().catch(() => setNotes([])); }, [load]);
  // New notifications arrive as tasks finish.
  const finished = tasks.filter((t) => t.status !== 'RUNNING').length;
  useEffect(() => { if (finished) load().catch(() => {}); }, [finished, load]);

  const running = tasks.filter((t) => t.status === 'RUNNING');
  const recent = tasks.filter((t) => t.status !== 'RUNNING').slice(0, 6);

  return (
    <div className="flex flex-col gap-8">
      {running.length > 0 && (
        <Section title={`Working on it now (${running.length})`}>
          <div className="flex flex-col gap-3">{running.map((t) => <TaskCard key={t.id} task={t} />)}</div>
        </Section>
      )}

      <Section title="Notifications">
        {notes === null ? (
          <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
        ) : notes.length ? (
          <div className="surface divide-y overflow-hidden p-0" data-testid="notifications">
            {notes.map((n) => {
              const row = (
                <div className={cn('flex items-start gap-3 px-4 py-3', !n.readAt && 'bg-primary/[0.04]')} data-testid="notification" data-kind={n.kind}>
                  <span className="mt-0.5 shrink-0">{NOTE_ICON[n.kind] || NOTE_ICON.info}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium leading-5">{n.title}</span>
                    {n.body && <span className="mt-0.5 block text-sm leading-5 text-muted-foreground">{n.body}</span>}
                    <span className="meta mt-1 block">{timeAgo(n.createdAt)}</span>
                  </span>
                </div>
              );
              return n.href ? <Link key={n.id} href={n.href} className="block active:bg-muted/60">{row}</Link> : <div key={n.id}>{row}</div>;
            })}
          </div>
        ) : (
          <EmptyState icon={CircleDashed} title="Nothing yet">When an application is ready, a scan finds new matches or something fails, it shows here.</EmptyState>
        )}
      </Section>

      <PushCard />

      {recent.length > 0 && (
        <Section title="Finished in the last two days">
          <div className="flex flex-col gap-3">{recent.map((t) => <TaskCard key={t.id} task={t} />)}</div>
        </Section>
      )}
    </div>
  );
}
