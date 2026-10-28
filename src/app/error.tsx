'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { RefreshCw, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Shown when a page fails to load, instead of the framework's bare error page.
export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-6 py-16 text-center">
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-warning/15 text-warning"><TriangleAlert className="h-6 w-6" /></span>
      <h1 className="text-[22px] font-semibold">This page did not load</h1>
      <p className="text-sm leading-6 text-muted-foreground">Usually the database or the network was slow for a moment. Try again; your saved work is safe.</p>
      <div className="flex gap-2">
        <Button onClick={reset}><RefreshCw /> Try again</Button>
        <Button variant="outline" asChild><Link href="/">Go home</Link></Button>
      </div>
      {error.digest && <p className="meta">Error code {error.digest}</p>}
    </div>
  );
}
