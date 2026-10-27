'use client';

import { useEffect, useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { applyTheme, readTheme, saveTheme, type ThemePref } from '@/lib/theme';
import { cn } from '@/lib/utils';

const OPTIONS: { value: ThemePref; label: string; icon: typeof Sun }[] = [
  { value: 'system', label: 'Auto', icon: Monitor },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
];

function useTheme() {
  const [pref, setPref] = useState<ThemePref>('system');
  useEffect(() => {
    setPref(readTheme());
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => { if (readTheme() === 'system') applyTheme('system'); };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return [pref, (p: ThemePref) => { saveTheme(p); setPref(p); }] as const;
}

// Header button: cycles Auto → Light → Dark.
export function ThemeButton({ className }: { className?: string }) {
  const [pref, set] = useTheme();
  const i = OPTIONS.findIndex((o) => o.value === pref);
  const cur = OPTIONS[i < 0 ? 0 : i];
  const next = OPTIONS[(i + 1) % OPTIONS.length];
  return (
    <button
      type="button"
      onClick={() => set(next.value)}
      className={cn('inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground', className)}
      aria-label={`Theme: ${cur.label}. Switch to ${next.label}`}
      title={`Theme: ${cur.label}`}
    >
      <cur.icon className="h-4 w-4" />
    </button>
  );
}

// Segmented control for the Settings page.
export function ThemeSwitch() {
  const [pref, set] = useTheme();
  return (
    <div className="inline-flex rounded-full border bg-muted p-1" role="radiogroup" aria-label="Theme">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={pref === o.value}
          onClick={() => set(o.value)}
          className={cn(
            'inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition-colors',
            pref === o.value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground',
          )}
        >
          <o.icon className="h-4 w-4" /> {o.label}
        </button>
      ))}
    </div>
  );
}
