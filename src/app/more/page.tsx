import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { IconChip, PageHeader } from '@/components/kit';
import { GROUPS } from '@/components/nav-items';

// Every page in HunterOps, grouped the way the tabs are.
export default function MorePage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="All pages" />
      {GROUPS.map((g) => (
        <section key={g.id} className="flex flex-col gap-2">
          <h2 className="px-4 text-[13px] uppercase tracking-[0.02em] text-muted-foreground">{g.label}</h2>
          <div className="surface divide-y overflow-hidden p-0">
            {g.items.filter((i) => i.href !== '/more').map((i) => (
              <Link key={i.href} href={i.href} className="flex items-center gap-3 px-4 py-3.5 active:bg-muted/60">
                <IconChip icon={i.icon} />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{i.label}</span>
                  <span className="block text-sm leading-5 text-muted-foreground">{i.blurb}</span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
