import { redirect } from 'next/navigation';

// Outreach moved into the Mailroom.
export default function OutreachPage({ searchParams }: { searchParams: { tab?: string; jobId?: string } }) {
  const tab = searchParams.tab === 'write' || !searchParams.tab ? 'linkedin' : searchParams.tab;
  redirect(`/mailroom?tab=${tab}${searchParams.jobId ? `&jobId=${encodeURIComponent(searchParams.jobId)}` : ''}`);
}
