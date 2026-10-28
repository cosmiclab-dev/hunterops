import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export function PageHeader({ eyebrow, title, sub, action, className }: { eyebrow?: string; title: string; sub?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  // On phones a compact action shares the first line (eyebrow, else title), like an iOS toolbar button.
  return (
    <div className={cn('grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 sm:gap-x-4', className)}>
      {eyebrow && <p className="label-caps col-start-1 row-start-1 text-muted-foreground">{eyebrow}</p>}
      <h1 className={cn('page-title min-w-0', eyebrow ? 'col-span-2 mt-1 sm:col-span-1' : 'col-start-1 row-start-1')}>{title}</h1>
      {sub && <p className="col-span-2 mt-2 max-w-2xl text-[15px] leading-[1.47] text-muted-foreground sm:col-span-1 sm:text-[17px]">{sub}</p>}
      {action && (
        <div className="col-start-2 row-start-1 shrink-0 max-sm:[&_button]:h-9 max-sm:[&_button]:px-3.5 max-sm:[&_button]:text-[15px] sm:row-span-3 sm:self-start">
          {action}
        </div>
      )}
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
// iOS app-icon colours for icon tiles: solid, rounded, white glyph.
const ICON_TONES: Record<Tone, string> = {
  primary: 'bg-[#007AFF]',
  success: 'bg-[#34C759]',
  warning: 'bg-[#FF9500]',
  info: 'bg-[#30B0C7]',
  muted: 'bg-[#8E8E93]',
  danger: 'bg-[#FF3B30]',
};
export type Tone = keyof typeof TONES;

// Rounded, colourful icon tiles like iOS Settings.
export function IconChip({ icon: Icon, tone = 'primary', className }: { icon: LucideIcon; tone?: Tone; className?: string }) {
  return (
    <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-[10px] text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.25)]', ICON_TONES[tone], className)}>
      <Icon className="h-[18px] w-[18px]" strokeWidth={2.2} />
    </span>
  );
}

export function StatTile({ label, value, hint, icon, tone = 'primary', href }: { label: string; value: React.ReactNode; hint?: React.ReactNode; icon: LucideIcon; tone?: Tone; href?: string }) {
  const body = (
    <div className="surface flex h-full flex-col gap-3 p-4 transition-transform active:scale-[0.98] sm:p-5">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <IconChip icon={icon} tone={tone} className="h-8 w-8 rounded-lg" />
      </div>
      <div className="text-[30px] font-semibold leading-none tracking-[-0.02em] tabular-nums">{value}</div>
      {hint && <div className="meta">{hint}</div>}
    </div>
  );
  return href ? <Link href={href} className="block">{body}</Link> : body;
}

export function Section({ title, action, children, className }: { title: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('flex flex-col gap-3', className)}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[21px] font-semibold leading-tight tracking-[-0.015em]">{title}</h2>
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
