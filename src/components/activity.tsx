'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Bell, CheckCircle2, ChevronRight, Loader2, X, XCircle } from 'lucide-react';
import type { ToastMsg } from '@/lib/toast';
import { cn } from '@/lib/utils';

export type StepRow = { key: string; label: string; state: 'pending' | 'running' | 'done' | 'failed' | 'skipped'; detail?: string };
export type TaskRow = { id: string; kind: string; title: string; jobId: string | null; href: string | null; status: 'RUNNING' | 'DONE' | 'FAILED'; steps: StepRow[]; error: string | null; createdAt: string; finishedAt: string | null };

type Activity = { tasks: TaskRow[]; unread: number; refresh: () => void };

const Ctx = createContext<Activity>({ tasks: [], unread: 0, refresh: () => {} });
export const useActivity = () => useContext(Ctx);

const KIND: Record<string, string> = { apply: 'Preparing application', scan: 'Scanning job sites', evaluate: 'Career-Ops evaluation', resume: 'Tailoring resume', import: 'Reading your CV', auto: 'Preparing top matches' };

// Where a running task is: the step under way, and how many are finished.
export function taskProgress(t: TaskRow) {
  const total = t.steps.length || 1;
  const finished = t.steps.filter((s) => s.state === 'done' || s.state === 'skipped' || s.state === 'failed').length;
  const running = t.steps.filter((s) => s.state === 'running');
  return { total, finished, pct: Math.max(6, Math.round((finished / total) * 100)), now: running.map((s) => s.label).join(' · ') || (finished ? 'Finishing' : 'Starting') };
}

// Watches the server's task list for the whole app: fast while something runs,
// slowly otherwise. A task that finishes while the person is elsewhere shows a
// toast with a link, and the screen reloads its data.
export function ActivityProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [unread, setUnread] = useState(0);
  const seenRunning = useRef<Set<string>>(new Set());
  const first = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const load = useCallback(async () => {
    clearTimeout(timer.current);
    let running = false;
    try {
      const res = await fetch('/api/activity', { cache: 'no-store' });
      if (res.ok) {
        const data = (await res.json()) as { tasks: TaskRow[]; unread: number };
        running = data.tasks.some((t) => t.status === 'RUNNING');
        // Tasks that were running last time and are finished now.
        const ended = data.tasks.filter((t) => t.status !== 'RUNNING' && seenRunning.current.has(t.id));
        for (const t of ended) {
          seenRunning.current.delete(t.id);
          window.dispatchEvent(new CustomEvent<Partial<ToastMsg>>('hunterops:toast', {
            detail: t.status === 'DONE'
              ? { text: doneText(t), tone: 'success', href: t.href || undefined, action: 'Open' }
              : { text: `${t.title}: ${t.error || 'it failed'}`, tone: 'danger', href: t.href || undefined, action: 'Try again' },
          }));
        }
        if (ended.length && !first.current) router.refresh();
        for (const t of data.tasks) if (t.status === 'RUNNING') seenRunning.current.add(t.id);
        first.current = false;
        setTasks(data.tasks);
        setUnread(data.unread);
      }
    } catch { /* offline: try again later */ }
    timer.current = setTimeout(load, running ? 2500 : 30_000);
  }, [router]);

  useEffect(() => {
    if (pathname === '/login') return;
    load();
    const now = () => load();
    window.addEventListener('hunterops:activity', now);
    window.addEventListener('focus', now);
    document.addEventListener('visibilitychange', now);
    return () => {
      clearTimeout(timer.current);
      window.removeEventListener('hunterops:activity', now);
      window.removeEventListener('focus', now);
      document.removeEventListener('visibilitychange', now);
    };
  }, [load, pathname]);

  return <Ctx.Provider value={{ tasks, unread, refresh: load }}>{children}</Ctx.Provider>;
}

function doneText(t: TaskRow) {
  if (t.kind === 'apply') return `Ready for your approval: ${t.title}`;
  if (t.kind === 'scan') return t.title;
  return `Done: ${t.title}`;
}

// The progress bar above the tab bar (bottom-right on a laptop). It stays on
// every screen until the work is done.
export function ActivityBar() {
  const pathname = usePathname();
  const { tasks } = useActivity();
  // A task's own page shows its steps in full; the bar is for everywhere else.
  const running = tasks.filter((t) => t.status === 'RUNNING' && t.href !== pathname);
  if (pathname === '/login' || !running.length) return null;
  const t = running[0];
  const p = taskProgress(t);
  return (
    <Link
      href={running.length > 1 ? '/notifications' : t.href || '/notifications'}
      className="glass-float fixed inset-x-3 bottom-[calc(max(env(safe-area-inset-bottom),10px)+76px)] z-40 mx-auto flex max-w-md flex-col gap-2 rounded-[20px] px-4 py-3 active:scale-[0.99] lg:inset-x-auto lg:bottom-6 lg:right-6 lg:w-96"
      data-testid="activity-bar"
      aria-live="polite"
    >
      <span className="flex items-center gap-2.5">
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold">{KIND[t.kind] || 'Working'}{running.length > 1 ? ` · ${running.length - 1} more` : ''}</span>
          <span className="block truncate text-xs text-muted-foreground">{t.title}</span>
        </span>
        <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">{p.finished}/{p.total}</span>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </span>
      <span className="h-1 overflow-hidden rounded-full bg-muted">
        <span className="block h-full rounded-full bg-primary transition-[width] duration-700" style={{ width: `${p.pct}%` }} />
      </span>
      <span className="truncate text-xs text-muted-foreground" data-testid="activity-step">{p.now}</span>
    </Link>
  );
}

// The bell: unread notifications, on every screen.
export function BellLink({ className }: { className?: string }) {
  const { unread } = useActivity();
  const pathname = usePathname();
  return (
    <Link href="/notifications" aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'} className={cn('relative inline-flex h-10 w-10 items-center justify-center rounded-full transition-colors', pathname.startsWith('/notifications') ? 'text-primary' : 'text-foreground/70 hover:text-foreground', className)} data-testid="bell">
      <Bell className="h-[19px] w-[19px]" />
      {unread > 0 && <span className="absolute right-1 top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-white" data-testid="bell-count">{unread > 99 ? '99+' : unread}</span>}
    </Link>
  );
}

// Shows toast() messages for a few seconds at the top of the screen.
export function Toaster() {
  const [items, setItems] = useState<ToastMsg[]>([]);
  useEffect(() => {
    let id = 100_000;
    const on = (e: Event) => {
      const d = (e as CustomEvent<Partial<ToastMsg>>).detail;
      const msg: ToastMsg = { id: d.id ?? id++, text: d.text || '', tone: d.tone || 'success', href: d.href, action: d.action };
      setItems((xs) => [...xs.slice(-2), msg]);
      setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== msg.id)), msg.tone === 'danger' ? 9000 : 6000);
    };
    window.addEventListener('hunterops:toast', on);
    return () => window.removeEventListener('hunterops:toast', on);
  }, []);
  if (!items.length) return null;
  return (
    <div className="pointer-events-none fixed inset-x-3 top-[calc(env(safe-area-inset-top)+56px)] z-50 mx-auto flex max-w-md flex-col gap-2 lg:left-auto lg:right-6 lg:top-6 lg:w-96" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className="glass-float pointer-events-auto flex items-start gap-2.5 rounded-[18px] px-4 py-3 text-sm" data-testid="toast" data-tone={t.tone}>
          {t.tone === 'danger' ? <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" /> : <CheckCircle2 className={cn('mt-0.5 h-4 w-4 shrink-0', t.tone === 'success' ? 'text-success' : 'text-primary')} />}
          <span className="min-w-0 flex-1 leading-5">{t.text}</span>
          {t.href && <Link href={t.href} className="shrink-0 font-semibold text-primary" onClick={() => setItems((xs) => xs.filter((x) => x.id !== t.id))}>{t.action || 'Open'}</Link>}
          <button type="button" aria-label="Dismiss" className="shrink-0 text-muted-foreground" onClick={() => setItems((xs) => xs.filter((x) => x.id !== t.id))}><X className="h-4 w-4" /></button>
        </div>
      ))}
    </div>
  );
}
