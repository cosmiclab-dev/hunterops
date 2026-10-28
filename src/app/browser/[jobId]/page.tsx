import { notFound } from 'next/navigation';
import { BrowserView } from '@/components/browser-view';

export const dynamic = 'force-dynamic';

export default function BrowserJobPage({ params, searchParams }: { params: { jobId: string }; searchParams: { view?: string } }) {
  if (!/^[0-9a-f-]{36}$/i.test(params.jobId)) notFound();
  return <BrowserView jobId={params.jobId} initialView={searchParams.view === 'apply' ? 'apply' : undefined} />;
}
