'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Briefcase, Settings, User } from 'lucide-react';
import { cn } from '@/lib/utils';

const ITEMS = [
  { href: '/', label: 'Board', icon: Briefcase, match: (p: string) => p === '/' || p.startsWith('/jobs') },
  { href: '/profile', label: 'Profile', icon: User, match: (p: string) => p.startsWith('/profile') },
  { href: '/settings', label: 'Settings', icon: Settings, match: (p: string) => p.startsWith('/settings') },
];

// Top bar on desktop, bottom tab bar on iPhone (thumb reach, safe-area aware).
export function Nav() {
  const pathname = usePathname();
  if (pathname === '/login') return null;
  return (
    <>
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-12 max-w-3xl items-center justify-between px-4 md:px-8">
          <Link href="/" className="font-bold tracking-tight">HunterOps</Link>
          <nav className="hidden gap-6 md:flex">
            {ITEMS.map((i) => (
              <Link key={i.href} href={i.href} className={cn('label-caps', i.match(pathname) ? 'underline underline-offset-4' : 'opacity-70 hover:opacity-100')}>
                {i.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden">
        <div className="grid grid-cols-3">
          {ITEMS.map((i) => (
            <Link key={i.href} href={i.href} className={cn('flex h-14 flex-col items-center justify-center gap-1', i.match(pathname) ? '' : 'opacity-50')}>
              <i.icon className="h-5 w-5" />
              <span className="font-mono text-[10px] uppercase tracking-wider">{i.label}</span>
            </Link>
          ))}
        </div>
      </nav>
    </>
  );
}
