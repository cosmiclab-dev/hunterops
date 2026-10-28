'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogOut, Radar, Settings } from 'lucide-react';
import { MAIN, MORE, MORE_TAB, type Item } from '@/components/nav-items';
import { ThemeButton } from '@/components/theme-toggle';
import { cn } from '@/lib/utils';

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
        'flex h-10 items-center gap-3 rounded-full px-3.5 text-[15px] tracking-[-0.016em] transition-[transform,colors] active:scale-[0.97]',
        on ? 'bg-primary/[0.1] font-semibold text-primary' : 'text-foreground/80 hover:bg-foreground/[0.05] hover:text-foreground',
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
      <aside className="glass-float fixed inset-y-3 left-3 z-40 hidden w-60 flex-col overflow-hidden rounded-[26px] lg:flex" aria-label="Sidebar">
        <div className="flex h-14 items-center px-4">
          <Link href="/" aria-label="HunterOps home"><Logo /></Link>
        </div>
        <nav className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 py-2" aria-label="Main">
          <div className="flex flex-col gap-0.5">
            <p className="label-caps px-3.5 pb-1.5">Workspace</p>
            {MAIN.map((i) => <SideLink key={i.href} item={i} pathname={pathname} />)}
          </div>
          <div className="flex flex-col gap-0.5">
            <p className="label-caps px-3.5 pb-1.5">Tools</p>
            {MORE.map((i) => <SideLink key={i.href} item={i} pathname={pathname} />)}
          </div>
        </nav>
        <div className="flex items-center justify-between border-t border-black/[0.06] px-3 py-3 dark:border-white/[0.08]">
          <ThemeButton />
          <button type="button" onClick={signOut} className="inline-flex h-9 items-center gap-2 rounded-full px-3 text-sm text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground">
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </aside>

      <header className="glass sticky top-0 z-40 border-b border-black/[0.06] pt-[env(safe-area-inset-top)] dark:border-white/[0.08] lg:hidden">
        <div className="flex h-12 items-center gap-2 px-4">
          <Link href="/" aria-label="HunterOps home"><Logo /></Link>
          <Link href="/settings" aria-label="Settings" className={cn('ml-auto inline-flex h-10 w-10 items-center justify-center rounded-full transition-colors', pathname.startsWith('/settings') ? 'text-primary' : 'text-foreground/70 hover:text-foreground')}>
            <Settings className="h-[19px] w-[19px]" />
          </Link>
        </div>
      </header>
      {/* Liquid Glass tab bar: a floating capsule above the home indicator. */}
      <nav className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(env(safe-area-inset-bottom),10px)] lg:hidden" aria-label="Tabs">
        <div className="glass-float mx-auto grid max-w-md grid-cols-5 rounded-full p-1.5">
          {[...MAIN, MORE_TAB].map((i) => {
            const on = i.match(pathname);
            return (
              <Link key={i.href} href={i.href} className={cn('flex h-[54px] min-w-0 flex-col items-center justify-center gap-0.5 rounded-full transition-[transform,colors] active:scale-95', on ? 'bg-white/70 text-primary shadow-[inset_0_1px_0_rgb(255_255_255/0.9),0_1px_3px_rgb(0_0_0/0.08)] dark:bg-white/[0.12] dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.12)]' : 'text-foreground/75')} aria-current={on ? 'page' : undefined}>
                <i.icon className="h-[21px] w-[21px]" strokeWidth={on ? 2.3 : 1.9} />
                <span className="max-w-full truncate px-0.5 text-[10px] font-semibold leading-3 tracking-normal">{i.label}</span>
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
    <div className="min-w-0 lg:pl-[264px]">
      <main className={cn('mx-auto w-full min-w-0 px-4 pb-32 pt-6 md:px-6 lg:px-10 lg:pb-14 lg:pt-10', wide ? 'max-w-none' : 'max-w-6xl')}>{children}</main>
    </div>
  );
}
