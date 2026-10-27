import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export function PageHeader({ eyebrow, title, sub, action, className }: { eyebrow?: string; title: string; sub?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-start justify-between gap-4', className)}>
      <div className="min-w-0">
        {eyebrow && <p className="label-caps text-primary">{eyebrow}</p>}
        <h1 className="page-title mt-1">{title}</h1>
        {sub && <p className="mt-1 text-sm leading-6 text-muted-foreground">{sub}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

const TONES = {
  primary: 'bg-primary/10 text-primary',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/15 text-warning',
  info: 'bg-info/10 text-info',
  muted: 'bg-muted text-muted-foreground',
  danger: 'bg-destructive/10 text-destructive',
} as const;
export type Tone = keyof typeof TONES;

export function IconChip({ icon: Icon, tone = 'primary', className }: { icon: LucideIcon; tone?: Tone; className?: string }) {
  return (
    <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-xl', TONES[tone], className)}>
      <Icon className="h-[18px] w-[18px]" />
    </span>
  );
}

export function StatTile({ label, value, hint, icon, tone = 'primary', href }: { label: string; value: React.ReactNode; hint?: React.ReactNode; icon: LucideIcon; tone?: Tone; href?: string }) {
  const body = (
    <div className="surface flex h-full flex-col gap-3 p-4 transition-colors hover:border-primary/40">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium text-muted-foreground">{label}</span>
        <IconChip icon={icon} tone={tone} className="h-8 w-8 rounded-lg" />
      </div>
      <div className="text-[30px] font-extrabold leading-none tracking-tight tabular-nums">{value}</div>
      {hint && <div className="meta">{hint}</div>}
    </div>
  );
  return href ? <Link href={href} className="block">{body}</Link> : body;
}

export function Section({ title, action, children, className }: { title: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('flex flex-col gap-3', className)}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-bold tracking-tight">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function EmptyState({ icon: Icon, title, children, action }: { icon: LucideIcon; title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed bg-card/50 px-6 py-10 text-center">
      <IconChip icon={Icon} tone="muted" className="h-12 w-12 rounded-2xl" />
      <div>
        <p className="font-semibold">{title}</p>
        {children && <p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-muted-foreground">{children}</p>}
      </div>
      {action}
    </div>
  );
}

export function Pill({ children, tone = 'muted', className }: { children: React.ReactNode; tone?: Tone; className?: string }) {
  return <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold', TONES[tone], className)}>{children}</span>;
}
