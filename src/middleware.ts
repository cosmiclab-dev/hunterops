import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, passwordRequired, verifySession } from '@/lib/session';

// Everything is private when APP_PASSWORD is set. The cron route checks its own
// CRON_SECRET, and the login page and endpoint must stay reachable.
const PUBLIC = [/^\/login$/, /^\/api\/auth\//, /^\/api\/cron\//, /^\/api\/health$/];

export async function middleware(req: NextRequest) {
  if (!passwordRequired()) return NextResponse.next();
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((re) => re.test(pathname))) return NextResponse.next();
  if (await verifySession(req.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();
  if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = pathname === '/' ? '' : `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest|apple-icon.png).*)'],
};
