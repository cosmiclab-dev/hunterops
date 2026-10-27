import { cn } from '@/lib/utils';
import { grillBand } from '@/lib/modules/grill';

const BAND_CLASS = {
  red: 'border-grill-red bg-grill-red text-white',
  yellow: 'border-grill-yellow bg-grill-yellow text-white',
  green: 'border-grill-green bg-grill-green text-white',
} as const;

// The Grill Score (0-100): red below 50, yellow 50-74, green 75 and up.
export function GrillScoreBadge({ score, size = 'md', className }: { score: number | null | undefined; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  if (score === null || score === undefined) {
    return (
      <div className={cn('flex shrink-0 flex-col items-center justify-center rounded-xl border border-dashed text-muted-foreground', size === 'lg' ? 'h-16 w-16' : size === 'sm' ? 'h-10 w-10' : 'h-12 w-12', className)} title="Not grilled yet: add your profile">
        <span className="meta">–</span>
      </div>
    );
  }
  const band = grillBand(score);
  return (
    <div
      className={cn('flex shrink-0 flex-col items-center justify-center rounded-xl border shadow-sm', BAND_CLASS[band], size === 'lg' ? 'h-16 w-16' : size === 'sm' ? 'h-10 w-10' : 'h-12 w-12', className)}
      title={`Grill Score ${score}/100`}
      aria-label={`Grill Score ${score} out of 100, ${band}`}
      data-band={band}
    >
      <span className={cn('font-bold tabular-nums leading-none', size === 'lg' ? 'text-2xl' : 'text-lg')}>{score}</span>
      {size !== 'sm' && <span className="mt-1 font-mono text-[9px] uppercase leading-none tracking-wider opacity-90">Grill</span>}
    </div>
  );
}
