import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export function PageHeader({ eyebrow, title, sub, action, className }: { eyebrow?: string; title: string; sub?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  // Every piece has a fixed cell, so the subtitle always sits under the title.
  // On phones a compact action shares the first line, like an iOS toolbar button.
  const t = eyebrow ? 'row-start-2' : 'row-start-1';
  const u = eyebrow ? 'row-start-3' : 'row-start-2';
  return (
    <div className={cn('grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 sm:gap-x-4', className)}>
      {eyebrow && <p className="label-caps col-start-1 row-start-1">{eyebrow}</p>}
      <h1 className={cn('page-title col-start-1 min-w-0', t, eyebrow ? 'col-span-2 mt-1 sm:col-span-1' : '')}>{title}</h1>
      {sub && <p className={cn('col-span-2 col-start-1 mt-2 max-w-2xl text-[17px] leading-[1.47] text-muted-foreground sm:col-span-1 sm:text-[21px] sm:leading-[1.38]', u)}>{sub}</p>}
      {action && (
        <div className="col-start-2 row-start-1 shrink-0 max-sm:[&_button]:h-9 max-sm:[&_button]:px-3.5 max-sm:[&_button]:text-[15px] sm:self-end">
          {action}
        </div>
      )}
    </div>
  );
}

const TONES = {
  primary: 'bg-primary/[0.08] text-primary',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/15 text-warning',
  info: 'bg-info/10 text-info',
  muted: 'bg-muted text-muted-foreground',
  danger: 'bg-destructive/10 text-destructive',
} as const;
export type Tone = keyof typeof TONES;
// One accent only: icons sit on a quiet translucent disc in ink; state colour
// lives in pills and badges, never in icon tiles.
const ICON_TONES: Record<Tone, string> = {
  primary: 'text-primary',
  success: 'text-foreground',
  warning: 'text-foreground',
  info: 'text-foreground',
  muted: 'text-muted-foreground',
  danger: 'text-foreground',
};

export function IconChip({ icon: Icon, tone = 'primary', className }: { icon: LucideIcon; tone?: Tone; className?: string }) {
  return (
    <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[rgb(210_210_215/0.45)] dark:bg-white/[0.1]', ICON_TONES[tone], className)}>
      <Icon className="h-[18px] w-[18px]" strokeWidth={1.9} />
    </span>
  );
}

export function StatTile({ label, value, hint, icon, tone = 'primary', href }: { label: string; value: React.ReactNode; hint?: React.ReactNode; icon: LucideIcon; tone?: Tone; href?: string }) {
  const body = (
    <div className="surface flex h-full flex-col gap-2 p-4 transition-transform active:scale-[0.98] sm:p-6">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[14px] font-semibold tracking-[-0.016em]">{label}</span>
        <IconChip icon={icon} tone={tone} className="h-7 w-7 [&_svg]:h-4 [&_svg]:w-4" />
      </div>
      <div className="text-[40px] font-semibold leading-none tracking-[-0.02em] tabular-nums">{value}</div>
      {hint && <div className="meta">{hint}</div>}
    </div>
  );
  return href ? <Link href={href} className="block">{body}</Link> : body;
}

export function Section({ title, action, children, className }: { title: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('flex flex-col gap-3', className)}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[21px] font-semibold leading-[1.19] tracking-[0.011em]">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function EmptyState({ icon: Icon, title, children, action }: { icon: LucideIcon; title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="surface flex flex-col items-center gap-3 px-6 py-10 text-center">
      <IconChip icon={Icon} tone="muted" className="h-12 w-12" />
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
