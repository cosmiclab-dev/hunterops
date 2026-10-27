'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Briefcase, Columns3, Globe, Home, LogOut, Mail, Radar, Settings, UserRound } from 'lucide-react';
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
  { href: '/profile', label: 'Profile', icon: UserRound, match: (p) => p.startsWith('/profile') },
  { href: '/settings', label: 'Settings', icon: Settings, match: (p) => p.startsWith('/settings') },
];

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="grid h-7 w-7 place-items-center rounded-md bg-foreground text-background">
        <Radar className="h-4 w-4" strokeWidth={2.5} />
      </span>
      {!compact && <span className="text-[15px] font-semibold tracking-tight">HunterOps</span>}
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
        'flex h-9 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors',
        on ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
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

      <header className="sticky top-0 z-40 border-b bg-background/90 pt-[env(safe-area-inset-top)] backdrop-blur lg:hidden">
        <div className="flex h-14 items-center gap-2 px-4">
          <Link href="/" aria-label="HunterOps home"><Logo /></Link>
          <div className="ml-auto flex items-center gap-1">
            <ThemeButton />
            {MORE.map((i) => (
              <Link
                key={i.href}
                href={i.href}
                aria-label={i.label}
                className={cn('inline-flex h-9 w-9 items-center justify-center rounded-md transition-colors', i.match(pathname) ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground')}
              >
                <i.icon className="h-4 w-4" />
              </Link>
            ))}
          </div>
        </div>
      </header>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" aria-label="Tabs">
        <div className="grid grid-cols-5">
          {MAIN.map((i) => {
            const on = i.match(pathname);
            return (
              <Link key={i.href} href={i.href} className={cn('flex h-16 flex-col items-center justify-center gap-1', on ? 'text-foreground' : 'text-muted-foreground')} aria-current={on ? 'page' : undefined}>
                <i.icon className="h-5 w-5" strokeWidth={on ? 2.4 : 2} />
                <span className="text-[10px] font-medium">{i.label}</span>
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
    <div className="lg:pl-60">
      <main className={cn('mx-auto w-full px-4 pb-28 pt-5 md:px-6 lg:px-8 lg:pb-12 lg:pt-8', wide ? 'max-w-none' : 'max-w-6xl')}>{children}</main>
    </div>
  );
}
