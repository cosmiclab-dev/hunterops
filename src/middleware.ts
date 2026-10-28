import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, passwordRequired, verifySession } from '@/lib/session';

// Everything is private when APP_PASSWORD is set. The cron route checks its own
// CRON_SECRET, and the login page and endpoint must stay reachable.
const PUBLIC = [/^\/login$/, /^\/api\/auth\//, /^\/api\/cron\//, /^\/api\/health$/];

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// A browser always sends Origin on cross-site writes; refuse any that is not ours.
function crossSiteWrite(req: NextRequest) {
  if (SAFE_METHODS.has(req.method) || !req.nextUrl.pathname.startsWith('/api/')) return false;
  const origin = req.headers.get('origin');
  if (!origin) return false;
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
  try {
    return new URL(origin).host !== host;
  } catch {
    return true;
  }
}

export async function middleware(req: NextRequest) {
  if (crossSiteWrite(req)) return NextResponse.json({ error: 'Request blocked: it came from another site.' }, { status: 403 });
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
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|sw.js|manifest.webmanifest|apple-icon.png).*)'],
};
