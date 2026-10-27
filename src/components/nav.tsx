'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Briefcase, Columns3, Home, Radar, Send, Settings, UserRound } from 'lucide-react';
import { ThemeButton } from '@/components/theme-toggle';
import { cn } from '@/lib/utils';

const ITEMS = [
  { href: '/', label: 'Home', icon: Home, match: (p: string) => p === '/' },
  { href: '/jobs', label: 'Jobs', icon: Briefcase, match: (p: string) => p.startsWith('/jobs') },
  { href: '/discover', label: 'Discover', icon: Radar, match: (p: string) => p.startsWith('/discover') },
  { href: '/pipeline', label: 'Pipeline', icon: Columns3, match: (p: string) => p.startsWith('/pipeline') },
  { href: '/outreach', label: 'Outreach', icon: Send, match: (p: string) => p.startsWith('/outreach') },
];

export function Logo() {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-primary to-info text-primary-foreground shadow-sm">
        <Radar className="h-4 w-4" strokeWidth={2.5} />
      </span>
      <span className="text-[17px] font-extrabold tracking-tight">Hunter<span className="text-primary">Ops</span></span>
    </span>
  );
}

// Top bar everywhere; five-tab bar at the bottom on iPhone (thumb reach, safe-area aware).
export function Nav() {
  const pathname = usePathname();
  if (pathname === '/login') return null;
  return (
    <>
      <header className="sticky top-0 z-40 border-b bg-background/80 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-6 px-4 md:px-8">
          <Link href="/" aria-label="HunterOps home"><Logo /></Link>
          <nav className="hidden flex-1 gap-1 md:flex">
            {ITEMS.map((i) => (
              <Link
                key={i.href}
                href={i.href}
                className={cn(
                  'inline-flex h-9 items-center gap-2 rounded-full px-3 text-sm font-medium transition-colors',
                  i.match(pathname) ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <i.icon className="h-4 w-4" /> {i.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <ThemeButton />
            <Link
              href="/profile"
              aria-label="Profile"
              className={cn('inline-flex h-9 w-9 items-center justify-center rounded-full border bg-card transition-colors', pathname.startsWith('/profile') ? 'border-primary text-primary' : 'text-muted-foreground hover:text-foreground')}
            >
              <UserRound className="h-4 w-4" />
            </Link>
            <Link
              href="/settings"
              aria-label="Settings"
              className={cn('inline-flex h-9 w-9 items-center justify-center rounded-full border bg-card transition-colors', pathname.startsWith('/settings') ? 'border-primary text-primary' : 'text-muted-foreground hover:text-foreground')}
            >
              <Settings className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </header>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden" aria-label="Main">
        <div className="grid grid-cols-5">
          {ITEMS.map((i) => {
            const on = i.match(pathname);
            return (
              <Link key={i.href} href={i.href} className={cn('flex h-16 flex-col items-center justify-center gap-1 transition-colors', on ? 'text-primary' : 'text-muted-foreground')} aria-current={on ? 'page' : undefined}>
                <span className={cn('grid h-7 w-12 place-items-center rounded-full transition-colors', on && 'bg-primary/10')}>
                  <i.icon className="h-5 w-5" strokeWidth={on ? 2.4 : 2} />
                </span>
                <span className="text-[10px] font-semibold tracking-wide">{i.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
