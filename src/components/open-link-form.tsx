'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

// Paste a job link and open it in the in-app Browser.
export function OpenLinkForm({ placeholder = 'https://jobs.lever.co/company/…' }: { placeholder?: string }) {
  const router = useRouter();
  const [url, setUrl] = useState('');
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const v = url.trim();
        if (v) router.push(`/browser?url=${encodeURIComponent(/^https?:\/\//i.test(v) ? v : `https://${v}`)}`);
      }}
    >
      <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={placeholder} aria-label="Job link" inputMode="url" className="flex-1" />
      <Button type="submit"><ArrowRight /> Open</Button>
    </form>
  );
}
