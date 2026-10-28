'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api-client';
import { Logo } from '@/components/nav';

function LoginForm() {
  const params = useSearchParams();
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      await api('/api/auth/login', { method: 'POST', json: { password } });
      const next = params.get('next');
      window.location.href = safeNext(next);
    } catch (e2) {
      setErr((e2 as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="surface hero-glow mx-auto mt-16 flex max-w-sm flex-col gap-5 p-6">
      <div className="flex flex-col gap-2">
        <Logo />
        <p className="text-sm text-muted-foreground">Recruiter command center. Sign in to continue.</p>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="pw">Password</Label>
        <Input id="pw" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus />
      </div>
      <Button type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</Button>
      {err && <p className="text-sm text-destructive" role="alert">{err}</p>}
    </form>
  );
}

// Only return to a page on this site: "/\\evil.com" or "/\t/evil.com" would leave it.
function safeNext(next: string | null) {
  if (!next || !/^\/[^/\\]/.test(next)) return '/';
  try {
    const u = new URL(next, window.location.origin);
    return u.origin === window.location.origin ? u.pathname + u.search + u.hash : '/';
  } catch {
    return '/';
  }
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}
