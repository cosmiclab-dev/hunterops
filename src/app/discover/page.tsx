import { PageHeader } from '@/components/kit';
import { DiscoverPanel } from '@/components/discover-panel';

export default function DiscoverPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Discover"
        sub="Catch postings on company ATS boards hours before they reach LinkedIn, and find the people hiring."
      />
      <DiscoverPanel />
    </div>
  );
}
