import { NextResponse } from 'next/server';
import { HttpError, readJson, route } from '@/lib/http';
import { safeEqual } from '@/lib/crypto';
import { SESSION_COOKIE, SESSION_MAX_AGE, makeSession, passwordRequired } from '@/lib/session';

export const POST = route(async (req: Request) => {
  const { password } = await readJson<{ password?: string }>(req);
  if (!passwordRequired()) return NextResponse.json({ ok: true });
  if (typeof password !== 'string' || !safeEqual(password, process.env.APP_PASSWORD as string)) {
    await new Promise((r) => setTimeout(r, 600)); // slow down guessing
    throw new HttpError(401, 'Wrong password.');
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await makeSession(), {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: SESSION_MAX_AGE,
  });
  return res;
});
