import { PageHeader } from '@/components/kit';
import { DiscoverPanel } from '@/components/discover-panel';

export default function DiscoverPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Discover"
        sub="Find new postings before they reach LinkedIn, and the people hiring."
      />
      <DiscoverPanel />
    </div>
  );
}
