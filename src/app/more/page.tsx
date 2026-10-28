import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { IconChip, PageHeader } from '@/components/kit';
import { MORE } from '@/components/nav-items';

// The phone's fifth tab: every tool that is not part of the daily loop.
export default function MorePage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="More" />
      <div className="surface divide-y overflow-hidden p-0">
        {MORE.map((i) => (
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
    </div>
  );
}
