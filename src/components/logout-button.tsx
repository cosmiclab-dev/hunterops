'use client';

import { Button } from '@/components/ui/button';

export function LogoutButton() {
  return (
    <Button size="sm" variant="ghost" onClick={async () => {
      await fetch('/api/auth/logout', { method: 'POST' });
      window.location.href = '/login';
    }}>Sign out</Button>
  );
}
