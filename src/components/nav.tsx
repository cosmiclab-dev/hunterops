'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Briefcase, Columns3, Globe, Home, Lightbulb, LogOut, Mail, Radar, Settings, UserRound } from 'lucide-react';
import { ThemeButton } from '@/components/theme-toggle';
import { cn } from '@/lib/utils';

type Item = { href: string; label: string; icon: typeof Home; match: (p: string) => boolean };

const MAIN: Item[] = [
  { href: '/', label: 'Home', icon: Home, match: (p) => p === '/' },
  { href: '/discover', label: 'Discover', icon: Radar, match: (p) => p.startsWith('/discover') },
  { href: '/pipeline', label: 'Pipeline', icon: Columns3, match: (p) => p.startsWith('/pipeline') },
  { href: '/browser', label: 'Browser', icon: Globe, match: (p) => p.startsWith('/browser') },
  { href: '/mailroom', label: 'Mailroom', icon: Mail, match: (p) => p.startsWith('/mailroom') || p.startsWith('/outreach') },
];
const MORE: Item[] = [
  { href: '/jobs', label: 'All jobs', icon: Briefcase, match: (p) => p.startsWith('/jobs') },
  { href: '/insights', label: 'Insights', icon: Lightbulb, match: (p) => p.startsWith('/insights') },
  { href: '/profile', label: 'Profile', icon: UserRound, match: (p) => p.startsWith('/profile') },
  { href: '/settings', label: 'Settings', icon: Settings, match: (p) => p.startsWith('/settings') },
];

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="grid h-7 w-7 place-items-center rounded-[8px] bg-foreground text-background">
        <Radar className="h-4 w-4" strokeWidth={2.5} />
      </span>
      {!compact && <span className="text-[17px] font-semibold tracking-[-0.02em]">HunterOps</span>}
    </span>
  );
}

function SideLink({ item, pathname }: { item: Item; pathname: string }) {
  const on = item.match(pathname);
  return (
    <Link
      href={item.href}
      aria-current={on ? 'page' : undefined}
      className={cn(
        'flex h-9 items-center gap-3 rounded-[10px] px-3 text-[15px] transition-colors',
        on ? 'bg-card font-medium text-primary' : 'text-foreground/80 hover:bg-card/60 hover:text-foreground',
      )}
    >
      <item.icon className="h-4 w-4" />
      {item.label}
    </Link>
  );
}

async function signOut() {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/login';
}

// Fixed left sidebar on laptops; top bar plus a five-tab bottom bar on phones.
export function Nav() {
  const pathname = usePathname();
  if (pathname === '/login') return null;
  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r bg-sidebar lg:flex" aria-label="Sidebar">
        <div className="flex h-14 items-center px-4">
          <Link href="/" aria-label="HunterOps home"><Logo /></Link>
        </div>
        <nav className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 py-2" aria-label="Main">
          <div className="flex flex-col gap-0.5">
            <p className="px-3 pb-1 text-xs font-medium text-muted-foreground">Workspace</p>
            {MAIN.map((i) => <SideLink key={i.href} item={i} pathname={pathname} />)}
          </div>
          <div className="flex flex-col gap-0.5">
            <p className="px-3 pb-1 text-xs font-medium text-muted-foreground">Library</p>
            {MORE.map((i) => <SideLink key={i.href} item={i} pathname={pathname} />)}
          </div>
        </nav>
        <div className="flex items-center justify-between border-t px-3 py-3">
          <ThemeButton />
          <button type="button" onClick={signOut} className="inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm text-muted-foreground hover:bg-accent hover:text-foreground">
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </aside>

      <header className="glass sticky top-0 z-40 border-b border-border/60 pt-[env(safe-area-inset-top)] lg:hidden">
        <div className="flex h-12 items-center gap-2 px-4">
          <Link href="/" aria-label="HunterOps home"><Logo /></Link>
          <div className="ml-auto flex items-center">
            {MORE.map((i) => (
              <Link
                key={i.href}
                href={i.href}
                aria-label={i.label}
                className={cn('inline-flex h-10 w-10 items-center justify-center rounded-full transition-colors', i.match(pathname) ? 'text-primary' : 'text-foreground/70 hover:text-foreground')}
              >
                <i.icon className="h-[19px] w-[19px]" />
              </Link>
            ))}
          </div>
        </div>
      </header>
      {/* Liquid Glass tab bar: a floating capsule above the home indicator. */}
      <nav className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(env(safe-area-inset-bottom),10px)] lg:hidden" aria-label="Tabs">
        <div className="glass-float mx-auto grid max-w-md grid-cols-5 rounded-full p-1">
          {MAIN.map((i) => {
            const on = i.match(pathname);
            return (
              <Link key={i.href} href={i.href} className={cn('flex h-[52px] min-w-0 flex-col items-center justify-center gap-0.5 rounded-full transition-colors', on ? 'bg-foreground/[0.07] text-primary' : 'text-foreground/70')} aria-current={on ? 'page' : undefined}>
                <i.icon className="h-[21px] w-[21px]" strokeWidth={on ? 2.3 : 1.9} />
                <span className="max-w-full truncate px-0.5 text-[10px] font-medium leading-3 tracking-normal">{i.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}

// Page frame: leaves room for the sidebar and the phone tab bar. The Browser
// uses the full width.
export function Frame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === '/login') return <main>{children}</main>;
  const wide = /^\/(browser|pipeline)/.test(pathname);
  return (
    <div className="min-w-0 lg:pl-60">
      <main className={cn('mx-auto w-full min-w-0 px-4 pb-32 pt-6 md:px-6 lg:px-10 lg:pb-14 lg:pt-10', wide ? 'max-w-none' : 'max-w-6xl')}>{children}</main>
    </div>
  );
}
